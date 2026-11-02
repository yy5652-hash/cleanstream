import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, Download, Trash2 } from 'lucide-react'
import { t } from '../i18n'
import { itemName } from '../items'
import { classify, loadModel, useModel } from '../model/client'
import { belongs, binById, type Pack } from '../rules'
import { download, thumbnail, today, uid, useAudits, usePilots, type Audit as AuditT, type AuditItem } from '../store'
import type { Arm, Phase, PilotAudit } from '../pilot'
import { ItemPicker } from '../components/Search'
import { Sheet } from '../components/Sheet'
import { Button } from '../components/ui/button'
import { BinChip, pct } from '../ui'

const label = (it: AuditItem) => it.fixed ?? it.pred
const field = 'mt-2 min-h-11 w-full min-w-0 rounded-2xl border border-line bg-card px-3 text-ink'
export function contamination(a: AuditT, pack: Pack) {
  const done = a.items.filter((i) => i.pred || i.fixed)
  const bad = done.filter((i) => !belongs(pack, label(i), a.bin))
  const by = new Map<string, number>()
  bad.forEach((i) => by.set(label(i), (by.get(label(i)) ?? 0) + 1))
  return { n: done.length, bad: bad.length, rate: done.length ? bad.length / done.length : 0, top: [...by].sort((x, y) => y[1] - x[1]) }
}

export default function Audit({ pack, packs }: { pack: Pack; packs: Pack[] }) {
  const model = useModel()
  const [audits, setAudits] = useAudits()
  const [pilots, setPilots] = usePilots()
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
    setPilots((ps) => ps.map((p) => ({ ...p, audits: p.audits.map((snapshot) => {
      const a = audits.find((a) => a.id === snapshot.id)
      const rules = a && packs.find((p) => p.id === a.pack)
      if (!a || !rules) return snapshot
      const c = contamination(a, rules)
      return { ...snapshot, n: c.n, bad: c.bad }
    }) })))
  }, [audits, packs, setPilots])
  const start = () => {
    const a: AuditT = { id: uid(), site: form.site.trim() || t('Untitled site'), pack: activePack.id, bin: selectedBin, phase: linked ? phase === 'before' ? 'baseline' : 'after' : form.phase, date: form.date, items: [] }
    setAudits((xs) => [a, ...xs]); setOpen(a.id)
    if (linked) {
      const snapshot: PilotAudit = { id: a.id, site: a.site, pack: a.pack, bin: a.bin, date: a.date, arm: arm as Arm, phase: phase as Phase, n: 0, bad: 0 }
      setPilots((ps) => ps.map((p) => p.id === pilot.id ? { ...p, audits: [...p.audits, snapshot] } : p))
    }
  }
  const membership = current && pilots.find((p) => p.audits.some((a) => a.id === current.id))
  const association = membership ?? (linked ? pilot : null)
  return <div className="space-y-8">
    {association && <p className="rounded-2xl bg-well p-4 text-ink-2">{t('Saved in pilot: {name}', { name: association.name })} <a href="#pilot" className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4">{t('Back to pilot')}</a></p>}
    {pilotId && !linked && !current && <p role="alert" className="text-danger">{t('This pilot link is unavailable. Open the pilot and choose an audit step again.')} <a href="#pilot" className="underline">{t('Back to pilot')}</a></p>}
    {current ? <AuditSession audit={current} pack={packOf(current.pack)} ready={model.status === 'ready'} idle={model.status === 'idle' || model.status === 'error'} classes={model.classes} close={() => setOpen(null)}
      update={(f) => setAudits((xs) => xs.map((x) => x.id === current.id ? f(x) : x))}
      remove={() => { setAudits((xs) => xs.filter((x) => x.id !== current.id)); setPilots((ps) => ps.map((p) => ({ ...p, audits: p.audits.filter((a) => a.id !== current.id) }))); setOpen(null) }} /> : <>
      <header><h1 className="text-display">{t('What is in the bin?')}</h1><p className="mt-3 max-w-2xl text-lg text-ink-2">{t('Photograph one item at a time. Check the labels, then see what does not belong.')}</p></header>
      <form onSubmit={(e) => { e.preventDefault(); start() }} className="grid gap-5 rounded-3xl bg-well p-5 sm:grid-cols-2 sm:p-8">
        <label>{t('Site or station')}<input className={field} value={form.site} placeholder={t('e.g. Library lobby')} onChange={(e) => setForm({ ...form, site: e.target.value })} /></label>
        <label>{t('Bin audited')}<select className={field} value={selectedBin} onChange={(e) => setForm({ ...form, bin: e.target.value })}>{bins.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>{t('Phase')}<select className={field} disabled={!!linked} value={linked ? phase === 'before' ? 'baseline' : 'after' : form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value as AuditT['phase'] })}><option value="baseline">{t('Before')}</option><option value="after">{t('After')}</option></select></label>
        <label>{t('Date')}<input required className={field} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
        <Button type="submit" disabled={!!pilotId && !linked}>{t('Start audit')}</Button>
      </form>
      <Compare audits={audits} packOf={packOf} />
      <section><h2 className="text-title">{t('Audit history')}</h2><div className="mt-4 divide-y divide-line">{!audits.length && <p className="py-6 text-ink-2">{t('No audits yet. Start one above.')}</p>}{audits.map((a) => { const p = packOf(a.pack), c = contamination(a, p); return <button key={a.id} onClick={() => setOpen(a.id)} className="flex min-h-20 w-full flex-wrap items-center justify-between gap-3 py-4 text-left hover:bg-well"><span className="min-w-0 break-words"><strong>{a.site}</strong><span className="block text-sm text-ink-2">{t('{date} · {phase} · {count} items', { date: a.date, phase: a.phase === 'baseline' ? t('Before') : t('After'), count: c.n })}</span></span><span className="flex items-center gap-3"><BinChip bin={binById(p, a.bin)} /><strong>{c.n ? pct(c.rate) : t('No items')}</strong></span></button> })}</div></section>
    </>}
  </div>
}

