// Interface and rule translations. English lives in the code and the rule packs; other languages load from public/i18n/.
import { useSyncExternalStore } from 'react'
import type { Pack } from './rules'

export const LANGS = [['en', 'English'], ['es', 'Español'], ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文']] as const
export type Lang = (typeof LANGS)[number][0]

export type Dict = {
  ui: Record<string, string> // English string as written in the code -> translation; {name} placeholders are kept
  cities: Record<string, string>
  items: Record<string, { name: string; examples: string; aka?: string[] }>
  packs: Record<string, { bins: Record<string, { name: string; accepts: string }>; items: Record<string, { prep: string[]; why: string }> }>
}

const isLang = (l: string | null): l is Lang => LANGS.some(([id]) => id === l)

// ?lang= (a station's kiosk link), then the visitor's earlier choice, then the browser's language
function preferred(): Lang {
  const param = new URLSearchParams(location.search).get('lang')
  if (isLang(param)) return param
  try {
    const stored = localStorage.getItem('cleanstream.lang')
    if (isLang(stored)) return stored
  } catch {
    /* ignore */
  }
  const nav = (navigator.language ?? 'en').toLowerCase()
  if (nav.startsWith('es')) return 'es'
  if (/^zh-(tw|hk|mo|hant)/.test(nav)) return 'zh-Hant'
  return nav.startsWith('zh') ? 'zh-Hans' : 'en'
}

let dict: Dict | null = null
let state = { lang: 'en' as Lang, ready: false }
const listeners = new Set<() => void>()

export async function setLang(next: Lang) {
  let d: Dict | null = null
  if (next !== 'en') {
    try {
      d = await fetch(`${import.meta.env.BASE_URL}i18n/${next}.json`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    } catch {
      next = 'en' // no translation available (offline before it was cached): stay readable in English
    }
  }
  dict = d
  state = { lang: next, ready: true }
  document.documentElement.lang = next
  try {
    localStorage.setItem('cleanstream.lang', next)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  void setLang(preferred())
  // On a very slow network, show English rather than an empty page; the translation replaces it when it arrives
  setTimeout(() => {
    if (state.ready) return
    state = { ...state, ready: true }
    listeners.forEach((l) => l())
  }, 2500)
}

/** Re-renders on a language change; `ready` is false until the first language has loaded. */
export const useLang = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  )

/** Translate an interface string written in English; `{name}` placeholders are filled from vars. */
export function t(s: string, vars?: Record<string, string | number>): string {
  let out = dict?.ui[s] ?? s
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v))
  return out
}

export const tItem = (id: string) => dict?.items[id]
export const tCity = (id: string) => dict?.cities[id]

/** The pack with its bin and rule text in the current language; ids, colours and source links stay as they are. */
export function localizePack(p: Pack): Pack {
  const d = dict?.packs[p.id]
  if (!d) return p
  return {
    ...p,
    name: dict?.cities[p.id] ?? p.name,
    bins: p.bins.map((b) => ({ ...b, ...d.bins[b.id] })),
    items: Object.fromEntries(Object.entries(p.items).map(([id, r]) => [id, { ...r, ...d.items[id] }])),
  }
}

export const speechLang = () => ({ en: 'en-US', es: 'es-US', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW' })[state.lang]
