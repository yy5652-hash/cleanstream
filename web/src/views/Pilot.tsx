import { useRef, useState } from 'react'
import { Check, Download, Plus, Printer, Trash2, Upload } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Sheet } from '../components/Sheet'
import { t } from '../i18n'
import { change, exportPilot, mergePilots, netEffect, rate, sampleSize, validWeights, type Arm, type Phase, type Pilot as PilotT, type PilotAudit, type Weights } from '../pilot'
import type { Pack } from '../rules'
import { download, today, uid, usePilots } from '../store'
import { pct } from '../ui'

const field = 'mt-2 min-h-11 w-full min-w-0 rounded-2xl border border-line bg-card px-3 text-ink'
const armName = (arm: Arm) => arm === 'with' ? t('With stations') : t('Without stations')
const phaseName = (phase: Phase) => phase === 'before' ? t('Before') : t('After')
const points = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}`

function example(pack: Pack): PilotT {
  const id = uid()
  return { id, name: t('Example pilot'), example: true, runComplete: true, pack: pack.id, created: today(), audits: (['with', 'without'] as const).flatMap((arm) => (['before', 'after'] as const).map((phase): PilotAudit => {
    const bad = arm === 'with' ? phase === 'before' ? 90 : 45 : phase === 'before' ? 84 : 78
    return { id: uid(), site: t('Example data'), pack: pack.id, bin: pack.bins.find((b) => b.kind === 'recycle')!.id, date: today(), arm, phase, n: 300, bad, weights: { totalKg: 20, contaminantKg: bad / 15 } }
  })) }
}

export default function Pilot({ pack, packs }: { pack: Pack; packs: Pack[] }) {
  const [pilots, setPilots] = usePilots()
  const [selected, setSelected] = useState<string | null>(null), [creating, setCreating] = useState(false), [name, setName] = useState('')
  const [notice, setNotice] = useState(''), [deleting, setDeleting] = useState(false), [removing, setRemoving] = useState<string | null>(null), [weighing, setWeighing] = useState<PilotAudit | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const choices = pilots.filter((p) => p.pack === pack.id)
  const pilot = choices.find((p) => p.id === selected) ?? choices[0]
  const pilotPack = packs.find((p) => p.id === pilot?.pack) ?? pack
  const update = (f: (p: PilotT) => PilotT) => { if (pilot) setPilots((ps) => ps.map((p) => p.id === pilot.id ? f(p) : p)) }
  const start = () => { const p: PilotT = { id: uid(), name: name.trim(), pack: pack.id, created: today(), audits: [] }; setPilots((ps) => [p, ...ps]); setSelected(p.id); setCreating(false); setName(''); setNotice('') }
  const loadExample = () => { const p = example(pack); setPilots((ps) => [p, ...ps]); setSelected(p.id); setNotice('') }
  const auditLink = (arm: Arm, phase: Phase) => `#audit?pilot=${encodeURIComponent(pilot!.id)}&arm=${arm}&phase=${phase}`
  const ready = (phase: Phase) => (['with', 'without'] as const).every((arm) => rate(pilot!, arm, phase).n > 0)
  const importFiles = async (files: File[]) => {
    const target = pilot
    if (!target) return
    const read = await Promise.all(files.map(async (f) => { try { return { name: f.name, text: await f.text() } } catch { return { name: f.name, text: '' } } }))
    // Merge into the latest state, preserving edits made while files were read.
    setPilots((ps) => ps.map((p) => p.id === target.id ? mergePilots(p, read).pilot : p))
    const result = mergePilots(target, read)
    setNotice(result.errors.length ? t('Could not import: {files}. Files must be valid pilots for the same city and data type.', { files: result.errors.join(', ') }) : t('Imported {count} new audits. Pictures are never included.', { count: result.added }))
  }
  return <div className="space-y-8">
    <div className="space-y-6 print:hidden">
      <header><h1 className="text-display">{t('Did the stations help?')}</h1><p className="mt-3 max-w-2xl text-lg text-ink-2">{t('Audit the same bins before and after. Compare stations with tablets against stations without them.')}</p><p className="mt-3 text-sm text-ink-2">{t('All data stays on this device. Export a file to keep a backup or combine sites.')}</p></header>
      {!pilot ? <div className="max-w-2xl rounded-3xl bg-well p-6 sm:p-8"><h2 className="text-title">{t('Measure a change you can trust')}</h2><p className="mt-3 text-ink-2">{t('Start with six stations: three with tablets and three without, over four weeks. Agree on the period first, keep the bins comparable, and weigh the waste when you can.')}</p><div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => setCreating(true)}><Plus aria-hidden />{t('Start a pilot')}</Button><Button variant="outline" onClick={loadExample}>{t('See an example report')}</Button></div></div> : <>
        <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1">{t('Pilot')}<select className={field} value={pilot.id} onChange={(e) => { setSelected(e.target.value); setNotice('') }}>{choices.map((p) => <option key={p.id} value={p.id}>{p.example ? t('Example data · {name}', { name: p.name }) : p.name}</option>)}</select></label><Button variant="outline" onClick={() => setCreating(true)}><Plus aria-hidden />{t('New pilot')}</Button></div>
        <ol className="divide-y divide-line border-y border-line">{([
          ['before', t('Before'), t('Audit the bins you will equip and the comparison bins you will leave without tablets.')],
          ['run', t('Run'), t('Start with six stations: three with tablets and three without, over four weeks. Agree on the period first, keep the bins comparable, and weigh the waste when you can.')],
          ['after', t('After'), t('Audit the same bins again, using the same method.')],
          ['results', t('Results'), t('Read the change and its uncertainty below.')],
        ] as const).map(([step, title, description], k) => { const done = step === 'before' || step === 'after' ? ready(step) : step === 'results' ? !!change(pilot, 'with') : !!pilot.runComplete; return <li key={step} className="flex gap-4 py-5"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-well" aria-label={done ? t('Done') : t('Pending')}>{done ? <Check className="size-5 text-ok" aria-hidden /> : k + 1}</span><div className="min-w-0 flex-1"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-ink-2">{description}</p>{(step === 'before' || step === 'after') && !pilot.example && <div className="mt-3 flex flex-wrap gap-2">{(['with', 'without'] as const).map((arm) => <Button key={arm} variant="outline" asChild><a href={auditLink(arm, step)}>{armName(arm)}{rate(pilot, arm, step).n > 0 && <Check aria-hidden />}</a></Button>)}</div>}{step === 'run' && <div className="mt-2 flex flex-wrap items-center gap-4"><Button asChild variant="link" className="px-0"><a href="#station">{t('Set up a station')}</a></Button><label className="flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" className="size-5 accent-ink" checked={!!pilot.runComplete} onChange={(e) => update((p) => ({ ...p, runComplete: e.target.checked }))} />{t('Agreed period complete')}</label></div>}</div></li> })}</ol>
      </>}
    </div>
    {pilot && <>
      <Report pilot={pilot} pack={pilotPack} />
      <div className="space-y-6 print:hidden"><div className="flex flex-wrap gap-2"><Button onClick={() => window.print()}><Printer aria-hidden />{t('Print or save as PDF')}</Button><Button variant="outline" onClick={() => download(`pilot-${pilot.id}.json`, exportPilot(pilot), 'application/json')}><Download aria-hidden />{t('Export JSON')}</Button><Button variant="outline" onClick={() => input.current?.click()}><Upload aria-hidden />{t('Import JSON')}</Button><input ref={input} type="file" accept="application/json,.json" multiple hidden onChange={(e) => { void importFiles([...(e.target.files ?? [])]); e.target.value = '' }} /><Button variant="ghost" onClick={loadExample}>{t('See an example report')}</Button><Button variant="ghost" onClick={() => setDeleting(true)}><Trash2 aria-hidden />{t('Delete pilot')}</Button></div>
        {notice && <p role="status" className="rounded-2xl bg-well p-4 text-ink-2">{notice}</p>}
        <section><h2 className="text-title">{t('Audits in this pilot')}</h2><p className="mt-2 text-sm text-ink-2">{t('Weigh the whole sample and its contaminants separately. Weight totals cover only audits with entered weights.')}</p><ul className="mt-4 divide-y divide-line">{pilot.audits.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-words font-medium">{a.site}</p><p className="text-sm text-ink-2">{t('{arm} · {phase} · {date} · {count} items', { arm: armName(a.arm), phase: phaseName(a.phase), date: a.date, count: a.n })}</p>{a.weights && <p className="text-sm text-ink-2">{t('{bad} / {total} kg contaminants', { bad: a.weights.contaminantKg, total: a.weights.totalKg })}</p>}</div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setWeighing(a)}>{t('Enter weights')}</Button><Button variant="ghost" aria-label={t('Remove audit at {site}', { site: a.site })} onClick={() => setRemoving(a.id)}><Trash2 aria-hidden />{t('Remove')}</Button></div></li>)}</ul>{!pilot.audits.length && <p className="py-4 text-ink-2">{t('Start with a before audit above.')}</p>}</section>
        <SampleHint />
      </div>
    </>}
    <Sheet open={creating} onClose={() => setCreating(false)} title={t('Start a pilot')}><form onSubmit={(e) => { e.preventDefault(); if (name.trim()) start() }}><label>{t('Pilot name')}<input required maxLength={200} className={field} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label><Button type="submit" className="mt-5" disabled={!name.trim()}>{t('Start a pilot')}</Button></form></Sheet>
    <Sheet open={deleting} onClose={() => setDeleting(false)} title={t('Delete this pilot?')}><p className="mb-5 text-ink-2">{t('The pilot report will be removed from this device. Original bin audits stay in audit history.')}</p><Button onClick={() => { setPilots((ps) => ps.filter((p) => p.id !== pilot?.id)); setDeleting(false); setNotice('') }}>{t('Delete pilot')}</Button></Sheet>
    <Sheet open={!!removing} onClose={() => setRemoving(null)} title={t('Remove this audit from the pilot?')}><p className="mb-5 text-ink-2">{t('The original bin audit stays in audit history.')}</p><Button onClick={() => { update((p) => ({ ...p, audits: p.audits.filter((a) => a.id !== removing) })); setRemoving(null) }}>{t('Remove audit')}</Button></Sheet>
    <Sheet open={!!weighing} onClose={() => setWeighing(null)} title={t('Sample weights')}>{weighing && <WeightForm key={weighing.id} audit={weighing} save={(weights) => { update((p) => ({ ...p, audits: p.audits.map((a) => a.id === weighing.id ? { ...a, weights } : a) })); setWeighing(null) }} />}</Sheet>
  </div>
}

