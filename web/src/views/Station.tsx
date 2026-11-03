import { ArrowDown, Check, Globe, Maximize, Minimize, Settings2, Video, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Sheet } from '../components/Sheet'
import { Button } from '../components/ui/button'
import { LANGS, setLang, speechLang, t, useLang } from '../i18n'
import { itemName } from '../items'
import { classify, loadModel, useModel } from '../model/client'
import { partsOf } from '../parts'
import { answer, binById, type Answer, type Pack } from '../rules'
import { readConfig, useStationBins } from '../station-config'
import { lastDays, record, today, useStationLog } from '../store'
import { BinChip, pct, sampleUrl, useSamples } from '../ui'
import { changedCells, focusBox, GRID_H, GRID_W, isPresent, isStill, type Box } from './motion'
import { BinOrder } from './StationSetup'

type Source = 'off' | 'camera' | 'demo'
type Phase = 'idle' | 'looking' | 'result' | 'thanks'

const TIPS = ['paper_cup', 'plastic_bag_film', 'pizza_box', 'carton', 'battery', 'foam', 'snack_wrapper', 'aluminum_foil', 'soiled_paper']
const RESULT_MS = 3600
const UNSURE_MS = 6000
const LANG_RESET_MS = 45000
const THANKS_MS = 1400

// Small colour thumbnail of a frame, for cheap motion and presence checks.
function signature(v: HTMLVideoElement, c: HTMLCanvasElement): Float32Array | null {
  if (!v.videoWidth) return null
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(v, 0, 0, GRID_W, GRID_H)
  const d = ctx.getImageData(0, 0, GRID_W, GRID_H).data
  const out = new Float32Array(GRID_W * GRID_H * 3)
  for (let i = 0; i < GRID_W * GRID_H; i++) for (let k = 0; k < 3; k++) out[i * 3 + k] = d[i * 4 + k] / 255
  return out
}

// The part of the frame to look at: the box around the item, or a centred square when there is no box.
function cropFrame(v: HTMLVideoElement, box: Box | null): HTMLCanvasElement {
  const side = Math.min(v.videoWidth, v.videoHeight)
  const b = box ?? { x: (v.videoWidth - side) / 2, y: (v.videoHeight - side) / 2, w: side, h: side }
  const c = document.createElement('canvas')
  c.width = c.height = Math.max(256, Math.round(b.w))
  c.getContext('2d')!.drawImage(v, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height)
  return c
}

function snapshot(c: HTMLCanvasElement): string {
  return c.toDataURL('image/jpeg', 0.8)
}

// Says the answer out loud, when the station is set to: for people who can't read the screen from where they stand.
function say(text: string) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = speechLang()
  speechSynthesis.speak(u)
}

function useVoice(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem('cleanstream.station.voice') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('cleanstream.station.voice', on ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [on])
  return [on, setOn]
}

function Rotating({ items, every, render }: { items: string[]; every: number; render: (s: string) => ReactNode }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setI((x) => (x + 1) % items.length), every)
    return () => clearInterval(timer)
  }, [items.length, every])
  return <span key={i} className="animate-rise">{render(items[i % items.length])}</span>
}

function Countdown() {
  const [remaining, setRemaining] = useState(1)
  useEffect(() => {
    const start = performance.now()
    const timer = window.setInterval(() => setRemaining(Math.max(0, 1 - (performance.now() - start) / UNSURE_MS)), 50)
    return () => clearInterval(timer)
  }, [])
  return <div role="progressbar" aria-label={t('Time left to choose')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(remaining * 100)} className="h-1 w-full overflow-hidden rounded-full bg-well">
    <div className="h-full origin-left bg-ink" style={{ transform: `scaleX(${remaining})` }} />
  </div>
}

