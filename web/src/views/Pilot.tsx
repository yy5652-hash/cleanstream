import { useRef, useState } from 'react'
import { Check, Download, Plus, Printer, Trash2, Upload } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Sheet } from '../components/Sheet'
import { t } from '../i18n'
import { auditBins, createPilot, defaultPrimaryBin, observedEffect, hasCounts, exportPilot, mergePilots, netEffect, stations, verdict, rate, validWeights, type Arm, type Phase, type Pilot as PilotT, type PilotAudit, type Weights, type Outcome, type StationResult } from '../pilot'
import type { Pack } from '../rules'
import { download, today, uid } from '../store'
import { usePilotRecords } from '../pilot-records'
import { pct } from '../ui'

const field = 'mt-2 min-h-11 w-full min-w-0 rounded-2xl border border-line bg-card px-3 text-ink'
const armName = (arm: Arm) => arm === 'with' ? t('With stations') : t('Without stations')
const phaseName = (phase: Phase) => phase === 'before' ? t('Before') : t('After')
const points = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}`

export function example(pack: Pack): PilotT {
  const id = uid()
  const bin = pack.bins.find((b) => b.kind === 'recycle')!.id
  return { id, name: t('Example pilot'), example: true, runComplete: true, outcome: 'weight', primaryBin: bin, pack: pack.id, created: today(), audits: Array.from({ length: 6 }, (_, station) => {
    const arm: Arm = station < 3 ? 'with' : 'without'
    return (['before', 'after'] as const).flatMap((phase) => Array.from({ length: phase === 'before' ? 2 : 4 }, (_, week): PilotAudit => {
      const before = [30, 34, 28, 31, 29, 33][station]
      const bad = before - (phase === 'after' ? [14, 12, 10, 2, 1, 3][station] : 0) + (week % 2 ? 1 : -1)
      const date = new Date(`${today()}T12:00:00Z`)
      date.setUTCDate(date.getUTCDate() - 35 + (phase === 'before' ? week : week + 2) * 7)
      return { id: uid(), site: t('Example station {number}', { number: station + 1 }), pack: pack.id, bin, date: date.toISOString().slice(0, 10), arm, phase, n: 100, bad, weights: { totalKg: 8, contaminantKg: bad * 0.08 } }
    }))
  }).flat() }
}

export default function Pilot({ pack, packs }: { pack: Pack; packs: Pack[] }) {
  const { audits, setAudits, pilots, setPilots } = usePilotRecords(packs, pack)
  const [selected, setSelected] = useState<string | null>(null), [creating, setCreating] = useState(false), [name, setName] = useState('')
  const [primaryBin, setPrimaryBin] = useState(() => defaultPrimaryBin(pack))
  const [outcome, setOutcome] = useState<Outcome>('weight')
  const [notice, setNotice] = useState(''), [deleting, setDeleting] = useState(false), [removing, setRemoving] = useState<string | null>(null), [weighing, setWeighing] = useState<PilotAudit | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const choices = pilots.filter((p) => p.pack === pack.id)
  const pilot = choices.find((p) => p.id === selected) ?? choices[0]
  const pilotPack = packs.find((p) => p.id === pilot?.pack) ?? pack
  const update = (f: (p: PilotT) => PilotT) => { if (pilot) setPilots((ps) => ps.map((p) => p.id === pilot.id ? f(p) : p)) }
  const start = () => { const p = createPilot({ id: uid(), name: name.trim(), pack: pack.id, created: today(), primaryBin: auditBins(pack).some((b) => b.id === primaryBin) ? primaryBin : defaultPrimaryBin(pack) }, pack, outcome); setPilots((ps) => [p, ...ps]); setSelected(p.id); setCreating(false); setName(''); setOutcome('weight'); setNotice('') }
  const loadExample = () => { const p = example(pack); setPilots((ps) => [p, ...ps]); setSelected(p.id); setNotice('') }
  const auditLink = (arm: Arm, phase: Phase) => `#audit?pilot=${encodeURIComponent(pilot!.id)}&arm=${arm}&phase=${phase}`
  const armReady = (arm: Arm, phase: Phase) => stations(pilot!).some((s) => s.arm === arm && !s.incomplete && s[phase].rate !== null)
  const ready = (phase: Phase) => (['with', 'without'] as const).every((arm) => armReady(arm, phase))
  const importFiles = async (files: File[]) => {
    const target = pilot
    if (!target) return
    const read = await Promise.all(files.map(async (f) => { try { return { name: f.name, text: await f.text() } } catch { return { name: f.name, text: '' } } }))
    // Merge into the latest state, preserving edits made while files were read.
    setPilots((ps) => ps.map((p) => p.id === target.id ? mergePilots(p, read).pilot : p))
    const result = mergePilots(target, read)
    setNotice(result.errors.length ? t('Could not import: {files}. Files must be valid pilots for the same city, primary bin, primary outcome and data type.', { files: result.errors.join(', ') }) : t('Imported {count} new audits. Pictures are never included.', { count: result.added }))
  }
  return <div className="space-y-8">
    <div className="space-y-6 print:hidden">
      <header><h1 className="text-display">{t('Did the stations help?')}</h1><p className="mt-3 max-w-2xl text-lg text-ink-2">{t('Audit the same bins before and after. Compare stations with tablets against stations without them.')}</p><p className="mt-3 text-sm text-ink-2">{t('All data stays on this device. Export a file to keep a backup or combine sites.')}</p></header>
      {!pilot ? <div className="max-w-2xl rounded-3xl bg-well p-6 sm:p-8"><h2 className="text-title">{t('Measure a change you can trust')}</h2><p className="mt-3 text-ink-2">{t('Schedule two baseline weeks, then four weeks with tablets in the tablet group.')}</p><div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => setCreating(true)}><Plus aria-hidden />{t('Start a pilot')}</Button><Button variant="outline" onClick={loadExample}>{t('See an example report')}</Button></div></div> : <>
        <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1">{t('Pilot')}<select className={field} value={pilot.id} onChange={(e) => { setSelected(e.target.value); setNotice('') }}>{choices.map((p) => <option key={p.id} value={p.id}>{p.example ? t('Example data · {name}', { name: p.name }) : p.name}</option>)}</select></label><Button variant="outline" onClick={() => setCreating(true)}><Plus aria-hidden />{t('New pilot')}</Button></div>
        <ol className="divide-y divide-line border-y border-line">{([
          ['before', t('Before'), t('Audit the bins you will equip and the comparison bins you will leave without tablets.')],
          ['run', t('Run'), t('Schedule two baseline weeks, then four weeks with tablets in the tablet group.')],
          ['after', t('After'), t('Audit the same bins again, using the same method.')],
          ['results', t('Results'), t('Read the change and its uncertainty below.')],
        ] as const).map(([step, title, description], k) => { const done = step === 'before' || step === 'after' ? ready(step) : step === 'results' ? !!pilot.runComplete && !!netEffect(pilot) : !!pilot.runComplete; return <li key={step} className="flex gap-4 py-5"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-well" aria-label={done ? t('Done') : t('Pending')}>{done ? <Check className="size-5 text-ok" aria-hidden /> : k + 1}</span><div className="min-w-0 flex-1"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-ink-2">{description}</p>{(step === 'before' || step === 'after') && !pilot.example && <div className="mt-3 flex flex-wrap gap-2">{(['with', 'without'] as const).map((arm) => <Button key={arm} variant="outline" asChild><a href={auditLink(arm, step)}>{armName(arm)}{armReady(arm, step) && <Check aria-hidden />}</a></Button>)}</div>}{step === 'run' && <div className="mt-2 flex flex-wrap items-center gap-4"><Button asChild variant="link" className="px-0"><a href="#station">{t('Set up a station')}</a></Button><label className="flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" className="size-5 accent-ink" checked={!!pilot.runComplete} onChange={(e) => update((p) => ({ ...p, runComplete: e.target.checked }))} />{t('Agreed period complete')}</label></div>}</div></li> })}</ol>
      </>}
    </div>
    {pilot && <>
      <Report pilot={pilot} pack={pilotPack} />
      <div className="space-y-6 print:hidden"><div className="flex flex-wrap gap-2"><Button onClick={() => window.print()}><Printer aria-hidden />{t('Print or save as PDF')}</Button><Button variant="outline" onClick={() => download(`pilot-${pilot.id}.json`, exportPilot(pilot), 'application/json')}><Download aria-hidden />{t('Export JSON')}</Button><Button variant="outline" onClick={() => input.current?.click()}><Upload aria-hidden />{t('Import JSON')}</Button><input ref={input} type="file" accept="application/json,.json" multiple hidden onChange={(e) => { void importFiles([...(e.target.files ?? [])]); e.target.value = '' }} /><Button variant="ghost" onClick={loadExample}>{t('See an example report')}</Button><Button variant="ghost" onClick={() => setDeleting(true)}><Trash2 aria-hidden />{t('Delete pilot')}</Button></div>
        {notice && <p role="status" className="rounded-2xl bg-well p-4 text-ink-2">{notice}</p>}
        <section><h2 className="text-title">{t('Audits in this pilot')}</h2><p className="mt-2 text-sm text-ink-2">{t('Weigh the whole sample and its contaminants separately. Weight totals cover only audits with entered weights.')}</p><ul className="mt-4 divide-y divide-line">{pilot.audits.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-words font-medium">{a.site}</p><p className="text-sm text-ink-2">{a.n === undefined ? t('{arm} · {phase} · {date} · weighed audit', { arm: armName(a.arm), phase: phaseName(a.phase), date: a.date }) : t('{arm} · {phase} · {date} · {count} items', { arm: armName(a.arm), phase: phaseName(a.phase), date: a.date, count: a.n })}</p>{a.pendingRecheck && <p role="status" className="text-sm text-ink-2">{t('Pending recheck — excluded from analysis')}</p>}{a.weights && <p className="text-sm text-ink-2">{t('{bad} / {total} kg contaminants', { bad: a.weights.contaminantKg, total: a.weights.totalKg })}</p>}</div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setWeighing(a)}>{t('Enter weights')}</Button><Button variant="ghost" aria-label={t('Remove audit at {site}', { site: a.site })} onClick={() => setRemoving(a.id)}><Trash2 aria-hidden />{t('Remove')}</Button></div></li>)}</ul>{!pilot.audits.length && <p className="py-4 text-ink-2">{t('Start with a before audit above.')}</p>}</section>
      </div>
    </>}
    <PlanningChecklist />
    <Sheet open={creating} onClose={() => setCreating(false)} title={t('Start a pilot')}><form onSubmit={(e) => { e.preventDefault(); if (name.trim()) start() }}><label>{t('Pilot name')}<input required maxLength={200} className={field} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label><label className="mt-4 block">{t('Primary bin stream')}<select className={field} value={auditBins(pack).some((b) => b.id === primaryBin) ? primaryBin : defaultPrimaryBin(pack)} onChange={(e) => setPrimaryBin(e.target.value)}>{auditBins(pack).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label className="mt-4 block">{t('Primary outcome')}<select className={field} value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}><option value="weight">{t('Contamination by weight')}</option><option value="count">{t('Contamination by item count')}</option></select></label><Button type="submit" className="mt-5" disabled={!name.trim()}>{t('Start a pilot')}</Button></form></Sheet>
    <Sheet open={deleting} onClose={() => setDeleting(false)} title={t('Delete this pilot?')}><p className="mb-5 text-ink-2">{t('The pilot report will be removed from this device. Original bin audits stay in audit history.')}</p><Button onClick={() => { setPilots((ps) => ps.filter((p) => p.id !== pilot?.id)); setDeleting(false); setNotice('') }}>{t('Delete pilot')}</Button></Sheet>
    <Sheet open={!!removing} onClose={() => setRemoving(null)} title={t('Remove this audit from the pilot?')}><p className="mb-5 text-ink-2">{t('The original bin audit stays in audit history.')}</p><Button onClick={() => { update((p) => ({ ...p, audits: p.audits.filter((a) => a.id !== removing) })); setRemoving(null) }}>{t('Remove audit')}</Button></Sheet>
    <Sheet open={!!weighing} onClose={() => setWeighing(null)} title={t('Sample weights')}>{weighing && <WeightForm key={weighing.id} audit={weighing} save={(weights) => { if (audits.some((audit) => audit.id === weighing.id)) setAudits((audits) => audits.map((audit) => audit.id === weighing.id ? { ...audit, weights } : audit)); update((p) => ({ ...p, audits: p.audits.map((a) => a.id === weighing.id ? { ...a, weights } : a) })); setWeighing(null) }} />}</Sheet>
  </div>
}