function Report({ pilot, pack }: { pilot: PilotT; pack: Pack }) {
  const net = netEffect(pilot), estimate = net ?? change(pilot, 'with')
  const hasComparison = pilot.audits.some((a) => a.arm === 'without' && a.n > 0)
  const incompleteComparison = hasComparison && !net
  return <article className="measure-print pilot-print rounded-3xl border border-line bg-card p-5 sm:p-8">
    {pilot.example && <p className="mb-4 rounded-2xl bg-well p-3 font-semibold">{t('Example data')}</p>}
    <header><h2 className="break-words text-title">{pilot.name}</h2><p className="mt-2 text-sm text-ink-2">{t('{city} · Created {date}', { city: pack.name, date: pilot.created })}</p></header>
    <div className="my-7"><h3 className="text-ink-2">{net ? t('Net effect on contamination') : t('Change with stations')}</h3><p className="mt-3 text-display">{estimate ? t('{points} percentage points', { points: points(estimate.value) }) : t('Not enough to tell yet')}</p>
      {estimate && <><p className="mt-4 text-lg">{t('95% interval: from {low} to {high} percentage points.', { low: points(estimate.low), high: points(estimate.high) })}</p><p className="mt-2 font-semibold">{incompleteComparison ? t('Not enough to tell yet') : estimate.high < 0 ? t('Lower with stations') : estimate.low > 0 ? t('Higher with stations') : t('Not enough to tell yet')}</p></>}
      {!net && <p className="mt-3 text-sm text-ink-2">{hasComparison ? t('The comparison arm is incomplete. The number above is the change with stations only.') : t('There is no comparison arm yet. This is the change with stations, and other changes at the site may explain it.')}</p>}
      {net && <p className="mt-3 text-sm text-ink-2">{t('Change with stations minus change without stations. Negative values mean less contamination with stations.')}</p>}
    </div>
    <div className="overflow-x-auto"><table className="w-full table-fixed text-left text-xs [overflow-wrap:anywhere] sm:text-sm"><caption className="mb-3 text-left font-semibold">{t('Contamination by arm and phase')}</caption><thead className="border-b border-line text-ink-2"><tr><th className="py-3 pr-3">{t('Group')}</th><th className="px-2 py-3">{t('Phase')}</th><th className="px-2 py-3">{t('Items (n)')}</th><th className="px-2 py-3">{t('By count')}</th><th className="px-2 py-3">{t('By weight')}</th></tr></thead><tbody>{(['with', 'without'] as const).flatMap((arm) => (['before', 'after'] as const).map((phase) => { const r = rate(pilot, arm, phase); return <tr key={`${arm}-${phase}`} className="border-b border-line"><th className="py-3 pr-3 font-medium">{armName(arm)}</th><td className="p-2">{phaseName(phase)}</td><td className="p-2">{r.n}</td><td className="p-2">{r.rate === null ? t('No data') : pct(r.rate)}<span className="block text-xs text-ink-2">{t('{bad} contaminants', { bad: r.bad })}</span></td><td className="p-2">{r.weightRate === null ? t('Not weighed') : <>{pct(r.weightRate)}<span className="block text-xs text-ink-2">{t('{bad} / {total} kg', { bad: r.weights!.contaminantKg.toLocaleString(undefined, { maximumFractionDigits: 2 }), total: r.weights!.totalKg.toLocaleString(undefined, { maximumFractionDigits: 2 }) })}</span><span className="block text-xs text-ink-2">{t('{count} of {total} audits weighed', { count: r.weighedAudits, total: r.audits })}</span></>}</td></tr> }))}</tbody></table></div>
    <p className="mt-5 text-sm text-ink-2">{t('Items in one bin are not independent, so treat the interval as the smallest honest uncertainty.')}</p><p className="mt-2 text-sm text-ink-2">{t('Intervals use item counts. Weight rates describe only the samples weighed; they do not have an item-based interval.')}</p>
  </article>
}

