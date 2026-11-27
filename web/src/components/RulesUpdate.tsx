import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import type { Pack } from '../rules'

export function rulesDiffer(loaded: Pack[], fetched: Pack): boolean {
  const previous = loaded.find((pack) => pack.id === fetched.id)
  return !!previous && JSON.stringify(previous) !== JSON.stringify(fetched)
}

// Compare against the English packs actually loaded by this page, never their translations.
export function useRulesUpdate(packs: Pack[] | null, controlledAtLoad: boolean): boolean {
  const [updated, setUpdated] = useState(false)
  const loaded = useRef(packs)
  useEffect(() => { loaded.current = packs }, [packs])
  useEffect(() => {
    const worker = navigator.serviceWorker
    const controllerChanged = () => {
      if (controlledAtLoad) setUpdated(true)
    }
    const message = (event: MessageEvent) => {
      if (event.data?.type === 'rules-activated' && controlledAtLoad) setUpdated(true)
      if (event.data?.type === 'rules-fetched' && event.data.pack && loaded.current && rulesDiffer(loaded.current, event.data.pack)) setUpdated(true)
    }
    worker?.addEventListener('controllerchange', controllerChanged)
    worker?.addEventListener('message', message)
    return () => {
      worker?.removeEventListener('controllerchange', controllerChanged)
      worker?.removeEventListener('message', message)
    }
  }, [controlledAtLoad])
  useEffect(() => {
    if (!packs?.length) return
    let stopped = false
    const controllers = new Set<AbortController>()
    const check = () => {
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
    const refresh = () => {
      void navigator.serviceWorker?.getRegistration?.().then((registration) => registration?.update()).catch(() => {})
      check()
    }
    const timer = setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { stopped = true; clearInterval(timer); controllers.forEach((controller) => controller.abort()); window.removeEventListener('focus', refresh) }
  }, [packs])
  return updated
}

export function RulesUpdateNotice({ reload = true }: { reload?: boolean }) {
  return <p role="status" className="relative z-40 mb-8 rounded-xl border border-line bg-well px-4 py-2 text-sm text-ink">
    {reload ? <button className="min-h-11 underline underline-offset-4" onClick={() => location.reload()}>{t('Rules updated — reload')}</button> : t('Rules updated — reload')}
  </p>
}
