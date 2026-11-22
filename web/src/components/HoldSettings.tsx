import { useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { Button } from './ui/button'

export function HoldSettings({ onOpen, className, children }: { onOpen: () => void; className?: string; children: ReactNode }) {
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
      if (p === 1) { stop(); onOpen() }
    }, 25)
  }
  return <div className="relative flex flex-col items-center">
    <Button variant="outline" size="icon" className={`${className ?? ''} touch-none select-none`} aria-label={t('Hold to change bins')} aria-describedby="station-hold-hint" aria-haspopup="dialog"
      onPointerDown={(e) => { if (e.button === 0 && e.isPrimary) { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); start() } }}
      onPointerLeave={stop} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) start() } }}
      onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stop() } }} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </Button>
    <span id="station-hold-hint" className="text-xs">{t('Hold 2 seconds')}</span>
    <div role="progressbar" aria-label={t('Hold to change bins')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="h-1 w-full bg-current/20"><div className="h-full bg-current" style={{ width: `${progress * 100}%` }} /></div>
  </div>
}
