import { useState } from 'react'
import { Printer } from 'lucide-react'
import { encode } from 'uqr'
import { Button } from '../components/ui/button'
import { t } from '../i18n'
import { itemShort } from '../items'
import type { Pack } from '../rules'
import { useStationLog } from '../store'

const OFTEN_CONFUSED = ['paper_cup', 'pizza_box', 'plastic_bag_film', 'foam', 'carton', 'soiled_paper', 'plastic_container', 'plastic_lid_cap', 'snack_wrapper', 'glass_bottle_jar', 'metal_can', 'food_scraps', 'paper', 'cardboard', 'plastic_bottle', 'plastic_utensil_straw']
const field = 'mt-2 min-h-11 w-full min-w-0 rounded-2xl border border-line bg-card px-3 text-ink'
export default function Poster({ pack }: { pack: Pack }) {
  const [title, setTitle] = useState(''), [site, setSite] = useState(''), [source, setSource] = useState('auto')
  const [log] = useStationLog()
  const counts = new Map<string, number>()
  for (const day of Object.values(log[pack.id] ?? {})) for (const [id, n] of Object.entries(day.items)) if (pack.items[id] && n > 0) counts.set(id, (counts.get(id) ?? 0) + n)
  const logged = counts.size > 0 && source !== 'common'
  const items = logged ? [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => id) : OFTEN_CONFUSED
  let order: string[] = []
  try { const x: unknown = JSON.parse(localStorage.getItem(`cleanstream.station.bins.${pack.id}`) ?? 'null'); if (Array.isArray(x)) order = [...new Set(x.filter((id): id is string => typeof id === 'string' && pack.bins.some((b) => b.id === id)))] } catch { /* use city order */ }
  const bins = order.length ? order.map((id) => pack.bins.find((b) => b.id === id)!) : pack.bins.filter((b) => b.kind !== 'special')
  const url = `${location.origin}${import.meta.env.BASE_URL}#scan?city=${pack.id}`
  const qr = encode(url, { border: 4, ecc: 'M' })
  const path = qr.data.flatMap((row, y) => row.flatMap((on, x) => on ? [`M${x} ${y}h1v1h-1z`] : [])).join('')
  return <div className="space-y-8">
    <div className="space-y-5 print:hidden"><header><h1 className="text-display">{t('A sign for your bins')}</h1><p className="mt-3 text-ink-2">{t('Match the columns to the bins from left to right in station setup.')}</p></header><div className="grid gap-5 sm:grid-cols-3"><label>{t('Title')}<input className={field} placeholder={t('Which bin?')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} /></label><label>{t('Site name')}<input className={field} value={site} onChange={(e) => setSite(e.target.value)} maxLength={100} /></label><label>{t('Item source')}<select className={field} value={source} onChange={(e) => setSource(e.target.value)}><option value="auto">{t('Station questions, when available')}</option><option value="common">{t('Commonly confused items')}</option></select></label></div><p className="text-sm text-ink-2">{logged ? t('Uses the most-asked items at this station, for this city.') : t('Uses a built-in list of commonly confused items.')}</p><Button onClick={() => window.print()}><Printer aria-hidden />{t('Print')}</Button></div>
    <article className="measure-print poster-print overflow-hidden rounded-3xl border border-line bg-card p-4 sm:p-8" aria-label={t('Bin poster')}>
      <header className="mb-6"><h2 className="break-words text-title sm:text-display">{title.trim() || t('Which bin?')}</h2>{site.trim() && <p className="mt-2 break-words text-lg text-ink-2">{site}</p>}</header>
      <div className="poster-columns grid gap-3 sm:gap-5" style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }}>{bins.map((bin) => <section key={bin.id} className="min-w-0 overflow-hidden rounded-2xl border border-line"><h3 className="break-words px-2 py-4 text-sm font-semibold sm:px-4 sm:text-title" style={{ background: bin.color, color: bin.ink }}>{bin.name}</h3><ul className="space-y-4 px-2 py-5 text-xs font-medium [overflow-wrap:anywhere] sm:px-4 sm:text-lg">{items.filter((id) => pack.items[id]?.bin === bin.id).slice(0, 5).map((id) => <li key={id}>{itemShort(id)}</li>)}</ul></section>)}</div>
      <footer className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-5"><a href={url} className="shrink-0" aria-label={t('Scan for anything else')}><svg role="img" aria-label={t('QR code to scan an item')} viewBox={`0 0 ${qr.size} ${qr.size}`} className="size-24 bg-paper text-ink" shapeRendering="crispEdges"><path d={path} fill="currentColor" /></svg></a><div className="min-w-0"><p className="font-semibold">{t('Scan for anything else')}</p><p className="mt-2 text-sm text-ink-2">{t('{city} rules', { city: pack.name })}</p><p className="text-sm text-ink-2">{t('Checked {date}', { date: pack.checked })}</p></div></footer>
    </article>
  </div>
}
