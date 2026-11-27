import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Shell, type Section } from './components/Shell'
import { localizePack, t, useLang } from './i18n'
import { PACK_IDS, usePacks } from './rules'
import Scan from './views/Scan'
import { RulesUpdateNotice, useRulesUpdate } from './components/RulesUpdate'

// Everything except Sort loads when first opened
const About = lazy(() => import('./views/About'))
const Audit = lazy(() => import('./views/Audit'))
const Learn = lazy(() => import('./views/Learn'))
const Pilot = lazy(() => import('./views/Pilot'))
const Poster = lazy(() => import('./views/Poster'))
const Sites = lazy(() => import('./views/Sites'))
const Station = lazy(() => import('./views/Station'))
const StationSetup = lazy(() => import('./views/StationSetup'))

// Old links (#scan, #station, #audit, #rules, #quiz, #how) keep working
const ROUTES = {
  scan: 'sort', rules: 'learn', quiz: 'learn', sites: 'sites', station: 'sites', audit: 'sites', pilot: 'sites', poster: 'sites', how: 'sites',
} as const satisfies Record<string, Section>
type Route = keyof typeof ROUTES

const routeFromHash = (): Route => {
  const id = location.hash.slice(1).split('?')[0]
  return id in ROUTES ? (id as Route) : 'scan'
}

// Chrome, Edge and Android offer to install the app (manifest + service worker); keep the prompt for the place sheet.
type InstallPrompt = Event & { prompt: () => Promise<void> }
function useInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  useEffect(() => {
    const on = (e: Event) => (e.preventDefault(), setPrompt(e as InstallPrompt))
    const done = () => setPrompt(null)
    addEventListener('beforeinstallprompt', on)
    addEventListener('appinstalled', done)
    return () => (removeEventListener('beforeinstallprompt', on), removeEventListener('appinstalled', done))
  }, [])
  return prompt && (() => void prompt.prompt().finally(() => setPrompt(null)))
}

const isCity = (c: string | null): c is string => !!c && (PACK_IDS as readonly string[]).includes(c)

function storedCity() {
  // a shared answer link carries its city (#scan?item=pizza_box&city=sf); a station's link has it in the query
  const linked = new URLSearchParams(location.hash.split('?')[1] ?? '').get('city') ?? new URLSearchParams(location.search).get('city')
  if (isCity(linked)) return linked
  try {
    const c = localStorage.getItem('cleanstream.city')
    return isCity(c) ? c : 'nyc'
  } catch {
    return 'nyc'
  }
}

export default function App({ controlledAtLoad }: { controlledAtLoad: boolean }) {
  const [route, setRoute] = useState<Route>(routeFromHash)
  const [city, setCity] = useState(storedCity)
  const { lang, ready } = useLang()
  const { packs: english, failed: packsFailed, retry: retryPacks } = usePacks(city)
  const rulesUpdated = useRulesUpdate(english, controlledAtLoad)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const packs = useMemo(() => english?.map(localizePack) ?? null, [english, lang])
  const install = useInstall()

  useEffect(() => {
    const on = () => {
      setRoute(routeFromHash())
      scrollTo(0, 0)
      const linked = new URLSearchParams(location.hash.split('?')[1] ?? '').get('city')
      if (isCity(linked)) setCity(linked)
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem('cleanstream.city', city)
    } catch {
      /* ignore */
    }
  }, [city])

  const pack = packs?.find((p) => p.id === city)
  const params = new URLSearchParams(location.search)

  if (!ready) return null // the first language is still loading: no flash of English

  const loadError = (
    <div role="alert" className="max-w-md">
      <p className="text-title">{t('Could not load the rules')}</p>
      <p className="mt-2 text-ink-2">{t('Check your connection and try again.')}</p>
      <button onClick={retryPacks} className="mt-5 inline-flex min-h-11 items-center rounded-2xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90">{t('Try again')}</button>
    </div>
  )

  // ?kiosk: the bin station alone, full window, for a tablet mounted above the bins
  if (params.has('kiosk')) {
    const start = params.get('source') === 'demo' ? 'demo' : 'camera'
    const kioskWait = <div className="grid min-h-dvh place-items-center p-8 text-center text-ink-2" role="status">{t('Loading…')}</div>
    if (!pack) return packsFailed ? <div className="grid min-h-dvh place-items-center p-8">{loadError}</div> : kioskWait
    return <Suspense fallback={kioskWait}><Station pack={pack} rulesUpdated={rulesUpdated} start={start} wait={Number(params.get('wait')) || 0} /></Suspense>
  }

  const loading = packsFailed ? <div className="min-h-[70vh]">{loadError}</div> : <p className="min-h-[70vh] text-ink-2">{t('Loading…')}</p>
  return (
    <Shell section={ROUTES[route]} city={city} setCity={setCity} install={install}>
      {rulesUpdated && <RulesUpdateNotice />}
      {!packs || !pack || (route !== 'scan' && packs.length < PACK_IDS.length) ? loading : (
        <Suspense fallback={loading}>
          {route === 'scan' && <Scan pack={pack} packs={packs} />}
          {(route === 'rules' || route === 'quiz') && <Learn key={pack.id} sub={route} pack={pack} packs={packs} />}
          {route === 'sites' && <Sites pack={pack} />}
          {route === 'station' && <StationSetup pack={pack} onCity={setCity} />}
          {route === 'audit' && <Audit pack={pack} packs={packs} />}
          {route === 'pilot' && <Pilot pack={pack} packs={packs} />}
          {route === 'poster' && <Poster pack={pack} />}
          {route === 'how' && <About packs={packs} />}
        </Suspense>
      )}
    </Shell>
  )
}