function WeightForm({ audit, save }: { audit: PilotAudit; save: (w?: Weights) => void }) {
  const [total, setTotal] = useState(audit.weights?.totalKg.toString() ?? ''), [bad, setBad] = useState(audit.weights?.contaminantKg.toString() ?? '')
  const weights = { totalKg: Number(total), contaminantKg: Number(bad) }, valid = total !== '' && bad !== '' && validWeights(weights)
  return <form onSubmit={(e) => { e.preventDefault(); if (valid) save(weights) }} className="space-y-4"><label className="block">{t('Total sample (kg)')}<input className={field} type="number" inputMode="decimal" min="0" step="any" required value={total} onChange={(e) => setTotal(e.target.value)} /></label><label className="block">{t('Contaminants (kg)')}<input className={field} type="number" inputMode="decimal" min="0" max={total || undefined} step="any" required value={bad} onChange={(e) => setBad(e.target.value)} /></label><p className="text-sm text-ink-2">{t('Total must be above zero. Contaminants cannot exceed the total.')}</p><div className="flex flex-wrap gap-2"><Button type="submit" disabled={!valid}>{t('Save weights')}</Button>{audit.weights && <Button type="button" variant="ghost" onClick={() => save()}>{t('Remove weights')}</Button>}</div></form>
}

function SampleHint() {
  const [baseline, setBaseline] = useState(''), [drop, setDrop] = useState('')
  const n = baseline && drop ? sampleSize(Number(baseline) / 100, Number(drop) / 100) : null
  return <details className="rounded-3xl bg-well p-5"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{t('Plan the sample size')}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><label>{t('Expected contamination (%)')}<input type="number" min="0" max="100" step="any" inputMode="decimal" className={field} value={baseline} onChange={(e) => setBaseline(e.target.value)} /></label><label>{t('Drop to detect (percentage points)')}<input type="number" min="0" max="100" step="any" inputMode="decimal" className={field} value={drop} onChange={(e) => setDrop(e.target.value)} /></label></div><p className="mt-4 text-ink-2" aria-live="polite">{n ? t('Plan for at least {count} items per phase in each arm: 80% power, 5% significance.', { count: n }) : t('Enter a starting rate and a smaller positive drop.')}</p><p className="mt-2 text-sm text-ink-2">{t('This assumes independent items and equal samples. Bins cluster items, so plan more bins and treat this as a minimum.')}</p></details>
}
