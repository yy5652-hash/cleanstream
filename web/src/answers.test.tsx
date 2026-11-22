import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Answer } from './components/Answer'
import { RuleDestination } from './components/RuleDestination'
import { localizePack, setLang, type Dict } from './i18n'
import { ITEMS, searchItems } from './items'
import { answer, belongs, caseRule, matchCase, matchesPhrase, PACK_IDS, ruleBins, shownItem, type Pack } from './rules'

// Only replace the browser subscription; render the real English rules and interface.
vi.mock(import('./i18n'), async (importOriginal) => ({
  ...await importOriginal(),
  useLang: () => ({ lang: 'en' as const, ready: true }),
}))

const packs: Pack[] = PACK_IDS.map((id) => JSON.parse(readFileSync(new URL(`../public/rules/${id}.json`, import.meta.url), 'utf8')))
const nyc = packs.find((p) => p.id === 'nyc')!
const classes = Object.keys(ITEMS)
const prediction = (values: Record<string, number | undefined>) => answer(nyc, classes, new Float32Array(classes.map((id) => values[id] ?? 0)))
const noop = () => {}
const typed = (query: string, pack = nyc) => {
  const item = searchItems(query)[0]
  return renderToStaticMarkup(<Answer ans={null} item={item} query={query} pack={pack} packs={packs} onChoose={noop} />)
}