export function Report({ pilot, pack }: { pilot: PilotT; pack: Pack }) {
  const net = pilot.runComplete ? netEffect(pilot) : null, observed = observedEffect(pilot), rows = stations(pilot)
  const used = (arm: Arm) => rows.filter((r) => r.arm === arm && r.change !== null).length
  return <article className="measure-print pilot-print rounded-3xl border border-line bg-card p-5 sm:p-8">
    {pilot.example && <p className="mb-4 rounded-2xl bg-well p-3 font-semibold">{t('Example data')}</p>}
    <header>{!pilot.runComplete && <p className="mb-2 font-semibold">{t('Interim')}</p>}<h2 className="break-words text-title">{pilot.name}</h2><p className="mt-2 text-sm text-ink-2">{t('{city} · Created {date}', { city: pack.name, date: pilot.created })}</p></header>
    <p className="mt-4 font-semibold">{t('Primary bin stream: {bin}', { bin: pack.bins.find((b) => b.id === pilot.primaryBin)?.name ?? pilot.primaryBin })}</p>
    <StationTable rows={rows} pack={pack} />

    <div className="my-7"><h3 className="text-ink-2">{pilot.outcome === 'weight' ? t('Net effect on contamination by weight') : t('Net effect on contamination by count')}</h3><p className="mt-2 text-sm">{t('Stations used: {with} with tablets; {without} without tablets.', { with: used('with'), without: used('without') })}</p><p className="mt-3 text-display">{observed ? t('{points} percentage points', { points: points(observed.value) }) : t('Not enough to tell yet')}</p>
      {net && <p className="mt-4 text-lg">{t('95% interval: from {low} to {high} percentage points.', { low: points(net.low), high: points(net.high) })}</p>}
      <p className="mt-2 font-semibold">{!pilot.runComplete ? t('Observed difference only; the agreed period is not complete.') : verdict(net) === 'Lower with stations' ? t('Lower with stations') : verdict(net) === 'Higher with stations' ? t('Higher with stations') : t('Not enough to tell yet')}</p>
      <p className="mt-3 text-sm text-ink-2">{t('Mean station change with tablets minus mean station change without tablets. Each station is one physical site. Only the primary bin stream is used. Negative values mean less contamination with tablets.')}</p>
      {pilot.runComplete && <p className="mt-2 text-sm text-ink-2">{t('The 95% Welch t interval uses paired station changes and Welch–Satterthwaite degrees of freedom. An interval and directional verdict require at least three paired stations per arm and nonzero variation in each arm.')}</p>}
      <p className="mt-2 text-sm text-ink-2">{t('The primary outcome is fixed for the whole pilot. Stations missing required measurements are excluded from the net effect.')}</p>
    </div>
    {pilot.outcome === 'weight' && <StationTable rows={stations(pilot, 'count')} pack={pack} caption={t('Secondary: primary bin contamination by count')} />}
    {[...new Set(pilot.audits.map((a) => a.bin))].filter((bin) => bin !== pilot.primaryBin).map((bin) => <StationTable key={bin} rows={stations(pilot, pilot.outcome, bin).filter((s) => s.before.audits + s.after.audits > 0)} pack={pack} caption={t('Secondary bin stream: {bin}', { bin: pack.bins.find((b) => b.id === bin)?.name ?? bin })} />)}
    <div className="overflow-x-auto"><table className="w-full table-fixed text-left text-xs [overflow-wrap:anywhere] sm:text-sm"><caption className="mb-3 text-left font-semibold">{t('Secondary: all items pooled (not independent)')}</caption><thead className="border-b border-line text-ink-2"><tr><th className="py-3 pr-3">{t('Group')}</th><th className="px-2 py-3">{t('Phase')}</th><th className="px-2 py-3">{t('Items (n)')}</th><th className="px-2 py-3">{t('By count')}</th><th className="px-2 py-3">{t('By weight')}</th></tr></thead><tbody>{(['with', 'without'] as const).flatMap((arm) => (['before', 'after'] as const).map((phase) => { const r = rate(pilot, arm, phase); return <tr key={`${arm}-${phase}`} className="border-b border-line"><th className="py-3 pr-3 font-medium">{armName(arm)}</th><td className="p-2">{phaseName(phase)}</td><td className="p-2">{r.n || t('No data')}</td><td className="p-2">{r.rate === null ? t('No data') : pct(r.rate)}{r.rate !== null && <span className="block text-xs text-ink-2">{t('{bad} contaminants', { bad: r.bad })}</span>}</td><td className="p-2">{r.weightRate === null ? t('Not weighed') : <>{pct(r.weightRate)}<span className="block text-xs text-ink-2">{t('{bad} / {total} kg', { bad: r.weights!.contaminantKg.toLocaleString(undefined, { maximumFractionDigits: 2 }), total: r.weights!.totalKg.toLocaleString(undefined, { maximumFractionDigits: 2 }) })}</span><span className="block text-xs text-ink-2">{t('{count} of {total} audits weighed', { count: r.weighedAudits, total: r.audits })}</span></>}</td></tr> }))}</tbody></table></div>
    <p className="mt-5 text-sm text-ink-2">{t('Pooled item counts are descriptive only. Weight totals cover only weighed audits; the primary interval uses stations as the units.')}</p>
  </article>
}

