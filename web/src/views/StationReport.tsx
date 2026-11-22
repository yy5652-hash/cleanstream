// What a bin station saw: answers shown per day and bin, the items people ask about most, and how often it was unsure.
import { useState } from 'react'
import { t } from '../i18n'
import { itemName } from '../items'
import { binById, type Pack } from '../rules'
import { download, STATION_PROVENANCE_VERSION, lastDays, readCountingSince, startStationPilot, stationId, type StationDay } from '../store'
import { BinChip, pct } from '../ui'
import { Button } from '../components/ui/button'
import { Sheet } from '../components/Sheet'
import { physicalBinFor, readStationProfile, type StationProfile } from '../station-config'

export type Summary = {
  total: number // answers shown with a bin
  unsure: number // times it was not sure and nobody picked
  tapped: number // times it was not sure and the person tapped the item (counted in total)
  bins: Record<string, number>
  items: [string, number][] // most asked first
  perDay: { day: string; bins: Record<string, number>; total: number }[]
}

export function summarize(log: Record<string, StationDay>, days: string[]): Summary {
  const bins: Record<string, number> = {}
  const items: Record<string, number> = {}
  let unsure = 0
  let tapped = 0
  const perDay = days.map((day) => {
    const d = log[day]
    for (const [k, n] of Object.entries(d?.bins ?? {})) bins[k] = (bins[k] ?? 0) + n
    for (const [k, n] of Object.entries(d?.items ?? {})) items[k] = (items[k] ?? 0) + n
    unsure += d?.unsure ?? 0
    tapped += d?.tapped ?? 0
    return { day, bins: d?.bins ?? {}, total: Object.values(d?.bins ?? {}).reduce((a, b) => a + b, 0) }
  })
  return {
    total: perDay.reduce((a, d) => a + d.total, 0),
    unsure,
    tapped,
    bins,
    items: Object.entries(items).sort((a, b) => b[1] - a[1]),
    perDay,
  }
}

export function stationCsv(pack: Pack, log: Record<string, StationDay>, days: string[], profile = readStationProfile(pack)): string {
  const rows = [['date', 'city', 'type', 'id', 'name', 'count', 'current_physical_bin', 'current_profile_approved_by', 'current_profile_approval_date']]
  const device = stationId()
  for (const day of days) {
    const d = log[day]
    if (!d) continue
    for (const entry of d.entries ?? [d]) {
      const first = rows.length
      for (const [id, n] of Object.entries(entry.bins)) rows.push([day, pack.name, 'bin', id, pack.bins.find((b) => b.id === id)?.name ?? id, String(n), physicalBinFor(profile, id)?.label ?? ''])
      for (const [id, n] of Object.entries(entry.items)) rows.push([day, pack.name, 'item', id, itemName(id), String(n)])
      if (entry.tapped) rows.push([day, pack.name, 'settled_by_tap', '', 'Not sure, person tapped the item', String(entry.tapped)])
      if (entry.unsure) rows.push([day, pack.name, 'not_sure', '', 'Not sure', String(entry.unsure)])
      for (let index = first; index < rows.length; index++) {
        const r = rows[index]
        rows[index] = [...r.slice(0, 6), r[6] ?? '', profile.approvedBy ?? '', profile.approvedDate ?? '', device, entry.source ?? t('unknown (before v{version})', { version: STATION_PROVENANCE_VERSION }), entry.appVersion ?? t('unknown')]
      }
    }
  }
  rows[0].push('station_id', 'source', 'app_version')
  return rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')
}

const RANGES = [[1, () => t('Today')], [7, () => t('7 days')], [30, () => t('30 days')]] as const

