import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import type { Pack } from '../rules'

export function rulesDiffer(loaded: Pack[], fetched: Pack): boolean {
  const previous = loaded.find((pack) => pack.id === fetched.id)
  return !!previous && JSON.stringify(previous) !== JSON.stringify(fetched)
}

// Compare against the English packs actually loaded by this page, never their translations.
export function useRulesUpdate(packs: Pack[] | null): boolean {
  const [updated, setUpdated] = useState(false)
  const loaded = useRef(packs)
  useEffect(() => { loaded.current = packs }, [packs])
  useEffect(() => {
    const worker = navigator.serviceWorker
    let controlled = !!worker?.controller
    const controllerChanged = () => {
      if (controlled) setUpdated(true)
      controlled = true
    }
    const message = (event: MessageEvent) => {
      if (event.data?.type === 'rules-activated') setUpdated(true)
      if (event.data?.type === 'rules-fetched' && event.data.pack && loaded.current && rulesDiffer(loaded.current, event.data.pack)) setUpdated(true)
    }
    worker?.addEventListener('controllerchange', controllerChanged)
    worker?.addEventListener('message', message)
    if (import.meta.env.PROD) void worker?.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
    return () => {
      worker?.removeEventListener('controllerchange', controllerChanged)
      worker?.removeEventListener('message', message)
    }
  }, [])
  useEffect(() => {
    if (!packs?.length) return
    let stopped = false
    const controllers = new Set<AbortController>()
    const check = () => {
      void navigator.serviceWorker?.getRegistration?.().then((registration) => registration?.update()).catch(() => {})
      for (const pack of packs) {
        const controller = new AbortController()
        controllers.add(controller)
        const timer = setTimeout(() => controller.abort(), 4000)
        void fetch(`${import.meta.env.BASE_URL}rules/${pack.id}.json`, { cache: 'no-cache', signal: controller.signal })
          .then((response) => response.ok ? response.json() : null)
          .then((fresh) => { if (!stopped && fresh && rulesDiffer(packs, fresh)) setUpdated(true) })
          .catch(() => {}).finally(() => { clearTimeout(timer); controllers.delete(controller) })
      }
    }
    check()
    const timer = setInterval(check, 60000)
    window.addEventListener('focus', check)
    return () => { stopped = true; clearInterval(timer); controllers.forEach((controller) => controller.abort()); window.removeEventListener('focus', check) }
  }, [packs])
  return updated
}

export function RulesUpdateNotice({ reload = true }: { reload?: boolean }) {
  return <p role="status" className="relative z-40 rounded-xl border border-line bg-well px-4 py-2 text-sm text-ink">
    {reload ? <button className="min-h-11 underline underline-offset-4" onClick={() => location.reload()}>{t('Rules updated — reload')}</button> : t('Rules updated — reload')}
  </p>
}