function StationTable({ rows, pack, caption }: { rows: StationResult[]; pack: Pack; caption?: string }) {
  return <div className="mt-7 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-3 text-left font-semibold">{caption ?? t('Contamination by station')}</caption><thead className="border-b border-line"><tr>{[t('Station'), t('Group'), t('Audits before / after'), t('Rate before'), t('Rate after'), t('Change (percentage points)'), t('Status')].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={JSON.stringify([row.site, row.bin])} className="border-b border-line">
    <th className="p-2 font-medium">{row.site}{row.nameVariants && <span className="block font-normal">{t('Site names differ only by spacing or case; grouped together.')}</span>}<span className="block">{pack.bins.find((b) => b.id === row.bin)?.name ?? row.bin}</span></th><td className="p-2">{row.arm ? armName(row.arm) : t('Conflicting arms: excluded')}</td><td className="p-2">{row.before.audits} / {row.after.audits}</td><td className="p-2">{row.before.rate === null ? t('No data') : pct(row.before.rate)}</td><td className="p-2">{row.after.rate === null ? t('No data') : pct(row.after.rate)}</td><td className="p-2">{row.change === null ? t('No data') : points(row.change)}</td><td className="p-2">{row.chronologyInvalid ? t('Invalid chronology: every after audit must follow every before audit. Excluded.') : row.incomplete === 'weight' ? t('Incomplete: missing weights') : row.incomplete === 'count' ? t('Incomplete: missing item counts') : row.before.basis === 'weight' ? t('By weight') : t('By count')}</td>
  </tr>)}</tbody></table></div>
}