export default function StationReport({ pack, log, onReset, profile = readStationProfile(pack) }: { pack: Pack; profile?: StationProfile; log: Record<string, StationDay>; onReset: () => void }) {
  const [resetting, setResetting] = useState<'export' | 'confirm' | null>(null)
  const [since, setSince] = useState(() => readCountingSince(pack.id))
  const [resetError, setResetError] = useState('')
  const [range, setRange] = useState<1 | 7 | 30>(7)
  const days = lastDays(range)
  const s = summarize(log, days)
  const asked = s.total + s.unsure
  const known = pack.bins.filter((b) => s.bins[b.id])
  const notRecycling = known.filter((b) => b.kind !== 'recycle').reduce((a, b) => a + s.bins[b.id], 0)
  const peak = Math.max(1, ...s.perDay.map((d) => d.total))

  const csv = () => download(`station-${pack.id}-${days[0]}-to-${days[days.length - 1]}.csv`, stationCsv(pack, log, days, profile))

  return <section className="space-y-8">
    <header><h2 className="text-title">{t('Station report')}</h2><p className="mt-2 max-w-2xl text-ink-2">{t('What people held up at this station, in {city} rules. Counts only: no pictures are kept, and nothing leaves this device.', { city: pack.name })}</p>{since && <p className="mt-2 text-sm text-ink-2">{t('Counting since {date}', { date: since })}</p>}</header>
    <div className="flex flex-wrap gap-2"><div className="flex rounded-2xl bg-well p-1" aria-label={t('Report period')}>{RANGES.map(([n, name]) => <Button key={n} variant={range === n ? 'default' : 'ghost'} aria-pressed={range === n} onClick={() => setRange(n)}>{name()}</Button>)}</div><Button variant="outline" onClick={csv} disabled={!asked}>{t('Export CSV')}</Button><Button variant="ghost" onClick={() => { setResetError(''); setResetting('export') }}>{t('Start fresh for a pilot')}</Button></div>
    <div className="grid gap-6 border-y border-line py-6 sm:grid-cols-3">{[
      [t('Answers shown'), s.total, t('Answered with a bin')],
      [t('Sure enough to answer'), asked ? pct((s.total - s.tapped) / asked) : t('No data'), t('{tapped} settled with a tap, {unsure} left unsure', { tapped: s.tapped, unsure: s.unsure })],
      [t('Not for recycling'), s.total ? pct(notRecycling / s.total) : t('No data'), t('{count} items whose bin here is compost, trash or drop-off', { count: notRecycling })],
    ].map(([name, value, note]) => <div key={name}><h3 className="text-ink-2">{name}</h3><p className="mt-3 text-display">{value}</p><p className="mt-2 text-sm text-ink-2">{note}</p></div>)}</div>
    {!asked && <p className="text-ink-2">{t('Nothing yet in this period. Counts appear as camera answers are shown.')}</p>}
    {asked > 0 && <div className="grid gap-8 lg:grid-cols-2">
      {range > 1 && <section><h3 className="font-semibold">{t('Per day')}</h3><div className="mt-4 flex h-48 gap-1" role="img" aria-label={t('Answers shown per day, last {days} days', { days: range })}>{s.perDay.map((d) => <div key={d.day} className="flex min-w-0 flex-1 flex-col" title={t('{date}: {count} answers', { date: d.day, count: d.total })}><div className="flex flex-1 items-end"><div className="flex w-full flex-col overflow-hidden rounded-t-sm" style={{ height: `${d.total / peak * 100}%` }}>{pack.bins.filter((b) => d.bins[b.id]).map((b) => <div key={b.id} style={{ flex: d.bins[b.id], background: b.color }} />)}</div></div><span className="mt-2 text-center text-xs text-ink-3">{range === 7 ? new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' }) : Number(d.day.slice(8)) % 5 === 0 ? Number(d.day.slice(8)) : ''}</span></div>)}</div><details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm text-ink-2">{t('Daily counts')}</summary>{s.perDay.map((d) => <p key={d.day} className="py-1 text-sm">{t('{date}: {count} answers', { date: d.day, count: d.total })}</p>)}</details></section>}
      <section><h3 className="font-semibold">{t('By bin')}</h3><div className="mt-4 space-y-4">{known.sort((a, b) => s.bins[b.id] - s.bins[a.id]).map((b) => <div key={b.id}><div className="mb-2 flex items-center justify-between gap-3"><BinChip bin={b} /><strong>{s.bins[b.id]}</strong></div><div className="h-2 overflow-hidden rounded-full bg-well"><div className="h-full rounded-full" style={{ width: `${s.bins[b.id] / s.total * 100}%`, background: b.color }} /></div></div>)}</div></section>
      <section className="lg:col-span-2"><h3 className="font-semibold">{t('Most asked about')}</h3><ol className="mt-3 divide-y divide-line">{s.items.filter(([id]) => pack.items[id]).slice(0, 6).map(([id, n], k) => <li key={id} className="flex flex-wrap items-center gap-3 py-4"><span className="text-ink-3">{k + 1}</span><span className="flex-1">{itemName(id)}</span><BinChip bin={binById(pack, pack.items[id].bin)} /><strong>{n}</strong></li>)}</ol></section>
    </div>}
    <Button asChild variant="outline" className="h-auto min-h-11 whitespace-normal py-3"><a href="#poster">{t('Print a poster with these items')}</a></Button>
    <Sheet open={resetting !== null} onClose={() => setResetting(null)} title={t('Start fresh for a pilot')}>
      {resetting === 'export' ? <div className="space-y-4"><p>{t('Export all current station counts before starting a new pilot. The next step clears this city’s counts on this device.')}</p><Button onClick={() => {
        const allDays = Object.keys(log).sort()
        download(`station-${pack.id}-before-pilot.csv`, stationCsv(pack, log, allDays, profile))
        setResetting('confirm')
      }}>{t('Export all counts as CSV')}</Button><Button variant="ghost" onClick={() => setResetting('confirm')}>{t('Continue without export')}</Button></div> : <div className="space-y-4"><p>{t('Clear this station’s counts for {city} and begin counting from today? This cannot be undone.', { city: pack.name })}</p><Button onClick={() => {
        try { setSince(startStationPilot(pack.id, onReset)); setResetting(null) }
        catch { setResetError(t('Could not start the pilot. Counts have not been cleared.')) }
      }}>{t('Clear counts and start pilot')}</Button><p role="alert">{resetError}</p></div>}
    </Sheet>
  </section>
}
