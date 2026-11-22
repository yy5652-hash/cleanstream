import { belongs, binById, type Pack } from './rules'
import { itemName } from './items'
import { validWeights, type Arm, type Outcome, type Phase, type Pilot, type PilotAudit } from './pilot'
import type { Audit, AuditItem } from './store'

export const label = (it: AuditItem) => it.fixed ?? it.pred
export const conditionOf = (it: AuditItem, pack: Pack) => pack.items[label(it)]?.cases?.find((c) => c.id === it.condition)
export function needsCondition(a: Audit, it: AuditItem, pack: Pack): boolean {
  const cases = pack.items[label(it)]?.cases ?? []
  return !conditionOf(it, pack) && new Set(cases.map((c) => belongs(pack, label(it), a.bin, c.id))).size > 1
}
export const itemChecked = (a: Audit, it: AuditItem, pack: Pack) => !!it.checked && !!pack.items[label(it)] && !needsCondition(a, it, pack)
// If all cases agree, use their shared acceptance rather than the rule's default bin.
export const itemBelongs = (a: Audit, it: AuditItem, pack: Pack) => belongs(pack, label(it), a.bin, conditionOf(it, pack)?.id ?? pack.items[label(it)]?.cases?.[0]?.id)
export const auditChecked = (a: Audit, pack: Pack) =>
  (a.kind === 'weighed' ? validWeights(a.weights) : a.items.length > 0) && a.items.every((it) => itemChecked(a, it, pack))
export const canAddAudit = (a: Audit, pack: Pack, outcome: Outcome) => auditChecked(a, pack) && (outcome === 'weight' || a.kind !== 'weighed')

export function contamination(a: Audit, pack: Pack) {
  // Unresolved conditions stay out of the provisional denominator, like unlabelled photos.
  const done = a.items.filter((it) => pack.items[label(it)] && !needsCondition(a, it, pack))
  const bad = done.filter((it) => !itemBelongs(a, it, pack))
  const by = new Map<string, [string, number, string | undefined]>()
  for (const it of bad) {
    const condition = conditionOf(it, pack)?.id, key = JSON.stringify([label(it), condition])
    by.set(key, [label(it), (by.get(key)?.[1] ?? 0) + 1, condition])
  }
  return { n: done.length, bad: bad.length, rate: done.length ? bad.length / done.length : 0,
    top: [...by.values()].sort((x, y) => y[1] - x[1]), checked: a.items.filter((it) => itemChecked(a, it, pack)).length }
}

export function snapshotAudit(a: Audit, pack: Pack, arm: Arm, phase: Phase): PilotAudit | null {
  if (!auditChecked(a, pack)) return null
  const c = contamination(a, pack)
  const by = new Map<string, NonNullable<PilotAudit['conditions']>[number]>()
  for (const it of a.items) {
    const condition = conditionOf(it, pack)?.id
    if (!condition) continue
    const item = label(it), key = JSON.stringify([item, condition]), previous = by.get(key)
    by.set(key, { item, condition, n: (previous?.n ?? 0) + 1, bad: (previous?.bad ?? 0) + (itemBelongs(a, it, pack) ? 0 : 1) })
  }
  return { id: a.id, site: a.site, pack: a.pack, bin: a.bin, date: a.date, arm, phase,
    ...(a.kind === 'weighed' ? {} : { n: c.n, bad: c.bad }), ...(a.weights ? { weights: a.weights } : {}),
    ...(a.auditor ? { auditor: a.auditor } : {}), ...(a.notes ? { notes: a.notes } : {}),
    ...(by.size ? { conditions: [...by.values()] } : {}) }
}

export function auditCsv(a: Audit, pack: Pack): string | null {
  if (!auditChecked(a, pack)) return null
  const rows: (string | number)[][] = [['site', 'city', 'bin_audited', 'phase', 'date', 'item', 'condition', 'model_item', 'model_confidence', 'corrected', 'belongs_in', 'contaminant', 'total_kg', 'contaminant_kg', 'auditor', 'notes']]
  const common = [a.site, pack.name, binById(pack, a.bin).name, a.phase, a.date]
  const weights = [a.weights?.totalKg ?? '', a.weights?.contaminantKg ?? '', a.auditor ?? '', a.notes ?? '']
  if (a.kind === 'weighed') rows.push([...common, '', '', '', '', '', '', '', ...weights])
  for (const it of a.items) {
    const rule = pack.items[label(it)]
    rows.push([...common, itemName(label(it)), conditionOf(it, pack)?.id ?? '', it.pred ? itemName(it.pred) : '', it.p.toFixed(3), it.fixed ? 'yes' : 'no',
      [...new Set(conditionOf(it, pack) ? [conditionOf(it, pack)!.bin] : rule.cases?.map((c) => c.bin) ?? [rule.bin])].map((id) => binById(pack, id).name).join(' / '), itemBelongs(a, it, pack) ? 'no' : 'yes', ...weights])
  }
  return rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
}

// An unchecked correction suspends a snapshot without losing its identity or measurements.
export function syncPilotAudits(pilots: Pilot[], audits: Audit[], packs: Pack[]): Pilot[] {
  return pilots.map((pilot) => ({ ...pilot, audits: pilot.audits.map((snapshot) => {
    const audit = audits.find((audit) => audit.id === snapshot.id)
    const pack = audit && packs.find((pack) => pack.id === audit.pack)
    if (!audit || !pack) return snapshot // Imported summaries need no local photo audit.
    return snapshotAudit(audit, pack, snapshot.arm, snapshot.phase)
      ?? { ...snapshot, weights: audit.weights, pendingRecheck: true }
  }) }))
}
