import { useEffect, useRef, useState } from 'react'
import { ITEMS } from '../items'
import { classify, loadModel, useModel } from '../model/client'
import { answer, type Pack } from '../rules'
import { ItemSearch, PhotoInput, ResultCard } from '../ui'

// The item in a shared link: #scan?item=pizza_box&city=sf
const linkedItem = () => {
  const id = new URLSearchParams(location.hash.split('?')[1] ?? '').get('item')
  return id && id in ITEMS ? id : null
}

const POPULAR = ['paper_cup', 'pizza_box', 'battery', 'foam', 'plastic_bag_film', 'carton']

export default function Scan({ pack, packs }: { pack: Pack; packs: Pack[] }) {
  const model = useModel()
  const [preview, setPreview] = useState<string | null>(null)
  const [probs, setProbs] = useState<Float32Array | null>(null)
  const [ms, setMs] = useState(0)
  const [busy, setBusy] = useState(false)
  const [override, setOverride] = useState<string | null>(null)
  const [searched, setSearched] = useState<string | null>(linkedItem)
  const result = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const on = () => {
      const id = linkedItem()
      if (id) setSearched(id)
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  // on a phone the answer sits below the photo: bring it into view
  const reveal = () => innerWidth < 860 && requestAnimationFrame(() => result.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

  const onSearch = (id: string | null) => {
    setSearched(id)
    history.replaceState(null, '', id ? `#scan?item=${id}` : '#scan')
    if (id) reveal()
  }

  const onImage = async (blob: Blob) => {
    setPreview((old) => (old && URL.revokeObjectURL(old), URL.createObjectURL(blob)))
    setOverride(null)
    onSearch(null)
    setBusy(true)
    try {
      const r = await classify(blob)
      setProbs(r.probs)
      setMs(r.ms)
      reveal()
    } finally {
      setBusy(false)
    }
  }

  const ans = probs && model.classes.length ? answer(pack, model.classes, probs) : null

  return (
    <>
      <div className="lede">
        <div style={{ flex: '1 1 520px', maxWidth: 680 }}>
          <h1>Which bin does this go in?</h1>
          <p>Search an item or show Cleanstream a photo. It answers with the rules for {pack.name}, including how to prep it.</p>
          <ItemSearch pack={pack} onPick={onSearch} popular={POPULAR} />
        </div>
      </div>
      <div className="grid2">
        <div className="card pad">
          <PhotoInput onImage={onImage} preview={preview} />
        </div>
        <div ref={result} style={{ scrollMarginTop: 120 }}>
          {searched ? (
            <ResultCard ans={null} pack={pack} packs={packs} override={searched} onOverride={onSearch} />
          ) : ans ? (
            <ResultCard ans={ans} pack={pack} packs={packs} override={override} onOverride={setOverride} />
          ) : (
            <div className="card pad" style={{ minHeight: 320, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
              <div className="muted" style={{ maxWidth: 340 }}>
                {model.status === 'idle' ? (
                  <>
                    To save your data, the photo model (96 MB) downloads only when you ask. Search above works now.
                    <div style={{ marginTop: 14 }}><button className="btn primary" onClick={loadModel}>Download the photo model</button></div>
                  </>
                ) : model.status === 'loading' ? (
                  <>
                    Downloading the model once{model.total ? ` (${Math.round(model.loaded / 1e6)} of ${Math.round(model.total / 1e6)} MB)` : ''}. It runs in this browser, so photos stay on your device, and it works offline after this. Search works already.
                    <div className="meter" style={{ marginTop: 14 }}><i style={{ width: `${model.total ? (model.loaded / model.total) * 100 : 3}%` }} /></div>
                  </>
                ) : busy ? 'Looking…' : model.status === 'error' ? `The model could not load: ${model.error}` : 'Your answer appears here: the bin, how sure the model is, and what to do before you toss it.'}
              </div>
            </div>
          )}
          {!searched && ans && <p className="small faint" style={{ marginTop: 10 }}>Recognised on this device in {Math.round(ms)} ms. Nothing was uploaded.</p>}
        </div>
      </div>
    </>
  )
}