export default function Station({ pack, start = 'off', wait = 0 }: { pack: Pack; start?: Source; wait?: number }) {
  const model = useModel()
  const samples = useSamples()
  const config = useMemo(() => readConfig(location.search), [])
  const [source, setSource] = useState<Source>(start)
  const [phase, setPhase] = useState<Phase>('idle')
  const [ans, setAns] = useState<Answer | null>(null)
  const [shot, setShot] = useState<string | null>(null)
  const [frame, setFrame] = useState<string | null>(null)
  const [settings, setSettings] = useState(false)
  const [languages, setLanguages] = useState(false)
  const [cameraFailed, setCameraFailed] = useState(false)
  const [scanFailed, setScanFailed] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const unsure = useRef(false)
  const [binIds, setBinIds] = useStationBins(pack, config.city === pack.id ? config.bins : undefined)
  const [log, setLog] = useStationLog()
  const [voice, setVoice] = useVoice()
  const speak = useRef(voice)
  useEffect(() => { speak.current = voice }, [voice])
  const video = useRef<HTMLVideoElement>(null)
  const busy = useRef(false)
  const session = useRef(0)
  const timers = useRef<number[]>([])
  const day = today()
  const total = lastDays(7, day).reduce((sum, date) => sum + Object.values(log[pack.id]?.[date]?.bins ?? {}).reduce((a, b) => a + b, 0), 0)
  const bins = binIds.map((id) => binById(pack, id))
  const tips = useMemo(() => TIPS.filter((id) => pack.items[id]), [pack])
  const { lang } = useLang()
  const homeLang = useRef(lang)
  const paused = useRef(false)
  useEffect(() => { paused.current = settings || languages }, [settings, languages])
  const ready = useRef(false)
  useEffect(() => { ready.current = model.status === 'ready' }, [model.status])

  useEffect(() => {
    if (source !== 'off' && model.status === 'idle') loadModel()
  }, [source, model.status])

  useEffect(() => {
    if (lang === homeLang.current || phase !== 'idle' || languages) return
    const timer = setTimeout(() => void setLang(homeLang.current), LANG_RESET_MS)
    return () => clearTimeout(timer)
  }, [lang, phase, languages])

  useEffect(() => {
    if (source === 'off' || !navigator.wakeLock) return
    let stopped = false
    let pending = false
    let lock: WakeLockSentinel | null = null
    const acquire = async () => {
      if (stopped || pending || document.visibilityState !== 'visible' || (lock && !lock.released)) return
      pending = true
      try {
        const next = await navigator.wakeLock.request('screen')
        if (stopped) await next.release()
        else lock = next
      } catch { /* Wake lock is best effort. */ }
      finally { pending = false }
    }
    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release().catch(() => {})
    }
  }, [source])

  useEffect(() => {
    const changed = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])

  const later = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms))
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const run = async (src: Blob | HTMLCanvasElement, picture: string) => {
    if (busy.current || model.status !== 'ready' || paused.current) return
    const currentSession = session.current
    busy.current = true
    clearTimers()
    if (unsure.current) setLog((l) => record(l, pack.id, today(), null))
    unsure.current = false
    setChosen(null)
    setShot(picture)
    setScanFailed(false)
    setPhase('looking')
    try {
      const r = await classify(src)
      if (session.current !== currentSession) return
      const a = answer(pack, model.classes, r.probs)
      setAns(a)
      setPhase('result')
      const bin = a.bins[0].bin.id
      const item = a.items.find((it) => pack.items[it.id]?.bin === bin)!.id
      if (a.sure) {
        setLog((l) => record(l, pack.id, today(), { bin, item }))
        if (speak.current) say(t('{item}. {bin}.', { item: itemName(item), bin: a.bins[0].bin.name }))
        later(RESULT_MS, () => { setPhase('thanks'); later(THANKS_MS, () => setPhase('idle')) })
      } else {
        unsure.current = true
        if (speak.current) say(t('Not sure. Which one is it? Tap it on the screen.'))
        later(UNSURE_MS, () => {
          if (unsure.current) setLog((l) => record(l, pack.id, today(), null))
          unsure.current = false
          setPhase('idle')
        })
      }
    } catch {
      if (session.current === currentSession) { setScanFailed(true); setPhase('idle') }
    } finally {
      if (session.current === currentSession) busy.current = false
    }
  }
  const latestRun = useRef(run)
  useEffect(() => { latestRun.current = run })

  // Discard unfinished inference when the station stops or changes city.
  useEffect(() => () => {
    session.current++
    busy.current = false
    unsure.current = false
    clearTimers()
    if ('speechSynthesis' in window) speechSynthesis.cancel()
  }, [source, pack.id])

  useEffect(() => {
    if (source !== 'camera') return
    let stopped = false
    let stream: MediaStream | null = null
    let timer = 0
    const c = document.createElement('canvas')
    c.width = GRID_W
    c.height = GRID_H
    let empty: Float32Array | null = null
    let prev: Float32Array | null = null
    let still = 0
    let shown = false
    const fail = () => {
      if (!stopped) { setCameraFailed(true); setSource('off'); setPhase('idle') }
    }
    if (!navigator.mediaDevices?.getUserMedia) { fail(); return }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } }).then((s) => {
      if (stopped) { s.getTracks().forEach((track) => track.stop()); return }
      stream = s
      if (video.current) { video.current.srcObject = s; void video.current.play().catch(fail) }
      timer = window.setInterval(() => {
        const v = video.current
        const sig = v && signature(v, c)
        if (!v || !sig) return
        if (!empty) empty = sig
        const present = isPresent(sig, empty)
        still = prev && isStill(sig, prev) ? still + 1 : 0
        prev = sig
        if (!present) {
          shown = false
          if (still > 8) empty = sig
        } else if (still >= 2 && !shown && ready.current && !busy.current && !paused.current) {
          shown = true
          const box = focusBox(changedCells(sig, empty), v.videoWidth, v.videoHeight)
          const crop = cropFrame(v, box)
          void latestRun.current(crop, snapshot(crop))
        }
      }, 250)
    }).catch(fail)
    return () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach((track) => track.stop()) }
  }, [source, pack.id])

  // Held-out test photos follow the same inference and counting path as the camera.
  useEffect(() => {
    if (source !== 'demo' || !samples.length || model.status !== 'ready') return
    let i = 0
    let stopped = false
    let timer = 0
    const controller = new AbortController()
    const step = async () => {
      if (stopped) return
      if (paused.current) { timer = window.setTimeout(step, 500); return }
      try {
        const sample = samples[i++ % samples.length]
        const picture = sampleUrl(sample)
        setFrame(picture)
        const response = await fetch(picture, { signal: controller.signal })
        if (!response.ok) throw new Error('Sample unavailable')
        const blob = await response.blob()
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (!stopped) await latestRun.current(blob, picture)
      } catch { if (!stopped) setScanFailed(true) }
      if (!stopped) timer = window.setTimeout(step, Math.max(UNSURE_MS, RESULT_MS + THANKS_MS) + 1600)
    }
    timer = window.setTimeout(step, Math.max(0, wait))
    return () => { stopped = true; clearTimeout(timer); controller.abort() }
  }, [source, samples, pack.id, model.status, wait])

  const options = ans ? ans.bins.slice(0, 2).map(({ bin }) => ans.items.find((it) => pack.items[it.id]?.bin === bin.id)!.id) : []
  const item = chosen ?? (ans ? options[0] : null)
  const rule = item ? pack.items[item] : null
  const target = phase === 'result' && rule && (ans?.sure || chosen) ? binById(pack, rule.bin) : null
  const here = target && binIds.includes(target.id)
  const parts = target && item ? partsOf(pack, item).slice(1) : []
  const choosing = phase === 'result' && ans && !target
  const partNames: Record<string, string> = { Cup: t('Cup'), Lid: t('Lid'), Sleeve: t('Sleeve'), Straw: t('Straw') }
  const partNotes: Record<string, string> = {
    'Loose, flimsy lids go in the black bin.': t('Loose, flimsy lids go in the black bin.'),
    'If it is #6 or foam, the black cart.': t('If it is #6 or foam, the black cart.'),
    'Only if it is 3 inches or bigger.': t('Only if it is 3 inches or bigger.'),
    'Rules for loose lids vary. Check your town.': t('Rules for loose lids vary. Check your town.'),
  }
  const choose = (id: string) => {
    if (!unsure.current) return
    clearTimers()
    unsure.current = false
    setChosen(id)
    const bin = pack.items[id].bin
    setLog((l) => record(l, pack.id, today(), { bin, item: id, tapped: true }))
    if (speak.current) say(t('{item}. {bin}.', { item: itemName(id), bin: binById(pack, bin).name }))
    later(RESULT_MS, () => { setPhase('thanks'); later(THANKS_MS, () => setPhase('idle')) })
  }
  const changeSource = (next: Source) => {
    setSource(next); setPhase('idle'); setAns(null); setChosen(null); setCameraFailed(false); setScanFailed(false)
  }
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {})
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }
  const toggleVoice = () => {
    if (!voice) say(t('Answers will be spoken.'))
    else if ('speechSynthesis' in window) speechSynthesis.cancel()
    setVoice(!voice)
  }
  const rootStyle = {
    '--c-paper': '#0b0f0d', '--c-card': '#131714', '--c-well': '#191e1a', '--c-ink': '#f4f5f1',
    '--c-ink-2': '#b7bfb9', '--c-ink-3': '#929c95', '--c-line': '#353e38',
    background: '#0b0f0d', color: target?.ink ?? '#f4f5f1', colorScheme: 'dark',
  } as CSSProperties
  const iconButton = 'shrink-0 border-current/30 text-inherit hover:bg-transparent hover:text-inherit hover:opacity-80 focus-visible:ring-current'

  return (
    <div data-phase={phase} role="main" translate="no" style={rootStyle} className="relative isolate flex min-h-dvh w-full min-w-0 flex-col overflow-x-clip [overflow-wrap:anywhere]">
      {target && <div key={`${item}-${target.id}`} className="pointer-events-none absolute inset-0 -z-10 animate-flood" style={{ background: target.color }} />}
      <h1 className="sr-only">{t('Cleanstream bin station: {city} rules', { city: pack.name })}</h1>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="min-w-0 flex-1 text-sm leading-relaxed">
          <span className="hidden font-semibold sm:inline">Cleanstream</span><span className="mx-2 hidden sm:inline" aria-hidden>·</span><span>{pack.name}</span>
          {config.site && <span className="block font-medium sm:ml-2 sm:inline">{config.site}</span>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" className={`${iconButton} px-2.5`} aria-label={t('Change language')} aria-haspopup="dialog" onClick={() => setLanguages(true)}><Globe aria-hidden /><span lang={lang} className="hidden sm:inline">{lang === 'en' ? t('English') : lang === 'es' ? t('Spanish') : lang === 'zh-Hans' ? t('Simplified Chinese') : t('Traditional Chinese')}</span></Button>
          <Button variant="outline" size="icon" className={iconButton} aria-pressed={voice} aria-label={voice ? t('Turn voice off') : t('Turn voice on')} onClick={toggleVoice}>{voice ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}</Button>
          <Button variant="outline" size="icon" className={iconButton} aria-label={isFullscreen ? t('Exit full screen') : t('Full screen')} onClick={fullscreen}>{isFullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}</Button>
          <Button variant="outline" size="icon" className={iconButton} aria-label={t('Set up bins')} aria-haspopup="dialog" onClick={() => setSettings(true)}><Settings2 aria-hidden /></Button>
        </div>
      </header>
      {source === 'demo' && <p className="px-4 text-sm font-medium sm:px-6">{t('Example data')}<span aria-hidden> · </span>{t('Demo feed')}</p>}

      <div className="relative flex flex-1 flex-col justify-center gap-[3vmin] px-[5vmin] py-[4vmin] text-center">
        <div aria-live="polite" aria-atomic="true">
          {(phase === 'idle' || phase === 'looking') && <>
            <h2 className={`text-[14vmin] leading-[1.02] font-semibold tracking-[-0.04em] ${phase === 'looking' ? 'animate-breathe' : ''}`}>{phase === 'looking' ? t('Looking…') : t('Hold it up')}</h2>
            {phase === 'idle' && tips.length > 0 && <p className="mx-auto mt-[3vmin] max-w-4xl text-[max(1rem,3vmin)] leading-snug">
              <Rotating items={tips} every={5200} render={(id) => t('{item} goes in {bin} here.', { item: itemName(id), bin: binById(pack, pack.items[id].bin).name })} />
            </p>}
          </>}
          {target && item && rule && <div className="animate-rise">
            {shot && <img src={shot} alt={t('What the camera saw')} className="mx-auto mb-[2.5vmin] size-[16vmin] min-h-20 min-w-20 rounded-[2.5vmin] object-cover shadow-2xl ring-4 ring-white/50" />}
            <p className="text-[max(1.25rem,4vmin)] font-medium">{itemName(item)}</p>
            <h2 className="my-[3vmin] min-h-[10dvh] text-[18vmin] leading-[0.95] font-semibold tracking-[-0.04em]">{target.name}</h2>
            <p className="mx-auto max-w-5xl text-[max(1.125rem,3.5vmin)] leading-snug">{here ? rule.prep[0] : t('Not in these bins. {prep}', { prep: rule.prep[0] ?? '' })}</p>
            {parts.length > 0 && <ul className="mt-[3vmin] flex flex-wrap justify-center gap-3">
              {parts.map((part) => <li key={part.name} className="max-w-72 rounded-2xl border border-current/30 px-4 py-3 text-left">
                <div className="flex flex-wrap items-center gap-2 text-[max(1rem,2.5vmin)] font-medium"><span>{t('{part}:', { part: partNames[part.name] ?? t(part.name) })}</span><BinChip bin={part.bin} /></div>
                {part.note && <p className="mt-1 text-sm">{partNotes[part.note] ?? t(part.note)}</p>}
              </li>)}
            </ul>}
          </div>}
          {choosing && <div className="mx-auto w-full max-w-5xl animate-rise">
            {shot && <img src={shot} alt={t('What the camera saw')} className="mx-auto mb-[2.5vmin] size-[13vmin] min-h-16 min-w-16 rounded-[2vmin] object-cover ring-4 ring-white/30" />}
            <h2 className="text-[max(2rem,7vmin)] leading-tight font-semibold tracking-tight">{t('Hmm, which one is it?')}</h2>
            <div className="my-[4vmin] grid gap-3 sm:grid-cols-2">
              {options.map((id) => {
                const bin = binById(pack, pack.items[id].bin)
                return <button key={id} onClick={() => choose(id)} className="flex min-h-[22vmin] flex-col justify-between gap-4 rounded-3xl p-[4vmin] text-left focus-visible:outline-ink" style={{ background: bin.color, color: bin.ink }}>
                  <span className="text-[max(1.5rem,5vmin)] leading-tight font-semibold">{itemName(id)}</span><span className="text-[max(1rem,3vmin)]">{bin.name}</span>
                </button>
              })}
            </div>
            <p className="mb-4 text-[max(1rem,2.5vmin)]">{t('Tap the one you are holding.')}</p>
          </div>}
          {phase === 'thanks' && <div className="animate-rise"><Check className="mx-auto mb-[3vmin] size-[10vmin]" aria-hidden /><h2 className="text-[12vmin] leading-tight font-semibold tracking-tight">{t('Thank you')}</h2><p className="mt-3 text-[max(1rem,3vmin)]">{t('Ready for the next item.')}</p></div>}
        </div>
        {choosing && <Countdown key={shot} />}

        <div className={phase === 'idle' || phase === 'looking' ? 'mx-auto flex w-full flex-col items-center gap-3' : 'hidden'}>
          <div className={`relative aspect-[4/3] w-[32vmin] min-w-32 overflow-hidden rounded-3xl border border-line bg-well ${phase === 'looking' ? 'ring-2 ring-ink' : ''}`}>
            {source === 'camera' && <video ref={video} autoPlay playsInline muted aria-label={t('Live camera preview')} className="h-full w-full object-cover" />}
            {source === 'demo' && frame && <img src={frame} alt={t('Example item')} className="h-full w-full object-cover" />}
            {(source === 'off' || (source === 'demo' && !frame)) && <Video className="absolute inset-0 m-auto size-8 text-ink-2" aria-hidden />}
            <div aria-hidden className={`pointer-events-none absolute border-ink ${phase === 'looking' ? 'inset-[12%] scale-95' : 'inset-[18%]'} transition-all`}>
              <span className="absolute left-0 top-0 size-5 border-l-2 border-t-2 border-ink" /><span className="absolute right-0 top-0 size-5 border-r-2 border-t-2 border-ink" /><span className="absolute bottom-0 left-0 size-5 border-b-2 border-l-2 border-ink" /><span className="absolute bottom-0 right-0 size-5 border-b-2 border-r-2 border-ink" />
            </div>
          </div>
          {source !== 'off' && <p className="text-sm text-ink-2">{source === 'demo' ? t('Demo feed: held-out test photos') : t('Hold your item here')}</p>}
          {source === 'off' && <div className="max-w-xl">
            <p role={cameraFailed ? 'alert' : undefined} className="text-base text-ink-2">{cameraFailed ? t('Camera unavailable. Allow camera access, or try the demo feed.') : t('Start the camera, then hold up an item.')}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => changeSource('camera')}>{cameraFailed ? t('Try camera again') : t('Start camera')}</Button><Button variant="secondary" onClick={() => changeSource('demo')}>{t('Try the demo feed')}</Button></div>
          </div>}
          {source !== 'off' && model.status === 'loading' && <p role="status" className="text-sm text-ink-2">{model.total ? t('Getting ready… {progress}', { progress: pct(Math.min(1, model.loaded / model.total)) }) : t('Getting ready…')}</p>}
          {(scanFailed || model.status === 'error') && <div role="alert" className="max-w-xl text-sm text-ink-2"><p>{t('Could not read that item. Try again.')}</p><Button variant="outline" className="mt-2" onClick={() => { if (model.status === 'error') location.reload(); else changeSource('off') }}>{model.status === 'error' ? t('Reload station') : t('Restart station')}</Button></div>}
          {source === 'demo' && model.status === 'ready' && !samples.length && <p role="status" className="text-sm text-ink-2">{t('Demo photos are not available yet. Check your connection or use the camera.')} <button onClick={() => changeSource('camera')} className="min-h-11 rounded-2xl px-2 underline">{t('Start camera')}</button></p>}
          {phase === 'idle' && total > 0 && <p className="mt-1 text-[max(0.875rem,2vmin)] text-ink-2">{t('{count} items sorted here in the last 7 days', { count: total })}</p>}
        </div>
      </div>

      <div className="mt-auto px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[8vmin] sm:px-4">
        <div aria-label={t('Your bins, left to right')} className="grid gap-1.5 sm:gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, bins.length)}, minmax(0, 1fr))` }}>
          {bins.map((bin) => <div key={bin.id} className={`relative flex min-h-[12vmin] min-w-0 items-center justify-center rounded-2xl px-1 py-[3vmin] text-center text-[clamp(0.75rem,2.8vmin,2.5rem)] leading-tight font-semibold ${target && target.id !== bin.id ? 'grayscale' : ''}`} style={{ background: bin.color, color: bin.ink }}>
            {target?.id === bin.id && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl border-[3px] border-current" />}
            {target?.id === bin.id && <ArrowDown className="absolute -top-[8vmin] left-1/2 h-[7vmin] w-[7vmin] -translate-x-1/2" strokeWidth={3} aria-label={t('Use this bin')} />}
            {bin.name}
          </div>)}
        </div>
        {!bins.length && <Button variant="outline" className="w-full" onClick={() => setSettings(true)}>{t('Choose the bins at this station')}</Button>}
      </div>

      <Sheet open={languages} onClose={() => setLanguages(false)} title={t('Language')} className="[&_button[aria-label]]:min-h-11 [&_button[aria-label]]:min-w-11">
        <div role="radiogroup" aria-label={t('Language')} className="grid gap-1">
          {LANGS.map(([id]) => <button key={id} lang={id} role="radio" aria-checked={lang === id} onClick={() => { void setLang(id); setLanguages(false) }} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 text-left font-medium hover:bg-well">
            {id === 'en' ? t('English') : id === 'es' ? t('Spanish') : id === 'zh-Hans' ? t('Simplified Chinese') : t('Traditional Chinese')}{lang === id && <Check className="size-5" aria-hidden />}
          </button>)}
        </div>
      </Sheet>
      <Sheet open={settings} onClose={() => setSettings(false)} title={t('Set up bins')} className="[&_button[aria-label]]:min-h-11 [&_button[aria-label]]:min-w-11">
        <BinOrder pack={pack} ids={binIds} onChange={setBinIds} />
        <Button className="mt-6 w-full" onClick={() => setSettings(false)} disabled={!binIds.length}>{t('Done')}</Button>
      </Sheet>
    </div>
  )
}
