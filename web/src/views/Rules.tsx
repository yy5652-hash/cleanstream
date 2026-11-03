import { ArrowUpRight, ChevronDown, Search } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui/button'
import { t, useLang } from '../i18n'
import { itemExamples, itemName, searchable, searchItems } from '../items'
import { binById, type Pack } from '../rules'
import { BinChip } from '../ui'

export default function Rules({ pack, packs }: { pack: Pack; packs: Pack[] }) {
  const { lang } = useLang()
  const [q, setQ] = useState('')
  const [onlyDiff, setOnlyDiff] = useState(false)
  const differs = (id: string) => new Set(packs.filter((p) => p.items[id]).map((p) => binById(p, p.items[id].bin).kind)).size > 1
  const all = Object.keys(pack.items)
  const hits = searchable(q) ? new Set(searchItems(q, all.length)) : null
  const ids = all.filter((id) => (!hits || hits.has(id)) && (!onlyDiff || differs(id)))
  return (
    <div className="space-y-8 animate-rise">
      <header className="max-w-2xl">
        <h1 className="text-display">{t('{city} rules', { city: pack.name })}</h1>
        <p className="mt-5 text-lg text-ink-2">{t('Every answer links to an official source. Find an item, then see why it belongs.')}</p>
        <p className="mt-3 text-sm text-ink-3">{t('Checked {date}. Rule packs are plain JSON, so a campus or city can adapt its own.', { date: pack.checked })}</p>
      </header>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-md">
          <label htmlFor="rules-search" className="mb-2 block font-medium">{t('Filter items')}</label>
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4"><Search className="size-5 shrink-0 text-ink-3" aria-hidden /><input id="rules-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search items')} className="min-h-12 min-w-0 w-full bg-transparent text-ink" /></div>
        </div>
        <Button variant="secondary" className="min-h-12 whitespace-normal" aria-pressed={onlyDiff} onClick={() => setOnlyDiff(!onlyDiff)}>{t('Where places differ ({count})', { count: all.filter(differs).length })}</Button>
      </div>
      {!ids.length && <p role="status" className="py-8 text-ink-2">{t('No items match. Try another name or clear the filter.')}</p>}
      <div className="grid items-start gap-5 lg:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
        {pack.bins.map((bin) => <section key={bin.id} className="min-w-0 overflow-hidden rounded-3xl border border-line bg-card">
          <header className="p-5" style={{ background: bin.color, color: bin.ink }}><h2 className="text-title">{t('{bin}', { bin: bin.name })}</h2><p className="mt-3 text-sm">{t('{accepts}', { accepts: bin.accepts })}</p></header>
          <ul className="divide-y divide-line px-5">
            {ids.filter((id) => pack.items[id].bin === bin.id).map((id) => {
              const rule = pack.items[id]
              return <li key={id} className="py-5">
                <a href={`#scan?item=${encodeURIComponent(id)}&city=${encodeURIComponent(pack.id)}`} className="flex min-h-11 items-center justify-between gap-2 font-semibold hover:underline">{t('{item}', { item: itemName(id) })}<ArrowUpRight className="size-4 shrink-0" aria-hidden /></a>
                <p className="text-sm text-ink-2">{t('{examples}', { examples: itemExamples(id) })}</p>
                <details className="group mt-2"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">{t('Why and how')}<ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden /></summary>
                  <div className="space-y-4 pb-1 text-sm text-ink-2"><p>{t('{reason}', { reason: rule.why })}</p><div><h3 className="font-semibold text-ink">{t('Before you toss it')}</h3><ul className="mt-2 space-y-2">{rule.prep.map((prep) => <li key={prep}>{t('{prep}', { prep })}</li>)}</ul></div>
                    {!!rule.also?.length && <p>{t('Also accepted in: {bins}', { bins: rule.also.map((b) => binById(pack, b).name).join(', ') })}</p>}
                    <a href={rule.source} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">{t('Official source')}</a>
                    <div><h3 className="font-semibold text-ink">{t('Same item in other places')}</h3><ul className="mt-2 space-y-3">{packs.filter((p) => p.id !== pack.id && p.items[id]).map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2"><span>{t('{city}', { city: p.name })}</span><BinChip bin={binById(p, p.items[id].bin)} /></li>)}</ul></div>
                  </div>
                </details>
              </li>
            })}
          </ul>
        </section>)}
      </div>
      <footer className="border-t border-line pt-6"><h2 className="font-semibold">{t('Official sources')}</h2><div className="mt-2 flex flex-wrap gap-x-6">{pack.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm underline underline-offset-4">{t('{source}', { source: s.label })}<ArrowUpRight className="size-4" aria-hidden /></a>)}</div>{lang !== 'en' && <p className="mt-3 text-sm text-ink-3">{t('Translated by Cleanstream. If in doubt, check the official source, which is in English.')}</p>}</footer>
    </div>
  )
}
