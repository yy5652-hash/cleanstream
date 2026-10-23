import { useEffect, useRef, useState } from 'react'
import { itemName } from '../items'
import { classify, useModel } from '../model/client'
import { answer, binById, type Answer, type Pack } from '../rules'
import { today, useTally } from '../store'
import { Can, pct, sampleUrl, useSamples } from '../ui'

type Source = 'off' | 'camera' | 'demo'

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

export default function Station({ pack }: { pack: Pack }) {
  const model = useModel()
  const samples = useSamples()
  const [source, setSource] = useState<Source>('off')
  const [ans, setAns] = useState<Answer | null>(null)
  const [frame, setFrame] = useState<string | null>(null)
  const [tally, setTally] = useTally()
  const video = useRef<HTMLVideoElement>(null)
  const busy = useRef(false)
  const day = today()
  const counts = tally[day] ?? {}

  const run = async (src: Blob | HTMLVideoElement) => {
    if (busy.current || model.status !== 'ready') return
    busy.current = true
    try {
      const r = await classify(src)
      const a = answer(pack, model.classes, r.probs)
      setAns(a)
      if (a.sure) {
        const bin = a.bins[0].bin.id
        setTally((t) => ({ ...t, [day]: { ...(t[day] ?? {}), [bin]: (t[day]?.[bin] ?? 0) + 1 } }))
      }
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
          if (shown) setAns(null)
          shown = false
          if (still > 8) empty = sig // the empty view drifted (light changed): follow it
        } else if (still >= 2 && !shown) {
          shown = true
          run(v)
        }
      }, 250)
    }).catch(() => setSource('off'))
    return () => (clearInterval(timer), stream?.getTracks().forEach((t) => t.stop()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, pack, model.status])

  // demo feed: steps through held-out test photos
  useEffect(() => {
    if (source !== 'demo' || !samples.length || model.status !== 'ready') return
    let i = 0
    let stop = false
    const step = async () => {
      if (stop) return
      const s = samples[i++ % samples.length]
      setFrame(sampleUrl(s))
      setAns(null)
      const blob = await fetch(sampleUrl(s)).then((r) => r.blob())
      await new Promise((r) => setTimeout(r, 700))
      if (!stop) await run(blob)
      setTimeout(step, 2600)
    }
    step()
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, samples, pack, model.status])

  const top = ans?.bins[0]
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <>
      <div className="lede">
        <div>
          <h1>Bin station</h1>
          <p>Mount any old tablet or phone above a set of bins. People hold up an item and the right bin lights up. Only counts are kept, never pictures.</p>
        </div>
        <div className="seg">
          <button className={source === 'camera' ? 'on' : ''} onClick={() => setSource('camera')}>Camera</button>
          <button className={source === 'demo' ? 'on' : ''} onClick={() => setSource('demo')}>Demo feed</button>
          <button className={source === 'off' ? 'on' : ''} onClick={() => (setSource('off'), setAns(null))}>Off</button>
        </div>
      </div>
      <div className="station">
        <div className="feed">
          {source === 'camera' && <video ref={video} autoPlay playsInline muted />}
          {source === 'demo' && frame && <img src={frame} alt="Demo feed frame" />}
          {source === 'off' && <div style={{ color: '#9fb0aa' }}>Choose Camera, or Demo feed to step through test photos.</div>}
          {source === 'demo' && <span className="chip" style={{ position: 'absolute', top: 12, left: 12, background: '#000a', color: '#fff' }}>Demo feed: held-out test photos</span>}
          {top && (
            <div className="callout" style={{ background: ans!.sure ? top.bin.color : '#f6e7c8', color: ans!.sure ? top.bin.ink : '#4a2a05' }}>
              {ans!.sure ? <Can bin={top.bin} size={40} /> : null}
              <div>
                {ans!.sure ? top.bin.name : 'Not sure: please check the sign'}
                <small>{itemName(ans!.items[0].id)} · {pct(top.p)} sure of the bin</small>
              </div>
              {ans!.sure && pack.items[ans!.items[0].id].prep[0] ? <small style={{ marginLeft: 'auto', maxWidth: 260, textAlign: 'right' }}>{pack.items[ans!.items[0].id].prep[0]}</small> : null}
            </div>
          )}
        </div>
        <div className="bins" style={{ gridTemplateColumns: `repeat(${pack.bins.length}, 1fr)` }}>
          {pack.bins.map((b) => (
            <div key={b.id} className={`slot${ans?.sure && top?.bin.id === b.id ? ' lit' : ''}`} style={{ background: b.color, color: b.ink }}>
              <Can bin={binById(pack, b.id)} size={34} />
              <strong>{b.name}</strong>
              <span className="n">{counts[b.id] ?? 0} today</span>
            </div>
          ))}
        </div>
        <div className="bar">
          <span>{model.status === 'ready' ? `${total} items guided today at this station` : 'Loading the model…'}</span>
          <span>Runs offline in the browser · {pack.name} rules</span>
        </div>
      </div>
    </>
  )
}
