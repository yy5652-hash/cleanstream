// Cups come apart, and lids and cups are a top recycling contaminant, so the answer names a bin for each part.
// Lids are looked up by city because the packs treat a loose cup lid differently from a cap left on a bottle:
// LA sends loose, flimsy lids to black; Chicago takes them unless #6 or foam; Seattle wants loose lids 3 inches or bigger.
import { binById, type Bin, type Pack } from './rules'

export type Part = { name: string; bin: Bin; note?: string }

const CUP_LID: Record<string, { bin: string; note?: string }> = {
  nyc: { bin: 'blue' },
  sf: { bin: 'blue' },
  la: { bin: 'black', note: 'Loose, flimsy lids go in the black bin.' },
  chi: { bin: 'blue', note: 'If it is #6 or foam, the black cart.' },
  sea: { bin: 'recycle', note: 'Only if it is 3 inches or bigger.' },
  us: { bin: 'trash', note: 'Rules for loose lids vary. Check your town.' },
}

// `name` and `note` are English strings for t(); the caller translates them.
export function partsOf(pack: Pack, item: string): Part[] {
  const lid = CUP_LID[pack.id]
  if (!lid) return []
  const part = (name: string, id: string) => ({ name, bin: binById(pack, pack.items[id].bin) })
  const cupLid: Part = { name: 'Lid', bin: binById(pack, lid.bin), note: lid.note }
  if (item === 'paper_cup') return [{ name: 'Cup', bin: binById(pack, pack.items.paper_cup.bin) }, cupLid, part('Sleeve', 'cardboard')]
  if (item === 'plastic_cup') return [{ name: 'Cup', bin: binById(pack, pack.items.plastic_cup.bin) }, cupLid, part('Straw', 'plastic_utensil_straw')]
  return []
}
