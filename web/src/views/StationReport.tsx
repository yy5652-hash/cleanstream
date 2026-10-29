// What a bin station saw: items sorted per day and bin, the items people ask about most, and how often it was unsure.
import { useState } from 'react'
import { itemName } from '../items'
import { binById, type Pack } from '../rules'
import { download, lastDays, type StationDay } from '../store'
import { pct } from '../ui'

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

const RANGES = [[1, 'Today'], [7, '7 days'], [30, '30 days']] as const

export default function StationReport({ pack, log, onReset }: { pack: Pack; log: Record<string, StationDay>; onReset: () => void }) {
  const [range, setRange] = useState<1 | 7 | 30>(7)
  const days = lastDays(range)
  const s = summarize(log, days)
  const asked = s.total + s.unsure
  const known = pack.bins.filter((b) => s.bins[b.id])
  const notRecycling = known.filter((b) => b.kind !== 'recycle').reduce((a, b) => a + s.bins[b.id], 0)
  const peak = Math.max(1, ...s.perDay.map((d) => d.total))

  const csv = () => {
    const rows = [['date', 'city', 'type', 'id', 'name', 'count']]
    for (const day of days) {
      const d = log[day]
      if (!d) continue
      for (const [id, n] of Object.entries(d.bins)) rows.push([day, pack.name, 'bin', id, pack.bins.find((b) => b.id === id)?.name ?? id, String(n)])
      for (const [id, n] of Object.entries(d.items)) rows.push([day, pack.name, 'item', id, itemName(id), String(n)])
      if (d.tapped) rows.push([day, pack.name, 'settled_by_tap', '', 'Not sure, person tapped the item', String(d.tapped)])
      if (d.unsure) rows.push([day, pack.name, 'not_sure', '', 'Not sure', String(d.unsure)])
    }
    download(`station-${pack.id}-${days[0]}-to-${days[days.length - 1]}.csv`, rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n'))
  }

  return (
    <section className="card pad report">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Station report</h2>
          <p className="small muted">What people held up at this station, in {pack.name} rules. Counts only: no pictures are kept, and nothing leaves this device.</p>
        </div>
        <div className="row">
          <div className="seg">
            {RANGES.map(([n, name]) => <button key={n} className={range === n ? 'on' : ''} onClick={() => setRange(n)}>{name}</button>)}
          </div>
          <button className="btn" onClick={csv} disabled={!asked}>Export CSV</button>
          <button className="btn" onClick={() => confirm(`Clear this station's counts for ${pack.name}?`) && onReset()} disabled={!Object.keys(log).length}>Reset</button>
        </div>
      </div>

      {!asked ? (
        <p className="muted" style={{ padding: '28px 0 8px' }}>Nothing yet in this period. Start the camera or the demo feed above and counts appear here as people sort.</p>
      ) : (
        <>
          <div className="metric" style={{ marginTop: 16 }}>
            <div className="card"><span className="label">Items sorted</span><b>{s.total}</b><span className="small muted">answered with a bin</span></div>
            <div className="card"><span className="label">Sure enough to answer</span><b>{pct((s.total - s.tapped) / asked)}</b><span className="small muted">{s.tapped} settled with a tap, {s.unsure} left unsure</span></div>
            <div className="card"><span className="label">Not for recycling</span><b>{s.total ? pct(notRecycling / s.total) : '–'}</b><span className="small muted">{notRecycling} items whose bin here is compost, trash or drop-off</span></div>
          </div>

          <div className="report-grid">
            {range > 1 && (
              <div>
                <div className="label">Per day</div>
                <div className="report-chart" role="img" aria-label={`Items sorted per day, last ${range} days`}>
                  {s.perDay.map((d) => (
                    <div key={d.day} className="col" title={`${d.day}: ${d.total}`}>
                      <div className="area">
                        <div className="stack" style={{ height: `${(d.total / peak) * 100}%` }}>
                          {pack.bins.filter((b) => d.bins[b.id]).map((b) => <i key={b.id} style={{ flex: d.bins[b.id], background: b.color }} />)}
                        </div>
                      </div>
                      <span>{range === 7 ? new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' }) : Number(d.day.slice(8)) % 5 === 0 ? Number(d.day.slice(8)) : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="label">By bin</div>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {known.sort((a, b) => s.bins[b.id] - s.bins[a.id]).map((b) => (
                  <div key={b.id} className="hbar">
                    <span className="small">{b.name}</span>
                    <span className="track"><i style={{ width: `${(s.bins[b.id] / s.total) * 100}%`, background: b.color }} /></span>
                    <strong className="small">{s.bins[b.id]}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="label">Most asked about</div>
              <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                {s.items.slice(0, 6).map(([id, n]) => {
                  const b = binById(pack, pack.items[id].bin)
                  return (
                    <div key={id} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                      <span className="small">{itemName(id)}</span>
                      <span className="row" style={{ gap: 8 }}><span className="chip" style={{ background: b.color, color: b.ink }}>{b.name}</span><strong className="small">{n}</strong></span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {s.items.length > 0 && (
            <div className="notice" style={{ background: 'var(--accent-soft)', color: '#0b4a3a', marginTop: 18 }}>
              <strong>Sign idea:</strong> {itemName(s.items[0][0])} is what people ask about most here. A sign above the bins that says “{itemName(s.items[0][0])}: {binById(pack, pack.items[s.items[0][0]].bin).name}” answers it before anyone has to ask.
            </div>
          )}
        </>
      )}
    </section>
  )
}