describe('conditional answers', () => {
  it.each(packs)('$id has valid case destinations and unique condition ids', (pack) => {
    for (const [id, rule] of Object.entries(pack.items)) {
      const cases = rule.cases ?? []
      expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length)
      for (const c of cases) {
        expect(c.label.trim()).not.toBe('')
        expect(pack.bins.some((b) => b.id === c.bin)).toBe(true)
        expect(belongs(pack, id, c.bin)).toBe(true)
      }
    }
  })

  it.each(['vape', 'e-cigarette', 'e-cig', 'lithium battery', 'li-ion battery', 'rechargeable AA battery', 'phone battery', 'laptop battery', 'power bank'])('%s resolves to battery drop-off without offering trash', (query) => {
    expect(searchItems(query)[0]).toBe('battery')
    const condition = matchCase(nyc.items.battery, query)!
    expect(condition.id).toBe('rechargeable')
    expect(condition.bin).toBe('dropoff')
    const html = typed(query)
    expect(html).toContain('<h2 class="text-display">Drop-off</h2>')
    expect(html).not.toContain('Also accepted in')
    expect(html).not.toContain('may go in the trash')
    expect(html).not.toContain('Single-use alkaline')
    expect(html).not.toContain('>Trash<')
    expect(html).not.toContain('Which condition applies?')
    expect(html).toContain(nyc.items.battery.source)
  })

  it('keeps Chicago alkaline disposal separate from vapes', () => {
    const chicago = packs.find((p) => p.id === 'chi')!
    expect(matchCase(chicago.items.battery, 'alkaline AA battery')?.bin).toBe('black')
    expect(matchCase(chicago.items.battery, 'AA battery')).toBeUndefined()
    const html = typed('vape', chicago)
    expect(html).toContain('<h2 class="text-display">Drop-off</h2>')
    expect(html).not.toContain('>Black cart<')
    expect(html).not.toContain('Also accepted in')
  })

  it.each(['greasy pizza box', 'oily pizza box', 'pizza box with food stuck to it'])('%s resolves to NYC brown', (query) => {
    expect(searchItems(query)[0]).toBe('pizza_box')
    expect(matchCase(nyc.items.pizza_box, query)?.bin).toBe('brown')
    const html = typed(query)
    expect(html).toContain('<h2 class="text-display">Brown bin</h2>')
    expect(html).not.toContain('Also accepted in')
    expect(html).not.toContain('Greasy box?')
  })

  it('asks for a condition before giving a plain pizza box a definitive bin', () => {
    expect(matchCase(nyc.items.pizza_box, 'pizza box')).toBeUndefined()
    const html = typed('pizza box')
    expect(html).toContain('Is the box greasy, or is food stuck to it?')
    expect(html).toContain('Clean or lightly soiled')
    expect(html).toContain('Greasy, or food stuck to it')
    expect(html).toContain('>Green bin<')
    expect(html).toContain('>Brown bin<')
    expect(html).not.toContain('text-display')
  })

  it('asks for a condition for a sure photo of a pizza box too', () => {
    const html = renderToStaticMarkup(<Answer ans={prediction({ pizza_box: 1 })} item={null} pack={nyc} packs={packs} onChoose={noop} />)
    expect(html).toContain('Is the box greasy, or is food stuck to it?')
    expect(html).not.toContain('text-display')
  })

  it('shows a battery photo as drop-off, with the alkaline case one tap away and no trash card', () => {
    const html = renderToStaticMarkup(<Answer ans={prediction({ battery: 1 })} item={null} pack={nyc} packs={packs} onChoose={noop} />)
    expect(html).toContain('<h2 class="text-display">Drop-off</h2>')
    expect(html).not.toContain('<h2 class="text-display">Trash</h2>')
    expect(html).not.toContain('Also accepted in')
    expect(html).toContain('Single-use alkaline')
  })

  it('takes the safe default when the words match more than one case', () => {
    expect(matchCase(nyc.items.battery, 'rechargeable AA battery')?.id).toBe('rechargeable')
    // a size is not a chemistry: an AA battery is not assumed to be alkaline
    expect(matchCase(nyc.items.battery, 'AA battery')).toBeUndefined()
    expect(matchCase(nyc.items.battery, '9V battery')).toBeUndefined()
    expect(matchCase(nyc.items.battery, 'alkaline AA battery')?.id).toBe('alkaline')
    expect(matchCase(nyc.items.battery, 'NiMH AA battery')?.id).toBe('rechargeable')
    expect(matchCase(nyc.items.pizza_box, 'greasy pizza box')?.id).toBe('greasy')
  })

  it('resolves case prep independently, retaining the source and safe default', () => {
    const rule = nyc.items.battery
    const resolved = caseRule(rule, matchCase(rule, 'vape')!)
    expect(resolved.bin).toBe('dropoff')
    expect(resolved.prep.join(' ')).not.toContain('may go in the trash')
    expect(resolved.source).toBe(rule.source)
    expect(resolved.also).toBeUndefined()
    expect(rule.bin).toBe('dropoff')
    expect(rule.cases).toHaveLength(2)
  })

  it.each(['bag', 'baggage', 'aardvark', 'c batteries', 'AAAs'])('does not match an alkaline abbreviation inside %s', (query) => {
    expect(matchCase(nyc.items.battery, query)).toBeUndefined()
  })

  it.each(['AlKaLiNe', '(alkaline)', 'alkaline AA'])('matches whole words case-insensitively: %s', (query) => {
    expect(matchCase(nyc.items.battery, query)?.id).toBe('alkaline')
  })

  // single-use or disposable is not a chemistry; button and coin cells are never trash in NYC
  it.each(['single-use button battery', 'a disposable battery', 'single-use AA', 'coin cell CR2032', 'alkaline button battery'])('never sends %s to the trash', (query) => {
    expect(matchCase(nyc.items.battery, query)?.bin ?? nyc.items.battery.bin).toBe('dropoff')
  })

  it.each(['AA battery', '(aaa)', '9V battery', 'C battery', 'd battery'])('does not take a size as a chemistry: %s', (query) => {
    expect(matchCase(nyc.items.battery, query)).toBeUndefined()
  })

  it('matches complete multiword and punctuated phrases', () => {
    expect(matchesPhrase('a PHONE   BATTERY.', 'phone battery')).toBe(true)
    expect(matchesPhrase('a telephone battery', 'phone battery')).toBe(false)
    expect(matchesPhrase('not lithiumish', 'lithium')).toBe(false)
    expect(matchesPhrase('an e-cigarette', 'e-cigarette')).toBe(true)
    expect(matchesPhrase('a #7 PLA cup', '#7 PLA')).toBe(true)
  })

  it('accepts main, alternative and conditional bins in audits', () => {
    expect(belongs(nyc, 'battery', 'dropoff')).toBe(true)
    expect(belongs(nyc, 'battery', 'trash')).toBe(true)
    expect(belongs(nyc, 'pizza_box', 'brown')).toBe(true)
    expect(belongs(nyc, 'textile', 'trash')).toBe(true)
    expect(belongs(nyc, 'pizza_box', 'blue')).toBe(false)
    expect(belongs(nyc, 'missing', 'brown')).toBe(false)
  })

  it('summarizes condition-dependent destinations and compares the same battery condition', () => {
    expect(ruleBins(nyc, 'pizza_box').map((b) => b.id)).toEqual(['green', 'brown'])
    expect(ruleBins(nyc, 'battery', 'rechargeable').map((b) => b.id)).toEqual(['dropoff'])
    const html = renderToStaticMarkup(<RuleDestination pack={nyc} item="pizza_box" />)
    expect(html).toContain('If Clean or lightly soiled:')
    expect(html).toContain('If Greasy, or food stuck to it:')
  })

  it.each(['es', 'zh-Hans', 'zh-Hant'] as const)('localizes case text while preserving %s matching, bins and sources', async (lang) => {
    const dict: Dict = JSON.parse(readFileSync(new URL(`../public/i18n/${lang}.json`, import.meta.url), 'utf8'))
    vi.stubGlobal('document', { documentElement: { lang: 'en' } })
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => dict }))
    try {
      await setLang(lang)
      const pack = localizePack(nyc)
      const condition = matchCase(pack.items.battery, 'vape')!
      expect(condition.id).toBe('rechargeable')
      expect(condition.label).toBe(dict.packs.nyc.items.battery.cases!.rechargeable.label)
      expect(condition.prep).toEqual(dict.packs.nyc.items.battery.cases!.rechargeable.prep)
      expect(condition.bin).toBe('dropoff')
      expect(pack.items.battery.source).toBe(nyc.items.battery.source)
      expect(matchCase(pack.items.battery, 'bag')).toBeUndefined()
      const local = { es: ['pila recargable AA', 'vapeador', 'pizza grasienta', 'pila AA'], 'zh-Hans': ['充电 AA 电池', '电子烟', '油腻的披萨盒', '5号电池'], 'zh-Hant': ['充電 AA 電池', '電子菸', '油膩的披薩盒', '3號電池'] }[lang]
      // a size alone never reaches the trash case
      expect(matchCase(pack.items.battery, local[3])).toBeUndefined()
      // rechargeable wins over the AA/5号/3號 words, and a vape never reaches the trash
      expect(matchCase(pack.items.battery, local[0])?.bin).toBe('dropoff')
      expect(matchCase(pack.items.battery, local[1])?.bin).toBe('dropoff')
      expect(matchCase(pack.items.pizza_box, local[2])?.bin).toBe('brown')
    } finally {
      await setLang('en')
      vi.unstubAllGlobals()
    }
  })
})

