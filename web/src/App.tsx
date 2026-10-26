import { useEffect, useState } from 'react'
import { useModel } from './model/client'
import { PACK_IDS, usePacks } from './rules'
import { Logo } from './ui'
import About from './views/About'
import Audit from './views/Audit'
import Rules from './views/Rules'
import Scan from './views/Scan'
import Station from './views/Station'

const TABS = [
  ['scan', 'Scan'],
  ['station', 'Bin station'],
  ['audit', 'Audit'],
  ['rules', 'Rules'],
  ['how', 'How it works'],
] as const
type Tab = (typeof TABS)[number][0]

const tabFromHash = (): Tab => (TABS.find(([id]) => `#${id}` === location.hash)?.[0] ?? 'scan')

function storedCity() {
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

  useEffect(() => {
    const on = () => setTab(tabFromHash())
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
    return pack ? <Station pack={pack} full start={start} /> : null
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
            {tab === 'how' && <About packs={packs} />}
          </>
        )}
        <p className="footer">Cleanstream runs entirely in your browser. Photos never leave your device. Rules link to their official sources.</p>
      </main>
    </>
  )
}
