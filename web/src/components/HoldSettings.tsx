import { useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { hasOperatorPin, useHasOperatorPin } from '../operator-pin'
import { PinChallenge } from './OperatorPin'
import { Sheet } from './Sheet'
import { Button } from './ui/button'

export function HoldSettings({ city, onOpen, onPromptChange, className, children }: { city: string; onOpen: () => void; onPromptChange?: (open: boolean) => void; className?: string; children: ReactNode }) {
  const hasPin = useHasOperatorPin(city)
  const [prompt, setPrompt] = useState(false)
  const closePrompt = () => { setPrompt(false); onPromptChange?.(false) }
  const name = hasPin ? t('Hold 2 seconds, then enter the operator PIN to change settings') : t('Hold 2 seconds to change settings')
  const [progress, setProgress] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const stop = () => { if (timer.current !== null) clearInterval(timer.current); timer.current = null; setProgress(0) }
  useEffect(() => {
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', stop)
    return () => { if (timer.current !== null) clearInterval(timer.current); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop) }
  }, [])
  const start = () => {
    if (timer.current !== null) return
    const began = performance.now()
    timer.current = setInterval(() => {
      const p = Math.min(1, (performance.now() - began) / 2000)
      setProgress(p)
      if (p === 1) {
        stop()
        if (hasOperatorPin(city)) { setPrompt(true); onPromptChange?.(true) }
        else onOpen()
      }
    }, 25)
  }
  return <div className="relative">
    <Button variant="outline" size="icon" className={`${className ?? ''} touch-none select-none`} aria-label={name} aria-describedby="station-hold-hint" aria-haspopup="dialog"
      onPointerDown={(e) => { if (e.button === 0 && e.isPrimary) { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); start() } }}
      onPointerLeave={stop} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) start() } }}
      onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stop() } }} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </Button>
    {/* The hint and progress hang below the button so it lines up with the other header buttons. */}
    <span id="station-hold-hint" className="pointer-events-none absolute top-full right-0 mt-1 text-xs whitespace-nowrap text-ink-2">{hasPin ? t('Hold 2 seconds + PIN') : t('Hold 2 seconds')}</span>
    <div role="progressbar" aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="pointer-events-none absolute inset-x-1 bottom-0.5 h-1 overflow-hidden rounded-full"><div className="h-full bg-current" style={{ width: `${progress * 100}%` }} /></div>
    {prompt && <Sheet open onClose={closePrompt} title={t('Unlock station settings')}><PinChallenge city={city} onUnlock={() => { closePrompt(); onOpen() }} /></Sheet>}
  </div>
}