describe('one photo decision across surfaces', () => {
  it('shows the most likely item in the top summed bin for the reviewer vector', () => {
    const ans = prediction({ paper: 0.38, plastic_bottle: 0.32, metal_can: 0.30 })
    expect(ans.items[0].id).toBe('paper')
    expect(ans.sure).toBe(true)
    expect(ans.bins[0].bin.id).toBe('blue')
    expect(ans.bins[0].p).toBeCloseTo(0.62)
    expect(shownItem(nyc, ans).id).toBe('plastic_bottle')
    const html = renderToStaticMarkup(<Answer ans={ans} item={null} pack={nyc} packs={packs} onChoose={noop} />)
    expect(html).toContain('<h2 class="text-display">Blue bin</h2>')
    expect(html).not.toContain('<h2 class="text-display">Green bin</h2>')
  })

  it('surfaces a paper-cup look-alike at the top, keeping the correction section', () => {
    const ans = prediction({ plastic_cup: 0.7, paper_cup: 0.3 })
    const html = renderToStaticMarkup(<Answer ans={ans} item={null} pack={nyc} packs={packs} onChoose={noop} />)
    expect(html).toContain('Or is it a Paper cup?')
    expect(html.indexOf('Or is it a Paper cup?')).toBeLessThan(html.indexOf('<h2 class="text-display">Blue bin</h2>'))
  })

  it('puts the alternate above the bin card and keeps Not right for a nonconditional photo', () => {
    const ans = prediction({ plastic_bottle: 0.8, paper_cup: 0.2 })
    const html = renderToStaticMarkup(<Answer ans={ans} item={null} pack={nyc} packs={packs} onChoose={noop} />)
    expect(html.indexOf('Or is it a Paper cup?')).toBeLessThan(html.indexOf('text-display'))
    expect(html).toContain('Not right?')
  })

  it.each([
    { values: { plastic_bottle: 0.81, paper_cup: 0.19 }, chosen: null },
    { values: { plastic_bottle: 0.7, metal_can: 0.3 }, chosen: null },
    { values: { plastic_bottle: 0.7, paper_cup: 0.3 }, chosen: 'plastic_bottle' },
  ])('does not promote a weak, same-bin or manually corrected alternative: $values', ({ values, chosen }) => {
    const html = renderToStaticMarkup(<Answer ans={prediction(values)} item={chosen} pack={nyc} packs={packs} onChoose={noop} />)
    expect(html).not.toContain('Or is it a')
    expect(html).toContain('Not right?')
  })
})
