import { Camera, ImageUp } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Answer } from '../components/Answer'
import { ItemSearch } from '../components/Search'
import { t } from '../i18n'
import { ITEMS, itemName } from '../items'
import { classify, loadModel, useModel } from '../model/client'
import { answer, type Pack } from '../rules'
import { sampleUrl, thumbUrl, useSamples, type Sample } from '../ui'

const CameraSheet = lazy(() => import('../components/Camera').then((m) => ({ default: m.CameraSheet })))

// The item in a shared link: #scan?item=pizza_box&city=sf
const linkedItem = () => {
  const id = new URLSearchParams(location.hash.split('?')[1] ?? '').get('item')
  return id && id in ITEMS ? id : null
}

const POPULAR = ['paper_cup', 'pizza_box', 'battery', 'foam', 'plastic_bag_film', 'carton']

export default function Scan({ pack, packs }: { pack: Pack; packs: Pack[] }) {
  const model = useModel()
  const samples = useSamples()
  const [preview, setPreview] = useState<string | null>(null)
  const [probs, setProbs] = useState<Float32Array | null>(null)
  const [ms, setMs] = useState(0)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [camera, setCamera] = useState(false)
  const [over, setOver] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(linkedItem)
  const [fromSearch, setFromSearch] = useState(() => !!linkedItem())
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const on = () => {
      const id = linkedItem()
      if (id) (setChosen(id), setFromSearch(true))
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  // on a phone the answer moves above the inputs: bring it into view
  const reveal = () => innerWidth < 1024 && requestAnimationFrame(() => scrollTo({ top: 0, behavior: 'smooth' }))

  const onSearch = (id: string) => {
    setChosen(id)
    setFromSearch(true)
    setPicked(null)
    history.replaceState(null, '', `#scan?item=${id}`)
    reveal()
  }

  const onImage = async (blob: Blob) => {
    setPreview((old) => (old && URL.revokeObjectURL(old), URL.createObjectURL(blob)))
    setChosen(null)
    setFromSearch(false)
    setProbs(null)
    setFailed(false)
    history.replaceState(null, '', '#scan')
    setBusy(true)
    reveal()
    try {
      const r = await classify(blob)
      setProbs(r.probs)
      setMs(r.ms)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
      reveal()
    }
  }

  const openCamera = () => {
    loadModel()
    setCamera(true)
  }
  const trySample = async (s: Sample) => {
    setPicked(s.file)
    loadModel()
    onImage(await fetch(sampleUrl(s)).then((r) => r.blob()))
  }

  const ans = probs && model.classes.length && !fromSearch ? answer(pack, model.classes, probs) : null
  const loading = model.status === 'loading'
  const progress = loading
    ? model.total ? t('Getting photo recognition ready: {loaded} of {total} MB', { loaded: Math.round(model.loaded / 1e6), total: Math.round(model.total / 1e6) }) : t('Getting photo recognition ready…')
    : undefined
  const hasAnswer = !!(chosen || ans)
  const showing = hasAnswer || busy || failed

  return (
    <div className="grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div
        onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const f = e.dataTransfer.files[0]
          if (f) (loadModel(), onImage(f))
        }}
        className={over ? 'rounded-3xl outline-2 outline-offset-8 outline-ink' : ''}
      >
        <div className={showing ? 'hidden lg:block' : ''}>
          <h1 className="text-display">{t('What are you throwing away?')}</h1>
          <p className="mt-3 text-lg text-ink-2">{t('The right bin for {city}, from its official rules.', { city: pack.name })}</p>
        </div>
        <h2 className={showing ? 'mb-3 text-xl font-semibold tracking-tight lg:hidden' : 'hidden'}>{t('Sort something else')}</h2>

        <button onClick={openCamera} className={`${showing ? 'h-16 text-lg lg:mt-7 lg:h-24 lg:text-xl' : 'mt-7 h-24 text-xl'} flex w-full items-center justify-center gap-3 rounded-2xl bg-primary font-semibold text-primary-foreground transition-transform hover:bg-primary/90 active:scale-[.99]`}>
          <Camera className="size-7" aria-hidden />{t('Point your camera')}
        </button>
        <div className="mt-2.5 flex items-center justify-between gap-3 text-sm text-ink-2">
          <span className="min-w-0">{model.status === 'idle' ? t('Downloads once (95 MB), then works offline.') : progress ?? t('Photos stay on this device.')}</span>
          <button onClick={() => (loadModel(), file.current?.click())} className="flex shrink-0 items-center gap-1.5 font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink"><ImageUp className="size-4" aria-hidden />{t('Upload a photo')}</button>
        </div>
        {loading && model.total > 0 && <div className="mt-2 h-1 overflow-hidden rounded-full bg-well"><div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${(model.loaded / model.total) * 100}%` }} /></div>}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) (setPicked(null), setCamera(false), onImage(f))
          e.target.value = ''
        }} />

        <div className="mt-5"><ItemSearch pack={pack} onPick={onSearch} popular={POPULAR} /></div>
      </div>

      <div className={`min-w-0 ${showing ? 'order-first lg:order-none' : ''}`}>
        {busy && !hasAnswer ? (
          <div className="flex min-h-72 flex-col justify-end rounded-3xl bg-well p-6 sm:p-8" role="status">
            {preview && <img src={preview} alt={t('Item being checked')} className="mb-auto size-20 rounded-2xl object-cover" />}
            <p className="text-title animate-breathe">{t('Looking…')}</p>
            {progress && <p className="mt-1 text-sm text-ink-2">{progress}</p>}
          </div>
        ) : failed && !hasAnswer ? (
          <div className="rounded-3xl bg-well p-6 sm:p-8" role="alert">
            <p className="text-title">{t('Photo recognition could not start')}</p>
            <p className="mt-1.5 text-ink-2">{model.status === 'error' ? t('The model could not load: {error}', { error: String(model.error) }) : t('Try again, or type the item instead.')}</p>
          </div>
        ) : hasAnswer ? (
          <Answer ans={ans} ms={ms} pack={pack} packs={packs} item={chosen} preview={fromSearch ? null : preview} onChoose={(id) => setChosen(id)} />
        ) : samples.length > 0 && (
          <div>
            <h2 className="font-semibold">{t('No item handy? Try a photo')}</h2>
            <p className="mt-0.5 text-sm text-ink-2">{t('Test photos the model never saw in training.')}</p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {samples.slice(0, 12).map((s) => (
                <button key={s.file} onClick={() => trySample(s)} title={itemName(s.label)} className={`overflow-hidden rounded-xl transition-transform hover:scale-[1.03] ${picked === s.file ? 'ring-2 ring-ink' : ''}`}>
                  <img src={thumbUrl(s)} alt={itemName(s.label)} width={160} height={160} loading="lazy" className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {camera && <Suspense fallback={null}><CameraSheet open onClose={() => setCamera(false)} onImage={onImage} onUpload={() => file.current?.click()} status={progress} /></Suspense>}
    </div>
  )
}
