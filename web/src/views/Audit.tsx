import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, Download, Trash2 } from 'lucide-react'
import { t } from '../i18n'
import { itemName } from '../items'
import { classify, loadModel, useModel } from '../model/client'
import { binById, ruleBins, type Pack } from '../rules'
import { download, thumbnail, today, uid, useAudits, usePilots, type Audit as AuditT } from '../store'
import { validWeights, type Arm, type Phase } from '../pilot'
import { auditChecked, auditCsv, canAddAudit, conditionOf, contamination, itemBelongs, itemChecked, label, needsCondition, snapshotAudit } from '../audit'
import { ItemPicker } from '../components/Search'
import { Sheet } from '../components/Sheet'
import { Button } from '../components/ui/button'
import { BinChip, pct } from '../ui'

export { auditChecked, contamination } from '../audit'

const field = 'mt-2 min-h-11 w-full min-w-0 rounded-2xl border border-line bg-card px-3 text-ink'

export default function Audit({ pack, packs }: { pack: Pack; packs: Pack[] }) {
  const model = useModel()
  const [audits, setAudits] = useAudits()
  const [pilots, setPilots] = usePilots()
  const [weighed, setWeighed] = useState(false)
  const [measurement, setMeasurement] = useState({ total: '', bad: '', auditor: '', notes: '' })
  const weights = { totalKg: Number(measurement.total), contaminantKg: Number(measurement.bad) }
  const validMeasurement = measurement.total !== '' && measurement.bad !== '' && validWeights(weights) && !!measurement.auditor.trim()
  const [open, setOpen] = useState<string | null>(null)
  const [hash, setHash] = useState(location.hash)
  useEffect(() => { const on = () => setHash(location.hash); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on) }, [])
  const params = new URLSearchParams(hash.split('?')[1])
  const pilotId = params.get('pilot'), arm = params.get('arm'), phase = params.get('phase')
  const pilot = pilots.find((p) => p.id === pilotId)
  const linked = pilot && !pilot.example && (arm === 'with' || arm === 'without') && (phase === 'before' || phase === 'after')
  const activePack = linked ? packs.find((p) => p.id === pilot.pack) ?? pack : pack
  const [form, setForm] = useState({ site: '', bin: '', phase: 'baseline' as AuditT['phase'], date: today() })
  const bins = activePack.bins.filter((b) => b.kind !== 'special')
  const selectedBin = bins.some((b) => b.id === form.bin) ? form.bin : bins.find((b) => b.kind === 'recycle')?.id ?? bins[0].id
  const packOf = (id: string) => packs.find((p) => p.id === id) ?? pack
  const current = audits.find((a) => a.id === open)
  useEffect(() => {
    setPilots((ps) => ps.map((p) => ({ ...p, audits: p.audits.flatMap((snapshot) => {
      const a = audits.find((a) => a.id === snapshot.id)
      const rules = a && packs.find((p) => p.id === a.pack)
      if (!a || !rules) return [snapshot]
      const next = snapshotAudit(a, rules, snapshot.arm, snapshot.phase)
      if (!next) return []
      return [{ ...next, weights: snapshot.weights ?? a.weights }]
    }) })))
  }, [audits, packs, setPilots])
  const start = () => {
    if (weighed && (!validMeasurement || !form.site.trim())) return
    const a: AuditT = { id: uid(), site: form.site.trim() || t('Untitled site'), pack: activePack.id, bin: selectedBin, phase: linked ? phase === 'before' ? 'baseline' : 'after' : form.phase, date: form.date, items: [], ...(weighed ? { kind: 'weighed', weights, auditor: measurement.auditor.trim(), notes: measurement.notes.trim() } : {}) }
    setAudits((xs) => [a, ...xs]); setOpen(a.id)
  }
  const addToPilot = () => {
    if (!current || !linked || current.pack !== pilot.pack || !canAddAudit(current, packOf(current.pack), pilot.outcome)) return
    const snapshot = snapshotAudit(current, packOf(current.pack), arm as Arm, phase as Phase)
    if (!snapshot) return
    setPilots((ps) => ps.map((p) => p.id === pilot.id ? { ...p, audits: [...p.audits.filter((a) => a.id !== current.id), snapshot] } : p))
  }
  const membership = current && pilots.find((p) => p.audits.some((a) => a.id === current.id))
  const association = membership
  return <div className="space-y-8">
    {association && <p className="rounded-2xl bg-well p-4 text-ink-2">{t('Saved in pilot: {name}', { name: association.name })} <a href="#pilot" className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4">{t('Back to pilot')}</a></p>}
    {pilotId && !linked && !current && <p role="alert" className="text-danger">{t('This pilot link is unavailable. Open the pilot and choose an audit step again.')} <a href="#pilot" className="underline">{t('Back to pilot')}</a></p>}
    {current ? <AuditSession key={current.id} addToPilot={linked && current.pack === pilot.pack && !membership ? addToPilot : undefined} pilotOutcome={linked ? pilot.outcome : undefined} audit={current} pack={packOf(current.pack)} ready={model.status === 'ready'} idle={model.status === 'idle' || model.status === 'error'} classes={model.classes} close={() => setOpen(null)}
      update={(f) => setAudits((xs) => xs.map((x) => x.id === current.id ? f(x) : x))}
      remove={() => { setAudits((xs) => xs.filter((x) => x.id !== current.id)); setPilots((ps) => ps.map((p) => ({ ...p, audits: p.audits.filter((a) => a.id !== current.id) }))); setOpen(null) }} /> : <>
      <header><h1 className="text-display">{t('What is in the bin?')}</h1><p className="mt-3 max-w-2xl text-lg text-ink-2">{t('Photograph one item at a time. Check the labels, then see what does not belong.')}</p></header>
      <div className="flex flex-wrap gap-3"><Button variant={!weighed ? 'default' : 'outline'} onClick={() => setWeighed(false)}>{t('Photo audit')}</Button><Button variant={weighed ? 'default' : 'outline'} onClick={() => setWeighed(true)}>{t('Record a weighed audit')}</Button></div>
      <form onSubmit={(e) => { e.preventDefault(); start() }} className="grid gap-5 rounded-3xl bg-well p-5 sm:grid-cols-2 sm:p-8">
        <label>{t('Site or station')}<input required={weighed} className={field} value={form.site} placeholder={t('e.g. Library lobby')} onChange={(e) => setForm({ ...form, site: e.target.value })} /></label>
        <label>{t('Bin audited')}<select className={field} value={selectedBin} onChange={(e) => setForm({ ...form, bin: e.target.value })}>{bins.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>{t('Phase')}<select className={field} disabled={!!linked} value={linked ? phase === 'before' ? 'baseline' : 'after' : form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value as AuditT['phase'] })}><option value="baseline">{t('Before')}</option><option value="after">{t('After')}</option></select></label>
        <label>{t('Date')}<input required className={field} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
        {weighed && <>
          <label>{t('Total sample (kg)')}<input required type="number" min="0" step="any" inputMode="decimal" className={field} value={measurement.total} onChange={(e) => setMeasurement({ ...measurement, total: e.target.value })} /></label>
          <label>{t('Contaminants (kg)')}<input required type="number" min="0" max={measurement.total || undefined} step="any" inputMode="decimal" className={field} value={measurement.bad} onChange={(e) => setMeasurement({ ...measurement, bad: e.target.value })} /></label>
          <label>{t('Auditor name or initials')}<input required maxLength={200} className={field} value={measurement.auditor} onChange={(e) => setMeasurement({ ...measurement, auditor: e.target.value })} /></label>
          <label>{t('Notes')}<textarea maxLength={10000} className={field} value={measurement.notes} onChange={(e) => setMeasurement({ ...measurement, notes: e.target.value })} /></label>
          <p className="text-sm text-ink-2 sm:col-span-2">{t('Total must be above zero. Contaminants cannot exceed the total.')} {t('Weighed audits have no item counts. Photos are optional for diagnosis.')}</p>
        </>}
        <Button type="submit" disabled={(!!pilotId && !linked) || (weighed && (!validMeasurement || !form.site.trim()))}>{weighed ? t('Save weighed audit') : t('Start audit')}</Button>
      </form>
      <Compare audits={audits} packOf={packOf} />
      <section><h2 className="text-title">{t('Audit history')}</h2><div className="mt-4 divide-y divide-line">{!audits.length && <p className="py-6 text-ink-2">{t('No audits yet. Start one above.')}</p>}{audits.map((a) => { const p = packOf(a.pack), c = contamination(a, p); return <button key={a.id} onClick={() => setOpen(a.id)} className="flex min-h-20 w-full flex-wrap items-center justify-between gap-3 py-4 text-left hover:bg-well"><span className="min-w-0 break-words"><strong>{a.site}</strong><span className="block text-sm text-ink-2">{a.kind === 'weighed' ? t('{date} · {phase} · weighed audit', { date: a.date, phase: a.phase === 'baseline' ? t('Before') : t('After') }) : t('{date} · {phase} · {count} items', { date: a.date, phase: a.phase === 'baseline' ? t('Before') : t('After'), count: c.n })}</span></span><span className="flex items-center gap-3"><BinChip bin={binById(p, a.bin)} /><strong>{a.kind === 'weighed' && validWeights(a.weights) ? pct(a.weights.contaminantKg / a.weights.totalKg) : c.n ? pct(c.rate) : t('No items')}{!auditChecked(a, p) && <span className="block text-xs">{t('Provisional')}</span>}</strong></span></button> })}</div></section>
    </>}
  </div>
}

