// City rule packs (public/rules/*.json) and the step from item probabilities to a bin answer.
import { useEffect, useState } from 'react'

export type Bin = { id: string; name: string; accepts: string; color: string; ink: string; kind: 'recycle' | 'compost' | 'landfill' | 'special' }
export type Rule = { bin: string; also?: string[]; prep: string[]; why: string; source: string } // also: other bins the city accepts it in
export type Pack = {
  id: string
  name: string
  authority: string
  checked: string
  sources: { label: string; url: string }[]
  bins: Bin[]
  items: Record<string, Rule>
}

export const PACK_IDS = ['nyc', 'sf', 'la', 'chi', 'sea', 'us'] as const
// Shown in the city picker before the packs arrive, so the header never changes size (the test checks they match)
export const PACK_NAMES: Record<(typeof PACK_IDS)[number], string> = { nyc: 'New York City', sf: 'San Francisco', la: 'Los Angeles', chi: 'Chicago', sea: 'Seattle', us: 'US (general)' }
const cache = new Map<string, Promise<Pack>>()

export function loadPack(id: string): Promise<Pack> {
  if (!cache.has(id)) cache.set(id, fetch(`${import.meta.env.BASE_URL}rules/${id}.json`).then((r) => r.json()))
  return cache.get(id)!
}

export function usePacks(): Pack[] | null {
  const [packs, setPacks] = useState<Pack[] | null>(null)
  useEffect(() => {
    Promise.all(PACK_IDS.map(loadPack)).then(setPacks)
  }, [])
  return packs
}

export const binById = (pack: Pack, id: string) => pack.bins.find((b) => b.id === id)!

// True when the city accepts this item type in this bin (its main bin or an alternative one).
export const belongs = (pack: Pack, item: string, bin: string) => pack.items[item]?.bin === bin || !!pack.items[item]?.also?.includes(bin)

export type Answer = {
  items: { id: string; p: number }[] // item types, most likely first
  bins: { bin: Bin; p: number }[] // bins with summed probability, most likely first
  sure: boolean // the top bin clears the confidence bar
}

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
