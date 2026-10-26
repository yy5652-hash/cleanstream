import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { itemName } from '../items'
import { classify, useModel } from '../model/client'
import { answer, binById, type Answer, type Bin, type Pack } from '../rules'
import { today, useTally } from '../store'
import { Can, Logo, sampleUrl, useSamples } from '../ui'

type Source = 'off' | 'camera' | 'demo'
type Phase = 'idle' | 'looking' | 'result' | 'thanks'

const GREETINGS = ['Hi!', '¡Hola!', '你好!', 'Bonjour!', 'Ciao!', '안녕하세요!', 'Olá!', 'Hallo!']
// items people most often get wrong, shown as "did you know" tips while the station waits
const TIPS = ['paper_cup', 'plastic_bag_film', 'pizza_box', 'carton', 'battery', 'foam', 'snack_wrapper', 'aluminum_foil', 'soiled_paper']
const RESULT_MS = 3600
const THANKS_MS = 1400

// Small grey thumbnail of a frame, for cheap motion and presence checks.
function signature(v: HTMLVideoElement, c: HTMLCanvasElement): Float32Array | null {
  if (!v.videoWidth) return null
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(v, 0, 0, 24, 18)
  const d = ctx.getImageData(0, 0, 24, 18).data
  const out = new Float32Array(24 * 18)
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765
  return out
}
const diff = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / a.length

function snapshot(v: HTMLVideoElement): string {
  const c = document.createElement('canvas')
  const s = Math.min(v.videoWidth, v.videoHeight)
  c.width = c.height = 320
  c.getContext('2d')!.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, 320, 320)
  return c.toDataURL('image/jpeg', 0.8)
}

// Which bins stand at this station, left to right. Kept per city in this browser.
function useStationBins(pack: Pack): [string[], (ids: string[]) => void] {
  const key = `cleanstream.station.bins.${pack.id}`
  const all = pack.bins.map((b) => b.id)
  const [ids, setIds] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? 'null') as string[] | null
      return v?.filter((id) => all.includes(id)).length ? v.filter((id) => all.includes(id)) : all.filter((id) => binById(pack, id).kind !== 'special')
    } catch {
      return all.filter((id) => binById(pack, id).kind !== 'special')
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(ids))
    } catch {
      /* ignore */
    }
  }, [key, ids])
  return [ids, setIds]
}

function Rotating({ items, every, render }: { items: string[]; every: number; render: (s: string) => ReactNode }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % items.length), every)
    return () => clearInterval(t)
  }, [items.length, every])
  return <span key={i} className="k-rot">{render(items[i % items.length])}</span>
}