function WeightForm({ audit, save }: { audit: PilotAudit; save: (w?: Weights) => void }) {
  const [total, setTotal] = useState(audit.weights?.totalKg.toString() ?? ''), [bad, setBad] = useState(audit.weights?.contaminantKg.toString() ?? '')
  const weights = { totalKg: Number(total), contaminantKg: Number(bad) }, valid = total !== '' && bad !== '' && validWeights(weights)
  return <form onSubmit={(e) => { e.preventDefault(); if (valid) save(weights) }} className="space-y-4"><label className="block">{t('Total sample (kg)')}<input className={field} type="number" inputMode="decimal" min="0" step="any" required value={total} onChange={(e) => setTotal(e.target.value)} /></label><label className="block">{t('Contaminants (kg)')}<input className={field} type="number" inputMode="decimal" min="0" max={total || undefined} step="any" required value={bad} onChange={(e) => setBad(e.target.value)} /></label><p className="text-sm text-ink-2">{t('Total must be above zero. Contaminants cannot exceed the total.')}</p><div className="flex flex-wrap gap-2"><Button type="submit" disabled={!valid}>{t('Save weights')}</Button>{audit.weights && hasCounts(audit) && <Button type="button" variant="ghost" onClick={() => save()}>{t('Remove weights')}</Button>}</div></form>
}

export function PlanningChecklist() {
  return <section className="rounded-3xl bg-well p-5"><h2 className="font-semibold">{t('Pilot planning checklist')}</h2><ul className="mt-4 list-disc space-y-3 pl-5">
    <li>{t('Use independent physical stations in both groups.')}</li>
    <li>{t('Fix one primary bin stream and one primary outcome in advance.')}</li>
    <li>{t('Schedule two baseline weeks, then four weeks with tablets in the tablet group.')}</li>
    <li>{t('Use the same improved signs at every station.')}</li>
    <li>{t('Check recyclables in trash as well as contamination in recycling.')}</li>
  </ul><p className="mt-4 text-sm text-ink-2">{t('The number of stations needed depends on variation in station-level changes, estimated during the baseline weeks.')}</p></section>
}
