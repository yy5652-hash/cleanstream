import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Check, Copy, GripVertical, Printer } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { encode } from 'uqr'
import { Button } from '../components/ui/button'
import { t, tCity, useLang } from '../i18n'
import { binById, PACK_IDS, PACK_NAMES, type Pack } from '../rules'
import { kioskUrl, moveBin, useStationBins } from '../station-config'
import { useStationLog } from '../store'
import { BinChip } from '../ui'
import StationReport from './StationReport'

export function BinOrder({ pack, ids, onChange }: { pack: Pack; ids: string[]; onChange: (ids: string[]) => void }) {
  const help = useId()
  const list = useRef<HTMLUListElement>(null)
  const drag = useRef<{ id: string; pointer: number } | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const order = [...ids, ...pack.bins.map((b) => b.id).filter((id) => !ids.includes(id))]
  const move = (id: string, to: number) => {
    const next = moveBin(ids, id, to)
    onChange(next)
    setAnnouncement(t('{bin} is position {position} of {count}.', { bin: binById(pack, id).name, position: next.indexOf(id) + 1, count: next.length }))
  }
  const endDrag = () => { drag.current = null; setDragging(null) }

  return (
    <div className="min-w-0">
      <p id={help} className="text-ink-2">{t('Switch on the bins at your site. Drag the handles to match their order, left to right. You can also use the arrow keys.')}</p>
      <ul ref={list} className="mt-5 grid gap-2">
        {order.map((id) => {
          const bin = binById(pack, id)
          const index = ids.indexOf(id)
          const on = index >= 0
          return (
            <li key={id} data-station-bin={id} className={`flex min-w-0 items-center gap-1 rounded-2xl border border-line bg-card p-2 ${dragging === id ? 'ring-2 ring-ink' : ''}`}>
              <Button variant="ghost" size="icon" className="shrink-0 touch-none text-ink-2" disabled={!on}
                aria-label={t('Move {bin}', { bin: bin.name })} aria-describedby={help}
                onKeyDown={(e) => {
                  const direction = ['ArrowUp', 'ArrowLeft'].includes(e.key) ? -1 : ['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : 0
                  if (direction) { e.preventDefault(); move(id, index + direction) }
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0 || !e.isPrimary) return
                  e.currentTarget.setPointerCapture(e.pointerId)
                  drag.current = { id, pointer: e.pointerId }
                  setDragging(id)
                }}
                onPointerMove={(e) => {
                  if (drag.current?.pointer !== e.pointerId) return
                  const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-station-bin]')
                  if (!row || !list.current?.contains(row)) return
                  const to = ids.indexOf(row.dataset.stationBin ?? '')
                  if (to >= 0 && to !== index) move(id, to)
                }}
                onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
                <GripVertical aria-hidden />
              </Button>
              <button type="button" role="switch" aria-checked={on} onClick={() => onChange(on ? ids.filter((binId) => binId !== id) : [...ids, id])}
                aria-label={t('Include {bin}', { bin: bin.name })}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl px-1 text-left">
                <span className={`grid size-5 shrink-0 place-items-center rounded-full border border-line ${on ? 'bg-ink text-paper' : 'bg-well'}`}>{on && <Check className="size-3.5" aria-hidden />}</span>
                <span className="min-w-0 font-medium break-words">{bin.name}</span>
              </button>
              <div className="flex shrink-0">
                <Button variant="ghost" size="icon" disabled={!on || index === 0} onClick={() => move(id, index - 1)} aria-label={t('Move {bin} left', { bin: bin.name })}><ArrowUp aria-hidden /></Button>
                <Button variant="ghost" size="icon" disabled={!on || index === ids.length - 1} onClick={() => move(id, index + 1)} aria-label={t('Move {bin} right', { bin: bin.name })}><ArrowDown aria-hidden /></Button>
              </div>
            </li>
          )
        })}
      </ul>
      <p role="status" className="sr-only">{announcement}</p>
      <p className="mb-2 mt-6 text-sm text-ink-2">{t('Your bins, left to right')}</p>
      {ids.length ? <div className="grid gap-1 overflow-hidden rounded-2xl" style={{ gridTemplateColumns: `repeat(${ids.length}, minmax(0, 1fr))` }}>
        {ids.map((id) => {
          const bin = binById(pack, id)
          return <div key={id} className="flex min-h-20 min-w-0 items-center justify-center px-1 py-3 text-center text-xs font-semibold break-words sm:text-sm" style={{ background: bin.color, color: bin.ink }}>{bin.name}</div>
        })}
      </div> : <p className="rounded-2xl bg-well p-4 text-ink-2">{t('Choose at least one bin to continue.')}</p>}
    </div>
  )
}

