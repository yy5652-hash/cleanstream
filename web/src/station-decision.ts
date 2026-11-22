import { caseRule, shownItem, type Answer, type Pack, type Rule } from './rules'

export type StationDecision =
  | { kind: 'needs-item' }
  | { kind: 'needs-condition'; item: string; rule: Rule }
  | { kind: 'resolved'; item: string; rule: Rule }

// Resolve once so the display, voice, timer and count all describe the same answer.
export function stationDecision(pack: Pack, answer: Answer, chosen?: string, caseId?: string): StationDecision {
  if (!answer.sure && !chosen) return { kind: 'needs-item' }
  const item = chosen ?? shownItem(pack, answer).id
  const base = pack.items[item]
  const condition = base.cases?.find((c) => c.id === caseId)
    ?? (!base.ask ? base.cases?.find((c) => c.bin === base.bin) : undefined)
  if (base.ask && base.cases?.length && !condition) return { kind: 'needs-condition', item, rule: base }
  return { kind: 'resolved', item, rule: condition ? caseRule(base, condition) : base }
}