function Compare({ audits, packOf }: { audits: AuditT[]; packOf: (id: string) => Pack }) {
  const pairs = new Map<string, { baseline?: AuditT; after?: AuditT }>()
  for (const a of audits.filter((a) => a.kind !== 'weighed' && auditChecked(a, packOf(a.pack))).sort((a, b) => a.date.localeCompare(b.date))) { const key = JSON.stringify([a.site, a.pack, a.bin]); pairs.set(key, { ...pairs.get(key), [a.phase]: a }) }
  const complete = [...pairs.values()].filter((p) => p.baseline && p.after)
  if (!complete.length) return null
  return <section><h2 className="text-title">{t('Before and after')}</h2>{complete.map(({ baseline: b, after: a }) => { const before = contamination(b!, packOf(b!.pack)), after = contamination(a!, packOf(a!.pack)); return <div key={b!.id} className="mt-4 flex flex-wrap justify-between gap-3 border-b border-line py-4"><span>{b!.site} <BinChip bin={binById(packOf(b!.pack), b!.bin)} /></span><span>{before.n && after.n ? t('{before} → {after}', { before: pct(before.rate), after: pct(after.rate) }) : t('Add items to both audits')}</span></div> })}</section>
}

export function AuditSession({ audit, pack, ready, idle, classes, close, update, remove, addToPilot, pilotOutcome }: { audit: AuditT; pack: Pack; ready: boolean; idle: boolean; classes: string[]; close: () => void; update: (f: (a: AuditT) => AuditT) => void; remove: () => void; addToPilot?: () => void; pilotOutcome?: 'weight' | 'count' }) {
  const [queue, setQueue] = useState(0), [fixing, setFixing] = useState<string | null>(null), [error, setError] = useState(false), [deleting, setDeleting] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const bin = binById(pack, audit.bin), c = contamination(audit, pack)
  const allChecked = auditChecked(audit, pack) && queue === 0
  const check = (id: string) => update((a) => ({ ...a, items: a.items.map((i) => i.id === id && label(i) ? { ...i, checked: true } : i) }))
  const add = async (files: File[]) => {
    if (!ready) return
    const imgs = files.filter((f) => f.type.startsWith('image/')); setQueue((q) => q + imgs.length); setError(false)
    for (const f of imgs) { const id = uid(); try { const thumb = await thumbnail(f); update((a) => ({ ...a, items: [...a.items, { id, thumb, pred: '', p: 0, checked: false }] })); const r = await classify(f); let best = 0; r.probs.forEach((p, k) => { if (p > r.probs[best]) best = k }); update((a) => ({ ...a, items: a.items.map((i) => i.id === id ? { ...i, pred: classes[best], p: r.probs[best] } : i) })) } catch { setError(true) } finally { setQueue((q) => q - 1) } }
  }
  const csv = () => {
    if (!allChecked) return
    const text = auditCsv(audit, pack)
    if (text) download(`audit-${audit.date}.csv`, text)
  }
  return <>
    <Button variant="ghost" onClick={close} disabled={queue > 0}><ArrowLeft aria-hidden />{t('All audits')}</Button>
    <header><h1 className="text-title break-words">{audit.site}</h1><div className="mt-3 flex flex-wrap items-center gap-3"><BinChip bin={bin} /><span className="text-ink-2">{t('{date} · {city}', { date: audit.date, city: pack.name })}</span></div></header>
    <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
      <section className="space-y-6">{audit.kind === 'weighed' && audit.weights ? <div className="rounded-3xl bg-well p-6"><p>{t('Contamination by weight')}</p><p className="mt-4 text-display">{pct(audit.weights.contaminantKg / audit.weights.totalKg)}</p><p className="mt-3">{t('{bad} / {total} kg contaminants', { bad: audit.weights.contaminantKg, total: audit.weights.totalKg })}</p><p className="mt-3">{t('Auditor: {name}', { name: audit.auditor ?? '' })}</p><p className="mt-2 whitespace-pre-wrap">{audit.notes}</p>{!allChecked && <p className="mt-2">{t('Provisional')}</p>}</div> : <div className="rounded-3xl bg-well p-6"><p className="text-ink-2">{allChecked ? t('Contamination by item count') : t('Provisional contamination by item count')}</p><p role="status" className="mt-2">{t('{count} of {total} checked', { count: c.checked, total: audit.items.length })}</p><p className="mt-4 text-display">{c.n ? pct(c.rate) : t('No items')}</p><p className="mt-3 text-ink-2">{t('{bad} of {count} items do not belong', { bad: c.bad, count: c.n })}</p></div>}
        <div><h2 className="font-semibold">{t('Worst offenders')}</h2><ol className="mt-3 divide-y divide-line">{c.top.slice(0, 6).map(([id, n, condition], k) => <li key={JSON.stringify([id, condition])} className="flex flex-wrap items-center gap-2 py-3"><span className="text-ink-3">{k + 1}</span><span className="flex-1">{itemName(id)}{condition && <span className="block text-xs text-ink-2">{t(pack.items[id].cases!.find((c) => c.id === condition)!.label)}</span>}</span>{ruleBins(pack, id, condition).map((bin) => <BinChip key={bin.id} bin={bin} />)}<strong>{n}</strong></li>)}</ol>{!c.top.length && <p className="mt-3 text-ink-2">{t('None yet.')}</p>}</div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={csv} disabled={!allChecked}><Download aria-hidden />{t('Export CSV')}</Button>{addToPilot && <Button disabled={!allChecked || !canAddAudit(audit, pack, pilotOutcome!)} onClick={addToPilot}>{t('Add checked audit to pilot')}</Button>}<Button variant="ghost" disabled={queue > 0} onClick={() => setDeleting(true)}><Trash2 aria-hidden />{t('Delete audit')}</Button></div>
      </section>
      <section>{audit.kind === 'weighed' && <p className="mb-4 text-sm text-ink-2">{t('Weighed audits have no item counts. Photos are optional for diagnosis.')}</p>}{addToPilot && pilotOutcome === 'count' && audit.kind === 'weighed' && <p className="mb-4 text-sm text-ink-2">{t('This pilot uses item counts. Add a photo audit with checked items.')}</p>}<div className="rounded-3xl border border-dashed border-line p-6" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void add([...e.dataTransfer.files]) }}><h2 className="font-semibold">{t('Photograph what you pulled out')}</h2><p className="mt-2 text-ink-2">{t('One item per photo. Choose several photos or drop them here.')}</p><Button className="mt-4" disabled={!ready && !idle} onClick={() => idle ? loadModel() : input.current?.click()}><Camera aria-hidden />{ready ? t('Choose photos') : idle ? t('Download the photo model (95 MB)') : t('Loading model…')}</Button><input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = '' }} /></div>
        {queue > 0 && <p role="status" className="mt-4 animate-breathe">{t('Sorting {count} photos…', { count: queue })}</p>}{error && <p role="alert" className="mt-4 text-danger">{t('Some photos could not be sorted. Tap their tiles to label them, or choose the photos again.')}</p>}
        <p className="my-4 text-sm text-ink-2">{t('Confirm every label and choose a condition where asked before export or adding to a pilot.')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{audit.items.map((i) => { const l = label(i), unresolved = needsCondition(audit, i, pack), condition = conditionOf(i, pack), rule = pack.items[l], bad = l && !unresolved && !itemBelongs(audit, i, pack); return <div key={i.id} className="overflow-hidden rounded-2xl border border-line bg-card">
          <button onClick={() => setFixing(i.id)} aria-label={t('Correct label: {item}', { item: l ? itemName(l) : t('Unlabelled item') })} className="w-full text-left hover:bg-well"><img src={i.thumb} alt={l ? itemName(l) : t('Unlabelled item')} className="aspect-square w-full object-cover" /><span className="block p-3"><strong className="block text-sm">{l ? itemName(l) : t('Tap to label')}</strong><span className={`mt-1 block text-xs ${bad ? 'text-danger' : 'text-ink-2'}`}>{unresolved ? t('Choose the condition') : l ? bad ? t('Belongs in {bin}', { bin: binById(pack, condition?.bin ?? rule.cases?.[0]?.bin ?? rule.bin).name }) : t('Belongs here') : t('Not counted yet')}{i.fixed ? t(' · corrected') : ''}</span></span></button>
          {rule?.cases?.length && (unresolved || condition || new Set(rule.cases.map((c) => itemBelongs(audit, { ...i, condition: c.id }, pack))).size > 1) ? <fieldset className="space-y-2 p-3"><legend className="text-sm">{t(rule.ask ?? 'Which condition applies?')}</legend>{rule.cases.map((choice) => <label key={choice.id} className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 text-xs"><input type="radio" name={`condition-${i.id}`} checked={i.condition === choice.id} onChange={() => update((a) => ({ ...a, items: a.items.map((it) => it.id === i.id ? { ...it, condition: choice.id, checked: true } : it) }))} /><span>{t(choice.label)}</span><BinChip bin={binById(pack, choice.bin)} /></label>)}</fieldset> : null}
          <Button variant="outline" className="m-2" disabled={!l || unresolved || itemChecked(audit, i, pack)} onClick={() => check(i.id)}>{unresolved ? t('Choose the condition') : itemChecked(audit, i, pack) ? t('Checked') : t('Confirm label')}</Button>
        </div> })}</div>
        {audit.items.length > 0 && <div className="mt-4"><Button variant="outline" disabled={allChecked || queue > 0 || audit.items.some((i) => !label(i) || needsCondition(audit, i, pack))} onClick={() => update((a) => ({ ...a, items: a.items.map((i) => ({ ...i, checked: true })) }))}>{t('Mark all as checked')}</Button></div>}

      </section>
    </div>
    <Sheet open={!!fixing} onClose={() => setFixing(null)} title={t('What is it?')}><ItemPicker pack={pack} onPick={(id) => { update((a) => ({ ...a, items: a.items.map((i) => i.id === fixing ? { ...i, fixed: id === i.pred ? undefined : id, condition: id === label(i) ? i.condition : undefined, checked: true } : i) })); setFixing(null) }} /></Sheet>
    <Sheet open={deleting} onClose={() => setDeleting(false)} title={t('Delete this audit?')}><p className="mb-5 text-ink-2">{t('This also removes its results from the pilot.')}</p><Button onClick={remove}>{t('Delete audit')}</Button></Sheet>
  </>
}
