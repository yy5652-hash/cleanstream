// Shared pieces: logo, bin icon and chip, photo input (drop, upload, camera, samples), item picker, result card.
import { useEffect, useRef, useState } from 'react'
import { ITEMS, itemName } from './items'
import { binById, type Answer, type Bin, type Pack } from './rules'

export const pct = (p: number) => `${Math.round(p * 100)}%`

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#0d7a5f" />
      <path d="M7 12c3-3 6-3 9 0s6 3 9 0M7 18c3-3 6-3 9 0s6 3 9 0M7 24c3-3 6-3 9 0s6 3 9 0" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function Can({ bin, size = 56 }: { bin: Bin; size?: number }) {
  return (
    <svg className="can" viewBox="0 0 56 64" width={size} height={(size * 64) / 56} aria-hidden>
      <rect x="4" y="6" width="48" height="9" rx="3" fill={bin.color} stroke={bin.ink} strokeOpacity=".35" strokeWidth="2" />
      <path d="M9 17h38l-3.5 41a4 4 0 0 1-4 3.7H16.5a4 4 0 0 1-4-3.7z" fill={bin.color} stroke={bin.ink} strokeOpacity=".35" strokeWidth="2" />
      <path d="M22 26v26M28 26v26M34 26v26" stroke={bin.ink} strokeOpacity=".45" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="22" y="1.5" width="12" height="6" rx="2" fill={bin.color} stroke={bin.ink} strokeOpacity=".35" strokeWidth="2" />
    </svg>
  )
}

export function BinChip({ bin }: { bin: Bin }) {
  return (
    <span className="chip" style={{ background: bin.color, color: bin.ink }}>
      {bin.name}
    </span>
  )
}

export type Sample = { file: string; label: string; source: string }

export function useSamples(): Sample[] {
  const [s, set] = useState<Sample[]>([])
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}samples/samples.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then(set)
      .catch(() => set([]))
  }, [])
  return s
}

export const sampleUrl = (s: Sample) => `${import.meta.env.BASE_URL}samples/${s.file}`