function Compare({ audits, packOf }: { audits: AuditT[]; packOf: (id: string) => Pack }) {
  const pairs = new Map<string, { baseline?: AuditT; after?: AuditT }>()
  for (const a of [...audits].sort((a, b) => a.date.localeCompare(b.date))) { const key = JSON.stringify([a.site, a.pack, a.bin]); pairs.set(key, { ...pairs.get(key), [a.phase]: a }) }
  const complete = [...pairs.values()].filter((p) => p.baseline && p.after)
  if (!complete.length) return null
  return <section><h2 className="text-title">{t('Before and after')}</h2>{complete.map(({ baseline: b, after: a }) => { const before = contamination(b!, packOf(b!.pack)), after = contamination(a!, packOf(a!.pack)); return <div key={b!.id} className="mt-4 flex flex-wrap justify-between gap-3 border-b border-line py-4"><span>{b!.site} <BinChip bin={binById(packOf(b!.pack), b!.bin)} /></span><span>{before.n && after.n ? t('{before} → {after}', { before: pct(before.rate), after: pct(after.rate) }) : t('Add items to both audits')}</span></div> })}</section>
}

function AuditSession({ audit, pack, ready, idle, classes, close, update, remove }: { audit: AuditT; pack: Pack; ready: boolean; idle: boolean; classes: string[]; close: () => void; update: (f: (a: AuditT) => AuditT) => void; remove: () => void }) {
  const [queue, setQueue] = useState(0), [fixing, setFixing] = useState<string | null>(null), [error, setError] = useState(false), [deleting, setDeleting] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const bin = binById(pack, audit.bin), c = contamination(audit, pack)
  const add = async (files: File[]) => {
    if (!ready) return
    const imgs = files.filter((f) => f.type.startsWith('image/')); setQueue((q) => q + imgs.length); setError(false)
    for (const f of imgs) { const id = uid(); try { const thumb = await thumbnail(f); update((a) => ({ ...a, items: [...a.items, { id, thumb, pred: '', p: 0 }] })); const r = await classify(f); let best = 0; r.probs.forEach((p, k) => { if (p > r.probs[best]) best = k }); update((a) => ({ ...a, items: a.items.map((i) => i.id === id ? { ...i, pred: classes[best], p: r.probs[best] } : i) })) } catch { setError(true) } finally { setQueue((q) => q - 1) } }
  }
  const csv = () => {
    const rows = [['site', 'city', 'bin_audited', 'phase', 'date', 'item', 'model_item', 'model_confidence', 'corrected', 'belongs_in', 'contaminant']]
    for (const i of audit.items.filter((x) => x.pred || x.fixed)) { const l = label(i); rows.push([audit.site, pack.name, bin.name, audit.phase, audit.date, itemName(l), i.pred ? itemName(i.pred) : '', i.p.toFixed(3), i.fixed ? 'yes' : 'no', binById(pack, pack.items[l].bin).name, belongs(pack, l, audit.bin) ? 'no' : 'yes']) }
    download(`audit-${audit.date}.csv`, rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n'))
  }
  return <>
    <Button variant="ghost" onClick={close} disabled={queue > 0}><ArrowLeft aria-hidden />{t('All audits')}</Button>
    <header><h1 className="text-title break-words">{audit.site}</h1><div className="mt-3 flex flex-wrap items-center gap-3"><BinChip bin={bin} /><span className="text-ink-2">{t('{date} · {city}', { date: audit.date, city: pack.name })}</span></div></header>
    <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
      <section className="space-y-6"><div className="rounded-3xl bg-well p-6"><p className="text-ink-2">{t('Contamination by item count')}</p><p className="mt-4 text-display">{c.n ? pct(c.rate) : t('No items')}</p><p className="mt-3 text-ink-2">{t('{bad} of {count} items do not belong', { bad: c.bad, count: c.n })}</p></div>
        <div><h2 className="font-semibold">{t('Worst offenders')}</h2><ol className="mt-3 divide-y divide-line">{c.top.slice(0, 6).map(([id, n], k) => <li key={id} className="flex flex-wrap items-center gap-2 py-3"><span className="text-ink-3">{k + 1}</span><span className="flex-1">{itemName(id)}</span><BinChip bin={binById(pack, pack.items[id].bin)} /><strong>{n}</strong></li>)}</ol>{!c.top.length && <p className="mt-3 text-ink-2">{t('None yet.')}</p>}</div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={csv} disabled={!c.n}><Download aria-hidden />{t('Export CSV')}</Button><Button variant="ghost" disabled={queue > 0} onClick={() => setDeleting(true)}><Trash2 aria-hidden />{t('Delete audit')}</Button></div>
      </section>
      <section><div className="rounded-3xl border border-dashed border-line p-6" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void add([...e.dataTransfer.files]) }}><h2 className="font-semibold">{t('Photograph what you pulled out')}</h2><p className="mt-2 text-ink-2">{t('One item per photo. Choose several photos or drop them here.')}</p><Button className="mt-4" disabled={!ready && !idle} onClick={() => idle ? loadModel() : input.current?.click()}><Camera aria-hidden />{ready ? t('Choose photos') : idle ? t('Download the photo model (95 MB)') : t('Loading model…')}</Button><input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = '' }} /></div>
        {queue > 0 && <p role="status" className="mt-4 animate-breathe">{t('Sorting {count} photos…', { count: queue })}</p>}{error && <p role="alert" className="mt-4 text-danger">{t('Some photos could not be sorted. Tap their tiles to label them, or choose the photos again.')}</p>}
        <p className="my-4 text-sm text-ink-2">{t('Tap any tile to correct it. Corrections count in the totals and are marked in the export.')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{audit.items.map((i) => { const l = label(i), bad = l && !belongs(pack, l, audit.bin); return <button key={i.id} onClick={() => setFixing(i.id)} className="overflow-hidden rounded-2xl border border-line bg-card text-left hover:bg-well"><img src={i.thumb} alt={l ? itemName(l) : t('Unlabelled item')} className="aspect-square w-full object-cover" /><span className="block p-3"><strong className="block text-sm">{l ? itemName(l) : t('Tap to label')}</strong><span className={`mt-1 block text-xs ${bad ? 'text-danger' : 'text-ink-2'}`}>{l ? bad ? t('Belongs in {bin}', { bin: binById(pack, pack.items[l].bin).name }) : t('Belongs here') : t('Not counted yet')}{i.fixed ? t(' · corrected') : ''}</span></span></button> })}</div>
      </section>
    </div>
    <Sheet open={!!fixing} onClose={() => setFixing(null)} title={t('What is it?')}><ItemPicker pack={pack} onPick={(id) => { update((a) => ({ ...a, items: a.items.map((i) => i.id === fixing ? { ...i, fixed: id === i.pred ? undefined : id } : i) })); setFixing(null) }} /></Sheet>
    <Sheet open={deleting} onClose={() => setDeleting(false)} title={t('Delete this audit?')}><p className="mb-5 text-ink-2">{t('This also removes its results from the pilot.')}</p><Button onClick={remove}>{t('Delete audit')}</Button></Sheet>
  </>
}
