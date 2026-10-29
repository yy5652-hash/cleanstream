import { useEffect, useState } from 'react'
import { useModel } from './model/client'
import { PACK_IDS, usePacks } from './rules'
import { Logo } from './ui'
import About from './views/About'
import Audit from './views/Audit'
import Quiz from './views/Quiz'
import Rules from './views/Rules'
import Scan from './views/Scan'
import Station from './views/Station'

const TABS = [
  ['scan', 'Scan'],
  ['station', 'Bin station'],
  ['audit', 'Audit'],
  ['rules', 'Rules'],
  ['quiz', 'Quiz'],
  ['how', 'How it works'],
] as const
type Tab = (typeof TABS)[number][0]

const tabFromHash = (): Tab => (TABS.find(([id]) => id === location.hash.slice(1).split('?')[0])?.[0] ?? 'scan')

// Chrome, Edge and Android offer to install the app (manifest + service worker); keep the prompt for a header button.
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
  return prompt && (() => prompt.prompt().finally(() => setPrompt(null)))
}

function storedCity() {
  // a shared answer link carries its city: #scan?item=pizza_box&city=sf
  const linked = new URLSearchParams(location.hash.split('?')[1] ?? '').get('city')
  if (linked && (PACK_IDS as readonly string[]).includes(linked)) return linked
  try {
    const c = localStorage.getItem('cleanstream.city')
    return c && (PACK_IDS as readonly string[]).includes(c) ? c : 'nyc'
  } catch {
    return 'nyc'
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const [city, setCity] = useState(storedCity)
  const packs = usePacks()
  const model = useModel()
  const install = useInstall()

  useEffect(() => {
    const on = () => {
      setTab(tabFromHash())
      const linked = new URLSearchParams(location.hash.split('?')[1] ?? '').get('city')
      if (linked && (PACK_IDS as readonly string[]).includes(linked)) setCity(linked)
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

  // ?kiosk: the bin station alone, full window, for a tablet mounted above the bins
  if (params.has('kiosk')) {
    const start = params.get('source') === 'demo' ? 'demo' : 'camera'
    return pack ? <Station pack={pack} full start={start} wait={Number(params.get('wait')) || 0} /> : null
  }

  return (
    <>
      <header className="top">
        <div className="brand"><Logo />Cleanstream</div>
        <nav className="nav">
          {TABS.map(([id, name]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => (location.hash = id)}>{name}</button>
          ))}
        </nav>
        {model.status === 'loading' && (
          <div className="loadbar" title="The model downloads once, then works offline">
            <span>Model</span>
            <span className="meter"><i style={{ width: `${model.total ? (model.loaded / model.total) * 100 : 5}%` }} /></span>
          </div>
        )}
        {install && <button className="btn small" onClick={install} title="Add Cleanstream to your home screen or dock; it works offline">Install app</button>}
        <label className="city">
          Rules for
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            {(packs ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </header>
      <main>
        {!packs || !pack ? <p className="muted">Loading…</p> : (
          <>
            {tab === 'scan' && <Scan pack={pack} packs={packs} />}
            {tab === 'station' && <Station pack={pack} />}
            {tab === 'audit' && <Audit pack={pack} packs={packs} />}
            {tab === 'rules' && <Rules pack={pack} packs={packs} />}
            {tab === 'quiz' && <Quiz key={pack.id} pack={pack} packs={packs} />}
            {tab === 'how' && <About packs={packs} />}
          </>
        )}
        <p className="footer">Cleanstream runs entirely in your browser. Photos never leave your device. Rules link to their official sources.</p>
      </main>
    </>
  )
}