// One photo at a time: drag and drop, file picker, live camera, or a held-out test photo.
export function PhotoInput({ onImage, preview }: { onImage: (blob: Blob) => void; preview: string | null }) {
  const [over, setOver] = useState(false)
  const [camera, setCamera] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const samples = useSamples()

  useEffect(() => {
    if (!camera) return
    let stream: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } })
      .then((s) => {
        stream = s
        if (video.current) video.current.srcObject = s
      })
      .catch(() => setCamera(false))
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [camera])

  const snap = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob((b) => b && onImage(b), 'image/jpeg', 0.92)
    setCamera(false)
  }

  const useSample = async (s: Sample) => {
    setPicked(s.file)
    onImage(await fetch(sampleUrl(s)).then((r) => r.blob()))
  }

  return (
    <div>
      <div
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const f = e.dataTransfer.files[0]
          if (f) (setPicked(null), onImage(f))
        }}
      >
        {camera ? <video ref={video} autoPlay playsInline muted /> : preview ? <img src={preview} alt="Item being checked" /> : (
          <div className="hint">
            <strong>Show me the item</strong>
            <span>Drop a photo here, upload one, or use your camera.</span>
          </div>
        )}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        {camera ? (
          <>
            <button className="btn primary" onClick={snap}>Capture</button>
            <button className="btn" onClick={() => setCamera(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button className="btn primary" onClick={() => setCamera(true)}>Use camera</button>
            <button className="btn" onClick={() => file.current?.click()}>Upload photo</button>
          </>
        )}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) (setPicked(null), onImage(f))
          e.target.value = ''
        }} />
      </div>
      {samples.length > 0 && (
        <>
          <p className="label" style={{ marginTop: 18 }}>Or try a test photo the model never saw in training</p>
          <div className="samples">
            {samples.slice(0, 16).map((s) => (
              <button key={s.file} className={picked === s.file ? 'on' : ''} onClick={() => useSample(s)} title={`${s.source} test set`}>
                <img src={sampleUrl(s)} alt={itemName(s.label)} loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function ItemPicker({ onPick, onClose, pack }: { onPick: (id: string) => void; onClose: () => void; pack: Pack }) {
  return (
    <div className="pick" onClick={onClose}>
      <div className="card pad" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h3>What is it?</h3>
          <button className="btn small" onClick={onClose}>Close</button>
        </div>
        <div className="opts">
          {Object.keys(ITEMS).map((id) => {
            const bin = binById(pack, pack.items[id].bin)
            return (
              <button key={id} onClick={() => onPick(id)}>
                <span className="dot" style={{ background: bin.color, marginRight: 8 }} />
                {itemName(id)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function ResultCard({ ans, pack, packs, override, onOverride }: {
  ans: Answer; pack: Pack; packs: Pack[]; override: string | null; onOverride: (id: string | null) => void
}) {
  const [picking, setPicking] = useState(false)
  const item = override ?? ans.items[0].id
  const rule = pack.items[item]
  const bin = binById(pack, rule.bin)
  const binP = override ? 1 : ans.bins[0].p
  const unsure = !override && !ans.sure
  const others = packs.filter((p) => p.id !== pack.id)

  return (
    <div className="card pad">
      {unsure ? (
        <div className="notice" style={{ marginBottom: 16 }}>
          <strong>Not sure about this one.</strong> It could go more than one way in {pack.name}. Pick what it is below,
          or check the label. When in doubt, keep it out of recycling.
        </div>
      ) : null}
      <div className="binhero" style={{ background: bin.color, color: bin.ink, opacity: unsure ? 0.55 : 1 }}>
        <Can bin={bin} />
        <div>
          <div className="label" style={{ color: bin.ink, opacity: 0.8 }}>{unsure ? 'Best guess' : 'Goes in'}</div>
          <h2>{bin.name}</h2>
          <div className="sub">{bin.accepts}</div>
        </div>
        <div className="conf">{override ? 'You chose' : pct(binP)}<small>{override ? 'item type' : 'sure of the bin'}</small></div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="label">Item</div>
            <h3 style={{ fontSize: 20 }}>{itemName(item)}</h3>
            <div className="small muted">{ITEMS[item]?.examples}</div>
          </div>
          {!override && <div className="small muted" style={{ textAlign: 'right' }}>{pct(ans.items[0].p)} sure of the item</div>}
        </div>
      </div>

      <div className="section">
        <div className="label">Before you toss it</div>
        <ul className="steps">{rule.prep.map((s) => <li key={s}>{s}</li>)}</ul>
        <p className="small muted">{rule.why} <a href={rule.source} target="_blank" rel="noreferrer">Source: {pack.authority}</a></p>
      </div>

      {others.length > 0 && (
        <div className="section">
          <div className="label">Same item in other places</div>
          <div className="compare">
            {others.map((p) => {
              const b = binById(p, p.items[item].bin)
              return (
                <div key={p.id}>
                  <div className="small muted">{p.name}</div>
                  <div className="row" style={{ gap: 6, marginTop: 4 }}><span className="dot" style={{ background: b.color, outline: '1px solid #0002' }} /><strong className="small">{b.name}</strong></div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="section">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="label">{override ? 'Model suggestions' : 'Not right? Tap the correct item'}</div>
          {override ? <button className="btn small" onClick={() => onOverride(null)}>Use model answer</button> : null}
        </div>
        <div className="alts">
          {ans.items.slice(0, override ? 3 : 4).map((it) => {
            const b = binById(pack, pack.items[it.id].bin)
            return (
              <button key={it.id} className="alt" onClick={() => onOverride(it.id)}>
                <span>{itemName(it.id)}</span>
                <span className="chip" style={{ background: b.color, color: b.ink }}>{b.name}</span>
                <span className="small muted" style={{ width: 38, textAlign: 'right' }}>{pct(it.p)}</span>
              </button>
            )
          })}
          <button className="btn small" style={{ justifySelf: 'start' }} onClick={() => setPicking(true)}>Something else…</button>
        </div>
      </div>
      {picking && <ItemPicker pack={pack} onClose={() => setPicking(false)} onPick={(id) => (onOverride(id), setPicking(false))} />}
    </div>
  )
}
