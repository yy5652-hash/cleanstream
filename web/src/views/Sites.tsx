import { ArrowRight, ArrowUpRight, ClipboardCheck, Monitor, Printer, TrendingDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import { t } from '../i18n'
import type { Pack } from '../rules'
import { pct } from '../ui'

type Metrics = { test: { bin_acc: Record<string, number> }; field?: { bin_acc: Record<string, number> } }

export default function Sites({ pack }: { pack: Pack }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  useEffect(() => {
    let ignore = false
    fetch(`${import.meta.env.BASE_URL}model/metrics.json`).then((r) => r.ok ? r.json() : Promise.reject()).then((m) => { if (!ignore) setMetrics(m) }).catch(() => {})
    return () => { ignore = true }
  }, [])
  const tools = [
    { href: '#station', icon: Monitor, title: t('Set up a station'), copy: t('Put a tablet beside your bins and let people try it.') },
    { href: '#audit', icon: ClipboardCheck, title: t('Audit a bin'), copy: t('See which items are causing contamination.') },
    { href: '#pilot', icon: TrendingDown, title: t('Run a before and after pilot'), copy: t('Measure what changes when feedback arrives at the bin.') },
    { href: '#poster', icon: Printer, title: t('Print a bin poster'), copy: t('Give every bin a clear guide to your local rules.') },
  ]
  return <div className="space-y-16 animate-rise sm:space-y-24">
    <header className="max-w-4xl"><h1 className="text-display">{t('Turn an old tablet into a sorting station.')}</h1><p className="mt-6 max-w-2xl text-lg text-ink-2">{t('Hold up an item. The right bin lights up, using {city} rules. No account, no hardware budget. No photos leave the device.', { city: pack.name })}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button asChild size="lg"><a href="#station">{t('Set up a station')}<ArrowRight aria-hidden /></a></Button><Button asChild variant="outline" size="lg"><a href={`${import.meta.env.BASE_URL}?kiosk&source=demo&city=${encodeURIComponent(pack.id)}`}>{t('See the demo')}</a></Button></div></header>
    <section aria-label={t('Tools for your site')} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{tools.map(({ href, icon: Icon, title, copy }) => <a key={href} href={href} className="group flex min-w-0 flex-col rounded-3xl border border-line bg-card p-6 hover:bg-well"><Icon className="mb-8 size-6 text-ink-2" aria-hidden /><h2 className="text-xl font-semibold tracking-tight">{title}</h2><p className="mt-3 flex-1 text-ink-2">{copy}</p><ArrowUpRight className="mt-6 size-5" aria-hidden /></a>)}</section>
    <section className="max-w-4xl"><h2 className="text-title">{t('Use the tablet you already own.')}</h2><p className="mt-5 text-title text-ink-2">{t('Dedicated AI sorting screens cost $10,000 to $15,000 each to install, plus $5,500 to $6,500 a year. Cleanstream needs a tablet you already own.')}</p><a href="https://www.smartcitiesdive.com/news/ai-recycling-education-oscar-sort-professor-green-los-angeles/756428/" target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center text-sm text-ink-2 underline underline-offset-4">{t('Smart Cities Dive, 2025')}</a></section>
    <section className="border-t border-line pt-8"><h2 className="text-title">{t('Feedback can change what goes in the bin.')}</h2><p className="mt-5 max-w-2xl text-lg text-ink-2">{t('The Recycling Partnership’s cart tagging cut contamination 31% in Atlanta and 37% in Grand Rapids.')}</p><p className="mt-3 max-w-2xl text-ink-2">{t('That is evidence for feedback, not a measured result for Cleanstream. Run a pilot to see what changes at your site.')}</p></section>
    <section><h2 className="text-title">{t('What the model gets right')}</h2><div className="mt-6 grid gap-8 sm:grid-cols-2">{[{ value: metrics?.test.bin_acc.nyc, label: t('Right New York City bin on held-out photos') }, { value: metrics?.field?.bin_acc.nyc, label: t('Right New York City bin on everyday web photos') }].map(({ value, label }) => <div key={label} className="border-t border-line pt-6"><p className="text-display tabular-nums">{value == null ? t('Unavailable') : pct(value)}</p><p className="mt-3 text-ink-2">{label}</p></div>)}</div><a href="#how" className="mt-6 inline-flex min-h-11 items-center gap-2 font-medium underline underline-offset-4">{t('See every result and limitation')}<ArrowRight className="size-4" aria-hidden /></a></section>
    <section className="grid gap-8 border-t border-line pt-8 sm:grid-cols-2"><div><h2 className="text-title">{t('Free')}</h2><p className="mt-4 text-lg text-ink-2">{t('Everything on this site, for any site, no account.')}</p></div><div><h2 className="text-title">{t('Managed, for many sites')}</h2><p className="mt-4 text-lg text-ink-2">{t('Shared dashboards, your branding, support. Not available yet, tell us if you want it.')}</p><a href="https://github.com/yy5652-hash/cleanstream/issues/new?template=pilot.yml" target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 font-medium underline underline-offset-4">{t('Tell us what your sites need')}<ArrowUpRight className="size-4" aria-hidden /></a></div></section>
  </div>
}
