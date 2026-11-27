// Give first-visit isolation a bounded opportunity before mounting the editable UI.
export async function prepareServiceWorker() {
  const sw = navigator.serviceWorker
  if (!sw) return false
  const registration = sw.register(`${import.meta.env.BASE_URL}sw.js`)
  if (sw.controller || self.crossOriginIsolated) {
    void registration.catch(() => {})
    return false
  }
  let controlled!: () => void
  const claimed = new Promise<void>((resolve) => { controlled = resolve })
  sw.addEventListener('controllerchange', controlled)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      registration.then(() => sw.controller ? undefined : claimed),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 2000) }),
    ])
    if (!sw.controller || window.__cleanstreamInteracted || sessionStorage.getItem('cleanstream.isolating')) return false
    sessionStorage.setItem('cleanstream.isolating', '1')
    location.reload()
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    sw.removeEventListener('controllerchange', controlled)
  }
}

declare global {
  interface Window { __cleanstreamInteracted?: boolean }
}
