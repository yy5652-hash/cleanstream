import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Dict } from './i18n'
import { ITEMS } from './items'
import { PACK_IDS, type Pack } from './rules'

const here = new URL('./', import.meta.url)
const i18nDir = new URL('../public/i18n/', import.meta.url)
const packs: Pack[] = PACK_IDS.map((id) => JSON.parse(readFileSync(new URL(`../public/rules/${id}.json`, import.meta.url), 'utf8')))
const langs = readdirSync(i18nDir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''))
const dicts: [string, Dict][] = langs.map((l) => [l, JSON.parse(readFileSync(new URL(`${l}.json`, i18nDir), 'utf8'))])

// Every t('...') in the app's source, except the technical How it works page, which stays in English
function uiStrings(): string[] {
  const files = ['App.tsx', 'ui.tsx', ...readdirSync(new URL('views/', here)).map((f) => `views/${f}`)].filter((f) => !f.endsWith('About.tsx'))
  const out = new Set<string>()
  for (const f of files) {
    const src = readFileSync(new URL(f, here), 'utf8')
    for (const m of src.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) out.add(m[2].replace(/\\(['"\\])/g, '$1'))
  }
  return [...out]
}
const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()

describe('translations', () => {
  it('exist for Spanish and Simplified Chinese', () => {
    expect(langs).toEqual(expect.arrayContaining(['es', 'zh-Hans']))
    expect(uiStrings().length).toBeGreaterThan(50)
  })

  describe.each(dicts)('%s', (lang, d) => {
    const translated = (s: string) => (lang.startsWith('zh') ? /[\u3400-\u9fff]/.test(s) : s.length > 0)

    it('has every interface string, with the same placeholders', () => {
      const missing = uiStrings().filter((s) => !d.ui[s])
      expect(missing).toEqual([])
      for (const s of uiStrings()) expect(holes(d.ui[s]), s).toBe(holes(s))
    })

    it('has every city and item type', () => {
      for (const id of PACK_IDS) expect(translated(d.cities[id]), id).toBe(true)
      for (const id of Object.keys(ITEMS)) {
        const it = d.items[id]
        expect(it && translated(it.name) && translated(it.examples), id).toBe(true)
        expect(it.aka?.length ?? 0, `${id} synonyms`).toBeGreaterThanOrEqual(3)
      }
    })

    it.each(packs.map((p) => [p.id, p] as const))('has every bin and rule of %s, step for step', (id, pack) => {
      const dp = d.packs[id]
      for (const b of pack.bins) expect(translated(dp.bins[b.id]?.name) && translated(dp.bins[b.id]?.accepts), `${id} ${b.id}`).toBe(true)
      for (const [item, r] of Object.entries(pack.items)) {
        const tr = dp.items[item]
        expect(tr?.prep.length, `${id} ${item}`).toBe(r.prep.length)
        expect(tr.prep.every(translated) && translated(tr.why), `${id} ${item}`).toBe(true)
        if (!lang.startsWith('zh')) expect(tr.why, `${id} ${item} left in English`).not.toBe(r.why)
      }
    })
  })
})
