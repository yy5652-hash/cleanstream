import { useRef, useState } from 'react'
import { classify, useModel } from '../model/client'
import { answer, type Pack } from '../rules'
import { PhotoInput, ResultCard } from '../ui'

export default function Scan({ pack, packs }: { pack: Pack; packs: Pack[] }) {
  const model = useModel()
  const [preview, setPreview] = useState<string | null>(null)
  const [probs, setProbs] = useState<Float32Array | null>(null)
  const [ms, setMs] = useState(0)
  const [busy, setBusy] = useState(false)
  const [override, setOverride] = useState<string | null>(null)
  const result = useRef<HTMLDivElement>(null)

  const onImage = async (blob: Blob) => {
    setPreview((old) => (old && URL.revokeObjectURL(old), URL.createObjectURL(blob)))
    setOverride(null)
    setBusy(true)
    try {
      const r = await classify(blob)
      setProbs(r.probs)
      setMs(r.ms)
      // on a phone the answer sits below the photo: bring it into view
      if (innerWidth < 860) requestAnimationFrame(() => result.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } finally {
      setBusy(false)
    }
  }

  const ans = probs && model.classes.length ? answer(pack, model.classes, probs) : null

  return (
    <>
      <div className="lede">
        <div>
          <h1>Which bin does this go in?</h1>
          <p>Show Cleanstream an item. It recognises it on your device and answers with the rules for {pack.name}, including how to prep it.</p>
        </div>
      </div>
      <div className="grid2">
        <div className="card pad">
          <PhotoInput onImage={onImage} preview={preview} />
        </div>
        <div ref={result} style={{ scrollMarginTop: 120 }}>
          {ans ? (
            <ResultCard ans={ans} pack={pack} packs={packs} override={override} onOverride={setOverride} />
          ) : (
            <div className="card pad" style={{ minHeight: 320, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
              <div className="muted" style={{ maxWidth: 340 }}>
                {busy ? 'Looking…' : model.status === 'loading' ? (
                  <>
                    Downloading the model once{model.total ? ` (${Math.round(model.loaded / 1e6)} of ${Math.round(model.total / 1e6)} MB)` : ''}. It runs in this browser, so photos stay on your device, and it works offline after this.
                    <div className="meter" style={{ marginTop: 14 }}><i style={{ width: `${model.total ? (model.loaded / model.total) * 100 : 3}%` }} /></div>
                  </>
                ) : model.status === 'error' ? `The model could not load: ${model.error}` : 'Your answer appears here: the bin, how sure the model is, and what to do before you toss it.'}
              </div>
            </div>
          )}
          {ans && <p className="small faint" style={{ marginTop: 10 }}>Recognised on this device in {Math.round(ms)} ms. Nothing was uploaded.</p>}
        </div>
      </div>
    </>
  )
}