function StationHistory({ pack }: { pack: Pack }) {
  const [log, setLog] = useStationLog()
  return <StationReport pack={pack} log={log[pack.id] ?? {}} onReset={() => setLog((old) => { const next = { ...old }; delete next[pack.id]; return next })} />
}

export default function StationSetup({ pack, onCity }: { pack: Pack; onCity: (id: string) => void }) {
  const { lang } = useLang()
  const [step, setStep] = useState(1)
  const [ids, setIds] = useStationBins(pack)
  const [site, setSite] = useState('')
  const [copyState, setCopyState] = useState<{ link: string; failed: boolean } | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const title = useRef<HTMLHeadingElement>(null)
  const linkInput = useRef<HTMLInputElement>(null)
  const previousStep = useRef(step)
  const config = { city: pack.id, bins: ids, site, lang }
  const link = new URL(kioskUrl(config), location.origin).href
  const copied = copyState?.link === link && !copyState.failed
  const copyFailed = copyState?.link === link && copyState.failed
  const demo = new URL(kioskUrl({ ...config, source: 'demo' }), location.origin).href
  const qr = useMemo(() => encode(link, { border: 4, ecc: 'M' }), [link])
  const qrPath = useMemo(() => qr.data.flatMap((row, y) => row.flatMap((on, x) => on ? [`M${x},${y}h1v1h-1z`] : [])).join(''), [qr])

  useEffect(() => {
    if (previousStep.current !== step) title.current?.focus()
    previousStep.current = step
  }, [step])
  useEffect(() => {
    const refresh = () => setHistoryVersion((v) => v + 1)
    const changed = (e: StorageEvent) => { if (e.key === 'cleanstream.station.log') refresh() }
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', changed)
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('storage', changed) }
  }, [])
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopyState({ link, failed: false }) }
    catch { setCopyState({ link, failed: true }); linkInput.current?.focus(); linkInput.current?.select() }
  }

  return (
    <div className="min-w-0">
      <section aria-labelledby="station-setup-title" className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-ink-2">{t('Step {step} of {total}', { step, total: 3 })}</p>
          <div className="flex gap-1.5" aria-hidden>{[1, 2, 3].map((n) => <span key={n} className={`h-1 w-8 rounded-full ${n <= step ? 'bg-ink' : 'bg-well'}`} />)}</div>
        </div>
        <h1 id="station-setup-title" ref={title} tabIndex={-1} className="text-display">{step === 1 ? t('Where are your bins?') : step === 2 ? t('Put your bins in order') : t('Your station is ready')}</h1>
        <div key={step} className="mt-6 animate-rise">
          {step === 1 && <>
            <p className="max-w-xl text-lg text-ink-2">{t('Choose a city. Your station will use its official sorting rules.')}</p>
            <div role="radiogroup" aria-label={t('Station city')} className="mt-6 grid gap-2 sm:grid-cols-2">
              {PACK_IDS.map((id) => <button key={id} role="radio" aria-checked={pack.id === id} onClick={() => onCity(id)} className={`flex min-h-20 items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-left text-lg font-medium ${pack.id === id ? 'border-ink bg-well' : 'border-line bg-card hover:bg-well'}`}>
                {tCity(id) ?? PACK_NAMES[id]}{pack.id === id && <Check className="size-5 shrink-0" aria-hidden />}
              </button>)}
            </div>
            <p className="mt-5 text-sm text-ink-2">{t('No account. Photos stay on the device.')}</p>
          </>}
          {step === 2 && <div className="max-w-2xl"><BinOrder pack={pack} ids={ids} onChange={setIds} /></div>}
          {step === 3 && <>
            <label htmlFor="station-site" className="mb-2 block font-medium">{t('Site name (optional)')}</label>
            <input id="station-site" value={site} onChange={(e) => setSite(e.target.value)} maxLength={160} autoComplete="organization" placeholder={t('Where will this station stand?')} className="min-h-12 w-full rounded-2xl border border-line bg-card px-4 text-ink sm:max-w-md" />
            <div className="mt-7 grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <figure className="min-w-0 rounded-3xl border border-line p-5">
                <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={t('QR code for this station')} shapeRendering="crispEdges" className="mx-auto aspect-square w-full max-w-80 rounded-2xl" style={{ background: 'light-dark(var(--c-paper), var(--c-ink))', color: 'light-dark(var(--c-ink), var(--c-paper))' }}><path d={qrPath} fill="currentColor" /></svg>
                <figcaption className="mt-4 text-center text-lg font-medium">{t('Scan with the tablet')}</figcaption>
              </figure>
              <div className="grid min-w-0 gap-3">
                <p className="mb-2 text-ink-2">{t('Place the tablet above your bins, facing the person holding an item.')}</p>
                <div className="mb-2 flex flex-wrap gap-1.5">{ids.map((id) => <BinChip key={id} bin={binById(pack, id)} />)}</div>
                <Button asChild size="lg" className="h-auto min-h-14 whitespace-normal py-3"><a href={link} target="_blank" rel="noreferrer">{t('Open it on this device')}<ArrowUpRight aria-hidden /></a></Button>
                <Button variant="outline" size="lg" onClick={() => void copy()}>{copied ? <Check aria-hidden /> : <Copy aria-hidden />}{copied ? t('Link copied') : t('Copy the link')}</Button>
                <Button asChild variant="secondary" size="lg" className="h-auto min-h-14 whitespace-normal py-3"><a href={demo} target="_blank" rel="noreferrer">{t('Try the demo feed')}<ArrowUpRight aria-hidden /></a></Button>
                <label htmlFor="station-link" className="mt-2 text-sm text-ink-2">{t('Station link')}</label>
                <input id="station-link" ref={linkInput} readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-h-11 min-w-0 w-full rounded-2xl border border-line bg-card px-3 text-sm text-ink-2" />
                <p role="status" className="text-sm text-ink-2">{copyFailed ? t('Select and copy the link above.') : copied ? t('Link copied') : t('Demo counts are saved in this browser too.')}</p>
              </div>
            </div>
            <div className="mt-8 grid gap-2 border-t border-line pt-5 sm:grid-cols-2">
              <a href="#poster" className="flex min-h-14 items-center gap-3 rounded-2xl px-3 font-medium hover:bg-well"><Printer className="size-5 shrink-0" aria-hidden />{t('Print bin poster')}<ArrowUpRight className="ml-auto size-4 shrink-0" aria-hidden /></a>
              <a href="#pilot" className="flex min-h-14 items-center gap-3 rounded-2xl px-3 font-medium hover:bg-well">{t('Start a before and after pilot')}<ArrowUpRight className="ml-auto size-4 shrink-0" aria-hidden /></a>
            </div>
          </>}
        </div>
        <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep((n) => n - 1)}><ArrowLeft aria-hidden />{t('Back')}</Button>
          {step < 3 && <Button size="lg" disabled={step === 2 && !ids.length} onClick={() => setStep((n) => n + 1)}>{t('Next')}<ArrowRight aria-hidden /></Button>}
        </div>
      </section>
      <section aria-labelledby="station-history-title" className="mt-16 border-t border-line pt-8">
        <h2 id="station-history-title" className="mb-5 text-title">{t('What this station has seen')}</h2>
        <StationHistory key={historyVersion} pack={pack} />
      </section>
    </div>
  )
}