// `full`: the kiosk alone, filling the window (the ?kiosk URL a station tablet keeps open)
export default function Station({ pack, full = false, start = 'off', wait = 0 }: { pack: Pack; full?: boolean; start?: Source; wait?: number }) {
  const model = useModel()
  const samples = useSamples()
  const [source, setSource] = useState<Source>(start)
  const [phase, setPhase] = useState<Phase>('idle')
  const [ans, setAns] = useState<Answer | null>(null)
  const [shot, setShot] = useState<string | null>(null)
  const [frame, setFrame] = useState<string | null>(null)
  const [settings, setSettings] = useState(false)
  const [binIds, setBinIds] = useStationBins(pack)
  const [tally, setTally] = useTally()
  const video = useRef<HTMLVideoElement>(null)
  const kiosk = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const timers = useRef<number[]>([])
  const day = today()
  const counts = tally[day] ?? {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const bins = binIds.map((id) => binById(pack, id))
  const tips = useMemo(() => TIPS.filter((id) => pack.items[id]), [pack])

  const later = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms))
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const run = async (src: Blob | HTMLVideoElement, picture: string) => {
    if (busy.current || model.status !== 'ready') return
    busy.current = true
    clearTimers()
    setShot(picture)
    setPhase('looking')
    try {
      const r = await classify(src)
      const a = answer(pack, model.classes, r.probs)
      setAns(a)
      setPhase('result')
      if (a.sure) {
        const bin = a.bins[0].bin.id
        setTally((t) => ({ ...t, [day]: { ...(t[day] ?? {}), [bin]: (t[day]?.[bin] ?? 0) + 1 } }))
      }
      later(RESULT_MS, () => {
        setPhase(a.sure ? 'thanks' : 'idle')
        later(THANKS_MS, () => setPhase('idle'))
      })
    } finally {
      busy.current = false
    }
  }

  // camera: scan automatically when something new is held still in front of the empty view
  useEffect(() => {
    if (source !== 'camera') return
    let stream: MediaStream | null = null
    let timer = 0
    const c = document.createElement('canvas')
    c.width = 24
    c.height = 18
    let empty: Float32Array | null = null
    let prev: Float32Array | null = null
    let still = 0
    let shown = false
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } }).then((s) => {
      stream = s
      if (video.current) video.current.srcObject = s
      timer = window.setInterval(() => {
        const v = video.current
        const sig = v && signature(v, c)
        if (!v || !sig) return
        if (!empty) empty = sig
        const present = diff(sig, empty) > 0.06
        still = prev && diff(sig, prev) < 0.012 ? still + 1 : 0
        prev = sig
        if (!present) {
          shown = false
          if (still > 8) empty = sig // the empty view drifted (light changed): follow it
        } else if (still >= 2 && !shown) {
          shown = true
          run(v, snapshot(v))
        }
      }, 250)
    }).catch(() => setSource('off'))
    return () => (clearInterval(timer), stream?.getTracks().forEach((t) => t.stop()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, pack, model.status])

  // demo feed: steps through held-out test photos, with idle time between them like a real station
  useEffect(() => {
    if (source !== 'demo' || !samples.length || model.status !== 'ready') return
    let i = 0
    let stop = false
    const step = async () => {
      if (stop) return
      const s = samples[i++ % samples.length]
      setFrame(sampleUrl(s))
      const blob = await fetch(sampleUrl(s)).then((r) => r.blob())
      await new Promise((r) => setTimeout(r, 500))
      if (!stop) await run(blob, sampleUrl(s))
      setTimeout(step, RESULT_MS + THANKS_MS + 1600)
    }
    const first = window.setTimeout(step, wait)
    return () => {
      stop = true
      clearTimeout(first)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, samples, pack, model.status])

  useEffect(() => () => clearTimers(), [])

  const top = ans?.bins[0]
  const target = phase === 'result' && ans?.sure ? top!.bin : null
  const here = target && binIds.includes(target.id)
  const item = ans ? ans.items[0].id : null
  const rule = item ? pack.items[item] : null

  const fullscreen = () => kiosk.current?.requestFullscreen?.().catch(() => {})

  return (
    <>
      {!full && <div className="lede">
        <div>
          <h1>Bin station</h1>
          <p>Put any old tablet or phone above your bins. People hold up an item and the right bin lights up, in your city's rules. It runs offline and keeps counts, never pictures.</p>
        </div>
        <div className="row">
          <div className="seg">
            <button className={source === 'camera' ? 'on' : ''} onClick={() => setSource('camera')}>Camera</button>
            <button className={source === 'demo' ? 'on' : ''} onClick={() => setSource('demo')}>Demo feed</button>
            <button className={source === 'off' ? 'on' : ''} onClick={() => (setSource('off'), setPhase('idle'), setAns(null))}>Off</button>
          </div>
          <button className="btn" onClick={() => setSettings(true)}>Set up bins</button>
          <button className="btn primary" onClick={fullscreen}>Full screen</button>
          <a className="btn" href={`${import.meta.env.BASE_URL}?kiosk&source=camera#station`} target="_blank" rel="noreferrer">Kiosk link</a>
        </div>
      </div>}

      <div className={`kiosk${full ? ' full' : ''}`} ref={kiosk} data-phase={phase}>
        <div className="k-top">
          <div className="k-brand"><Logo />Cleanstream</div>
          <div className="k-meta">{pack.name} rules · <b>{total}</b> sorted today{full && <button className="k-gear" onClick={() => setSettings(true)}>Bins</button>}</div>
        </div>

        <div className="k-stage">
          <div className="k-cam">
            {source === 'camera' && <video ref={video} autoPlay playsInline muted />}
            {source === 'demo' && frame && <img src={frame} alt="" />}
            {source === 'off' && <div className="k-off">Choose Camera to start, or Demo feed to step through test photos.</div>}
            <div className="k-frame"><i /><i /><i /><i /></div>
            <div className="k-hint">{source === 'demo' ? 'Demo feed: held-out test photos' : 'Hold your item here'}</div>
          </div>

          <div className={`k-panel k-${phase}${phase === 'result' && !ans?.sure ? ' k-unsure' : ''}`}
            style={target ? { background: target.color, color: target.ink } : undefined}>
            {phase === 'idle' && (
              <div className="k-idle">
                <div className="k-hello">{model.status === 'ready' ? <Rotating items={GREETINGS} every={2200} render={(s) => s} /> : 'Hi!'}</div>
                <div className="k-ask">{model.status === 'ready' ? 'Not sure which bin? Hold it up and I’ll tell you.' : 'Getting ready…'}</div>
                {tips.length > 0 && (
                  <div className="k-tip">
                    <span className="k-tip-label">Did you know?</span>
                    <Rotating items={tips} every={5200} render={(id) => {
                      const b = binById(pack, pack.items[id].bin)
                      return <span className="k-tip-row"><b>{itemName(id)}</b><span className="k-arrow-s">→</span><span className="k-chip" style={{ background: b.color, color: b.ink }}>{b.name}</span></span>
                    }} />
                  </div>
                )}
              </div>
            )}
            {phase === 'looking' && (
              <div className="k-look"><div className="k-spin" /><div>Let me look…</div></div>
            )}
            {phase === 'result' && ans && item && rule && (ans.sure ? (
              <div className="k-res">
                {shot && <img className="k-shot" src={shot} alt="" />}
                <div className="k-item">{itemName(item)}</div>
                <div className="k-goes">goes in the</div>
                <div className="k-bin">{target!.name}</div>
                <div className="k-prep">{here ? rule.prep[0] : `Not in these bins. ${rule.prep[0]}`}</div>
              </div>
            ) : (
              <div className="k-res">
                {shot && <img className="k-shot" src={shot} alt="" />}
                <div className="k-item">Hmm, I’m not sure.</div>
                <div className="k-prep">It could be {itemName(ans.items[0].id).toLowerCase()} or {itemName(ans.items[1].id).toLowerCase()}. Try showing me the label. When in doubt, keep it out of recycling.</div>
              </div>
            ))}
            {phase === 'thanks' && (
              <div className="k-thanks"><div className="k-check">✓</div><div>Thanks for sorting right!</div><small>{total} items sorted here today</small></div>
            )}
          </div>
        </div>

        <div className="k-bins" style={{ gridTemplateColumns: `repeat(${bins.length}, 1fr)` }}>
          {bins.map((b: Bin) => (
            <div key={b.id} className={`k-lid${target?.id === b.id ? ' on' : ''}${target && target.id !== b.id ? ' dim' : ''}`} style={{ background: b.color, color: b.ink }}>
              {target?.id === b.id && <div className="k-down">↓</div>}
              <Can bin={b} size={44} />
              <strong>{b.name}</strong>
              <span>{b.accepts}</span>
              <em>{counts[b.id] ?? 0}</em>
            </div>
          ))}
        </div>
      </div>

      {settings && (
        <div className="pick" onClick={() => setSettings(false)}>
          <div className="card pad" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <h3>Bins at this station</h3>
              <button className="btn small" onClick={() => setSettings(false)}>Done</button>
            </div>
            <p className="small muted" style={{ marginBottom: 12 }}>Tick the bins that stand here and put them in order, left to right, so the arrow points at the right one.</p>
            <div style={{ display: 'grid', gap: 6 }}>
              {[...binIds, ...pack.bins.map((b) => b.id).filter((id) => !binIds.includes(id))].map((id) => {
                const b = binById(pack, id)
                const on = binIds.includes(id)
                const i = binIds.indexOf(id)
                const move = (d: number) => {
                  const next = [...binIds]
                  next.splice(i, 1)
                  next.splice(i + d, 0, id)
                  setBinIds(next)
                }
                return (
                  <div key={id} className="row" style={{ justifyContent: 'space-between', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px' }}>
                    <label className="row" style={{ gap: 8 }}>
                      <input type="checkbox" checked={on} onChange={() => setBinIds(on ? binIds.filter((x) => x !== id) : [...binIds, id])} />
                      <span className="dot" style={{ background: b.color, outline: '1px solid #0002' }} /> <strong className="small">{b.name}</strong>
                    </label>
                    {on && (
                      <span className="row" style={{ gap: 4 }}>
                        <button className="btn small" disabled={i === 0} onClick={() => move(-1)}>←</button>
                        <button className="btn small" disabled={i === binIds.length - 1} onClick={() => move(1)}>→</button>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
