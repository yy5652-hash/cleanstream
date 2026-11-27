// City rule packs (public/rules/*.json) and the step from item probabilities to a bin answer.
import { useEffect, useState } from 'react'

export type Bin = { id: string; name: string; accepts: string; color: string; ink: string; kind: 'recycle' | 'compost' | 'landfill' | 'special' }
export type RuleCase = { id: string; label: string; bin: string; prep?: string[]; match?: string[] }
export type Rule = { bin: string; also?: string[]; ask?: string; cases?: RuleCase[]; prep: string[]; why: string; source: string }
export type Pack = {
  id: string
  name: string
  authority: string
  checked: string
  sources: { label: string; url: string }[]
  bins: Bin[]
  items: Record<string, Rule>
}

export const PACK_IDS = ['nyc', 'sf', 'la', 'chi', 'sea', 'us', 'eu', 'wales'] as const
// Shown in the city picker before the packs arrive, so the header never changes size (the test checks they match)
export const PACK_NAMES: Record<(typeof PACK_IDS)[number], string> = { nyc: 'New York City', sf: 'San Francisco', la: 'Los Angeles', chi: 'Chicago', sea: 'Seattle', us: 'US (general)', eu: 'European Union', wales: 'Wales (workplaces)' }
const cache = new Map<string, Promise<Pack>>()

export function loadPack(id: string): Promise<Pack> {
  if (!cache.has(id)) {
    const pack = fetch(`${import.meta.env.BASE_URL}rules/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`rules/${id}.json: ${r.status}`)
      return r.json() as Promise<Pack>
    })
    // A failed fetch must not stay cached, so Retry fetches again.
    pack.catch(() => cache.delete(id))
    cache.set(id, pack)
  }
  return cache.get(id)!
}

// The current city first, so the first screen need not wait for the others; the rest follow straight after.
export function usePacks(first: string): { packs: Pack[] | null; failed: boolean; retry: () => void } {
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setFailed(false)
    const add = (p: Pack) => {
      if (live) setPacks((cur) => (cur?.some((x) => x.id === p.id) ? cur : [...(cur ?? []), p].sort((a, b) => PACK_IDS.indexOf(a.id as never) - PACK_IDS.indexOf(b.id as never))))
    }
    const fail = () => { if (live) setFailed(true) }
    loadPack(first).then(add).then(() => PACK_IDS.forEach((id) => loadPack(id).then(add, fail)), fail)
    return () => {
      live = false
    }
  }, [first, attempt])
  return { packs, failed, retry: () => setAttempt((n) => n + 1) }
}

export const binById = (pack: Pack, id: string) => pack.bins.find((b) => b.id === id)!

// Non-audit callers may still ask whether any condition accepts this bin.
export function belongs(pack: Pack, item: string, bin: string, caseId?: string): boolean {
  const rule = pack.items[item]
  if (!rule) return false
  if (rule.also?.includes(bin)) return true
  if (caseId !== undefined) return rule.cases?.find((c) => c.id === caseId)?.bin === bin
  return rule.bin === bin || !!rule.cases?.some((c) => c.bin === bin)
}

// Match complete words/phrases, including punctuation such as "li-ion" and "#7 PLA".
export function matchesPhrase(query: string, term: string): boolean {
  // Chinese has no spaces between words, so a Han term matches anywhere in the query.
  if (/\p{Script=Han}/u.test(term)) return query.toLowerCase().includes(term.trim().toLowerCase())
  const phrase = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return !!phrase && new RegExp(`(^|[^\\p{L}\\p{N}_])${phrase}($|[^\\p{L}\\p{N}_])`, 'iu').test(query)
}

// When the words point at more than one case ("pila recargable AA"), only the safe default (the rule's main bin) is taken;
// otherwise nothing is resolved and the app shows its default or asks.
export function matchCase(rule: Rule, query: string): RuleCase | undefined {
  const hits = rule.cases?.filter((c) => c.match?.some((term) => matchesPhrase(query, term))) ?? []
  return hits.length === 1 ? hits[0] : hits.find((c) => c.bin === rule.bin)
}

export const caseRule = (rule: Rule, condition: RuleCase): Rule => ({ ...rule, bin: condition.bin, prep: condition.prep ?? rule.prep, also: undefined })

// Compare the same condition where available, otherwise show all condition-dependent bins.
export function ruleBins(pack: Pack, item: string, caseId?: string): Bin[] {
  const rule = pack.items[item]
  const condition = rule.cases?.find((c) => c.id === caseId)
  const ids = condition ? [condition.bin] : rule.cases?.map((c) => c.bin) ?? [rule.bin]
  return [...new Set(ids)].map((id) => binById(pack, id))
}

export type Answer = {
  items: { id: string; p: number }[] // item types, most likely first
  bins: { bin: Bin; p: number }[] // bins with summed probability, most likely first
  sure: boolean // the top bin clears the confidence bar
}

// Phone, station and evaluation must agree on the bin whose probability was summed.
export const shownItem = (pack: Pack, ans: Answer) => ans.items.find((it) => pack.items[it.id]?.bin === ans.bins[0].bin.id)!

// Below this summed probability for the top bin the app says "not sure" instead of guessing.
export const SURE = 0.6

export function answer(pack: Pack, classes: string[], probs: Float32Array): Answer {
  const items = classes.map((id, k) => ({ id, p: probs[k] })).sort((a, b) => b.p - a.p)
  const mass = new Map<string, number>()
  for (const it of items) {
    const bin = pack.items[it.id]?.bin
    if (bin) mass.set(bin, (mass.get(bin) ?? 0) + it.p)
  }
  const bins = [...mass].map(([id, p]) => ({ bin: binById(pack, id), p })).sort((a, b) => b.p - a.p)
  return { items, bins, sure: bins[0].p >= SURE }
}
