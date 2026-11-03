// App frame: three destinations (top bar on wide screens, tab bar on phones) and one place to set city and language.
import { BookOpen, Building2, Camera, Check, ChevronDown, Download, Globe } from 'lucide-react'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { LANGS, setLang, t, tCity, useLang, type Lang } from '../i18n'
import { PACK_IDS, PACK_NAMES } from '../rules'
import { Logo } from '../ui'

const Sheet = lazy(() => import('./Sheet'))

export type Section = 'sort' | 'learn' | 'sites'

const SECTIONS: [Section, string, () => string, typeof Camera][] = [
  ['sort', '#scan', () => t('Sort'), Camera],
  ['learn', '#rules', () => t('Learn'), BookOpen],
  ['sites', '#sites', () => t('For sites'), Building2],
]

function Row({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button role="radio" aria-checked={on} onClick={onClick} className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-left hover:bg-well ${on ? 'font-semibold' : ''}`}>
      {children}{on && <Check className="size-5 shrink-0" aria-hidden />}
    </button>
  )
}

function PlaceButton({ city, setCity, install }: { city: string; setCity: (c: string) => void; install: (() => void) | null }) {
  const { lang } = useLang()
  const [open, setOpen] = useState(false)
  const cityName = (id: string) => tCity(id) ?? PACK_NAMES[id as keyof typeof PACK_NAMES]
  return (
    <>
      <button onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={t('Change city or language. Now: {city}', { city: cityName(city) })}
        className="flex h-10 min-w-0 items-center gap-1.5 rounded-full bg-well pl-3.5 pr-2.5 text-sm font-medium hover:bg-line">
        <span className="truncate">{cityName(city)}</span><Globe className="size-4 shrink-0 text-ink-2" aria-hidden /><ChevronDown className="size-4 shrink-0 text-ink-2" aria-hidden />
      </button>
      {open && <Suspense fallback={null}><Sheet open onClose={() => setOpen(false)} title={t('Your place')}>
        <h3 className="mb-1 px-3 text-sm font-medium text-ink-2">{t('Rules for')}</h3>
        <div role="radiogroup" aria-label={t('Rules for')} className="grid">
          {PACK_IDS.map((id) => <Row key={id} on={id === city} onClick={() => (setCity(id), setOpen(false))}>{cityName(id)}</Row>)}
        </div>
        <h3 className="mb-1 mt-5 px-3 text-sm font-medium text-ink-2">{t('Language')}</h3>
        <div role="radiogroup" aria-label={t('Language')} className="grid">
          {LANGS.map(([id, name]) => <Row key={id} on={id === lang} onClick={() => void setLang(id as Lang)}>{name}</Row>)}
        </div>
        {install && (
          <button onClick={() => (install(), setOpen(false))} className="mt-5 flex min-h-12 w-full items-center gap-3 rounded-xl bg-well px-3 text-left font-medium hover:bg-line">
            <Download className="size-5" aria-hidden />{t('Install app')}
          </button>
        )}
      </Sheet></Suspense>}
    </>
  )
}

export function Shell({ section, city, setCity, install, children }: { section: Section; city: string; setCity: (c: string) => void; install: (() => void) | null; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">{t('Skip to content')}</a>
      <header className="sticky top-0 z-30 border-b print:hidden border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <a href="#scan" className="flex shrink-0 items-center gap-2.5 text-lg font-semibold tracking-tight text-ink [&_svg]:size-7"><Logo />Cleanstream</a>
          <nav aria-label={t('Main')} className="hidden flex-1 items-center gap-1 md:flex">
            {SECTIONS.map(([id, href, name]) => (
              <a key={id} href={href} aria-current={section === id ? 'page' : undefined} className={`rounded-full px-3.5 py-2 text-[15px] font-medium ${section === id ? 'bg-well text-ink' : 'text-ink-2 hover:text-ink'}`}>{name()}</a>
            ))}
          </nav>
          <div className="ml-auto min-w-0"><PlaceButton city={city} setCity={setCity} install={install} /></div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-8 sm:px-6 md:pb-16 md:pt-12 print:p-0">{children}</main>
      <footer className="mx-auto hidden w-full max-w-6xl px-6 pb-8 text-sm text-ink-3 md:block print:hidden">
        {t('Cleanstream runs entirely in your browser. Photos never leave your device. Rules link to their official sources.')} <a href="#how" className="font-medium text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">{t('How it works')}</a>
      </footer>
      <nav aria-label={t('Main')} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden print:hidden">
        {SECTIONS.map(([id, href, name, Icon]) => (
          <a key={id} href={href} aria-current={section === id ? 'page' : undefined} className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${section === id ? 'text-ink' : 'text-ink-3'}`}>
            <Icon className="size-[22px]" aria-hidden strokeWidth={section === id ? 2.4 : 1.8} />{name()}
          </a>
        ))}
      </nav>
    </div>
  )
}
