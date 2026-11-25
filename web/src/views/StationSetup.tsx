import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Copy, Printer } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { encode } from 'uqr'
import { Button } from '../components/ui/button'
import { t, tCity, useLang } from '../i18n'
import { PACK_IDS, PACK_NAMES, type Pack } from '../rules'
import { kioskUrl, physicalBinStyle, useStationProfile, type StationProfile } from '../station-config'
import { StationProfileEditor } from '../components/StationProfileEditor'
import { PinSettings } from '../components/OperatorPin'
import { resetStationCounts, useStationLog } from '../store'
import { BinChip } from '../ui'
import StationReport from './StationReport'

function StationHistory({ pack, profile }: { pack: Pack; profile: StationProfile }) {
  const [log, setLog] = useStationLog()
  return <StationReport pack={pack} profile={profile} log={log[pack.id] ?? {}} onReset={() => setLog((old) => resetStationCounts(old, pack.id))} />
}

export default function StationSetup({ pack, onCity }: { pack: Pack; onCity: (id: string) => void }) {
  const { lang } = useLang()
  const [step, setStep] = useState(1)
  const [profile, setProfile] = useStationProfile(pack)
  const [site, setSite] = useState('')
  const [copyState, setCopyState] = useState<{ link: string; failed: boolean } | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const title = useRef<HTMLHeadingElement>(null)
  const linkInput = useRef<HTMLInputElement>(null)
  const previousStep = useRef(step)
  const config = { city: pack.id, bins: profile.bins.flatMap((b) => b.streams), profile, site, lang }
  const link = new URL(kioskUrl(config), location.origin).href
  const copied = copyState?.link === link && !copyState.failed
  const copyFailed = copyState?.link === link && copyState.failed
  const demo = new URL(kioskUrl({ ...config, source: 'demo' }), location.origin).href
  const qr = useMemo(() => { try { return encode(link, { border: 4, ecc: 'M' }) } catch { return null } }, [link])
  const qrPath = useMemo(() => qr?.data.flatMap((row, y) => row.flatMap((on, x) => on ? [`M${x},${y}h1v1h-1z`] : [])).join('') ?? '', [qr])

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
          {step === 2 && <div className="max-w-2xl"><StationProfileEditor pack={pack} profile={profile} onChange={setProfile} /><p className="mt-6 text-sm text-ink-2">{t("For unattended stations, set an operator PIN on this device. Set it again on each tablet; it is not included in the QR code.")}</p><PinSettings city={pack.id} /></div>}
          {step === 3 && <>
            <label htmlFor="station-site" className="mb-2 block font-medium">{t('Site name (optional)')}</label>
            <input id="station-site" value={site} onChange={(e) => setSite(e.target.value)} maxLength={160} autoComplete="organization" placeholder={t('Where will this station stand?')} className="min-h-12 w-full rounded-2xl border border-line bg-card px-4 text-ink sm:max-w-md" />
            <div className="mt-7 grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <figure className="min-w-0 rounded-3xl border border-line p-5">
                {qr ? <><svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={t('QR code for this station')} shapeRendering="crispEdges" className="mx-auto aspect-square w-full max-w-80 rounded-2xl" style={{ background: 'light-dark(var(--c-paper), var(--c-ink))', color: 'light-dark(var(--c-ink), var(--c-paper))' }}><path d={qrPath} fill="currentColor" /></svg>
                <figcaption className="mt-4 text-center text-lg font-medium">{t('Scan with the tablet')}</figcaption></> : <p role="status">{t('This link is too long for a QR code. Shorten the labels or profile details, or copy the station link.')}</p>}
              </figure>
              <div className="grid min-w-0 gap-3">
                <p className="mb-2 text-ink-2">{t('Place the tablet above your bins, facing the person holding an item.')}</p>
                <div className="mb-2 flex flex-wrap gap-1.5">{profile.bins.map((bin) => <BinChip key={bin.id} bin={physicalBinStyle(pack, bin)} />)}</div>
                <Button asChild size="lg" className="h-auto min-h-14 whitespace-normal py-3"><a href={link} target="_blank" rel="noreferrer">{t('Open it on this device')}<ArrowUpRight aria-hidden /></a></Button>
                <Button variant="outline" size="lg" onClick={() => void copy()}>{copied ? <Check aria-hidden /> : <Copy aria-hidden />}{copied ? t('Link copied') : t('Copy the link')}</Button>
                <Button asChild variant="secondary" size="lg" className="h-auto min-h-14 whitespace-normal py-3"><a href={demo} target="_blank" rel="noreferrer">{t('Try the demo feed')}<ArrowUpRight aria-hidden /></a></Button>
                <label htmlFor="station-link" className="mt-2 text-sm text-ink-2">{t('Station link')}</label>
                <input id="station-link" ref={linkInput} readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-h-11 min-w-0 w-full rounded-2xl border border-line bg-card px-3 text-sm text-ink-2" />
                <p role="status" className="text-sm text-ink-2">{copyFailed ? t('Select and copy the link above.') : copied ? t('Link copied') : t('Demo answers are not counted.')}</p>
              </div>
            </div>
            <details className="mt-6 rounded-2xl border border-line px-4 text-sm">
              <summary className="min-h-11 cursor-pointer py-3 font-medium">{t('Lock the tablet to this screen')}</summary>
              <div className="space-y-3 pb-4 text-ink-2">
                <p>{t('On iPad, turn on Guided Access under Settings › Accessibility › Guided Access. Open the station and triple-click the top or Home button. Tap Start if prompted.')}</p>
                <p>{t('On Android, turn on App pinning under Settings › Security › Advanced, or Security & privacy › More security settings. Open the station, then tap the browser icon in Overview (recent apps) and choose Pin.')}</p>
                <p>{t('Keep the tablet plugged in. Set Display Auto-Lock in Guided Access or the Android screen timeout to the longest option.')}</p>
              </div>
            </details>
            <div className="mt-8 grid gap-2 border-t border-line pt-5 sm:grid-cols-2">
              <a href="#poster" className="flex min-h-14 items-center gap-3 rounded-2xl px-3 font-medium hover:bg-well"><Printer className="size-5 shrink-0" aria-hidden />{t('Print bin poster')}<ArrowUpRight className="ml-auto size-4 shrink-0" aria-hidden /></a>
              <a href="#pilot" className="flex min-h-14 items-center gap-3 rounded-2xl px-3 font-medium hover:bg-well">{t('Start a before and after pilot')}<ArrowUpRight className="ml-auto size-4 shrink-0" aria-hidden /></a>
            </div>
          </>}
        </div>
        <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep((n) => n - 1)}><ArrowLeft aria-hidden />{t('Back')}</Button>
          {step < 3 && <Button size="lg" disabled={step === 2 && !profile.bins.length} onClick={() => setStep((n) => n + 1)}>{t('Next')}<ArrowRight aria-hidden /></Button>}
        </div>
      </section>
      <div className="mt-16 border-t border-line pt-8">
        <StationHistory key={`${pack.id}-${historyVersion}`} pack={pack} profile={profile} />
      </div>
    </div>
  )
}
