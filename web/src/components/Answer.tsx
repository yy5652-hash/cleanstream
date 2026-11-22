// The answer: conclusion first in the bin's own colour, then the parts, how to prep it, the official source and how to correct it.
import { ArrowUpRight, Check, Lock, Share2 } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { t, useLang } from '../i18n'
import { itemName } from '../items'
import { partsOf } from '../parts'
import { binById, caseRule, matchCase, ruleBins, shownItem, type Answer as Ans, type Bin, type Pack } from '../rules'
import { answerLink, BinChip, pct } from '../ui'
import { ItemPicker } from './Search'
import { RuleDestination } from './RuleDestination'

const Sheet = lazy(() => import('./Sheet'))

export function Share({ pack, item, bin, caseId }: { pack: Pack; item: string; bin: Bin; caseId?: string }) {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = answerLink(pack, item, caseId)
    const text = t('{item}: {bin} in {city}.', { item: itemName(item), bin: bin.name, city: pack.name })
    try {
      if (navigator.share) return await navigator.share({ title: t('Which bin? Cleanstream'), text, url })
      await navigator.clipboard.writeText(`${text} ${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* share sheet dismissed */
    }
  }
  return (
    <button onClick={share} className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/15 px-3 py-1.5 text-sm font-medium" style={{ color: bin.ink }}>
      {copied ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}{copied ? t('Link copied') : t('Share')}
    </button>
  )
}

// The most likely item from each of the likely bins, for asking rather than guessing.
export function choices(pack: Pack, ans: Ans, most = 3): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const it of ans.items) {
    const bin = pack.items[it.id]?.bin
    if (!bin || seen.has(bin)) continue
    seen.add(bin)
    out.push(it.id)
    if (out.length === most) break
  }
  return out
}

export function Answer({ ans, ms, pack, packs, item: chosen, preview, query = '', caseId, onChoose }: {
  ans: Ans | null; ms?: number; pack: Pack; packs: Pack[]; item: string | null; preview?: string | null; query?: string; caseId?: string; onChoose: (id: string | null, query?: string) => void
}) {
  const { lang } = useLang()
  const [picking, setPicking] = useState(false)
  const item = chosen ?? shownItem(pack, ans!).id
  const [conditionId, setConditionId] = useState<string | null | undefined>(() => pack.items[item].cases?.find((c) => c.id === caseId)?.id)
  const baseRule = pack.items[item]
  // A condition comes from a tap, else from the typed words; items without a question start on the case for their main bin.
  const matched = conditionId === undefined ? matchCase(baseRule, query) : undefined
  const defaultCase = conditionId === undefined && !matched && !baseRule.ask ? baseRule.cases?.find((c) => c.bin === baseRule.bin) : undefined
  const condition = conditionId ? baseRule.cases?.find((c) => c.id === conditionId) : matched ?? defaultCase
  const otherCases = defaultCase ? baseRule.cases!.filter((c) => c.id !== defaultCase.id) : []
  const lookalike = ans && !chosen ? ans.items.find((it) => it.id !== item && pack.items[it.id]?.bin !== (condition?.bin ?? baseRule.bin) && it.p >= 0.20) : undefined
  const alternate = lookalike && <button onClick={() => onChoose(lookalike.id)} className="mt-3 flex min-h-12 flex-wrap items-center gap-2 rounded-2xl bg-black/10 px-3 py-2 text-left font-medium">
    {t('Or is it a {item}? →', { item: itemName(lookalike.id) })}<BinChip bin={binById(pack, pack.items[lookalike.id].bin)} />
  </button>
  const unsure = !!ans && !chosen && !ans.sure
  const picker = picking && <Suspense fallback={null}><Sheet open onClose={() => setPicking(false)} title={t('What is it?')}><ItemPicker pack={pack} onPick={(id, query) => (onChoose(id, query), setPicking(false))} /></Sheet></Suspense>

  if (unsure) {
    return (
      <section aria-live="polite" className="animate-rise">
        <div className="rounded-3xl bg-well p-6 sm:p-8">
          {preview && <img src={preview} alt={t('Item being checked')} className="mb-5 size-20 rounded-2xl object-cover" />}
          <h2 className="text-title">{t('Hmm, which one is it?')}</h2>
          <p className="mt-1.5 text-ink-2">{t('These go in different bins in {city}, so it asks instead of guessing.', { city: pack.name })}</p>
          <div className="mt-5 grid gap-2">
            {choices(pack, ans!).map((id) => {
              const b = binById(pack, pack.items[id].bin)
              return (
                <button key={id} onClick={() => onChoose(id)} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-left text-lg font-medium hover:ring-2 hover:ring-ink">
                  {itemName(id)}<BinChip bin={b} />
                </button>
              )
            })}
            <button onClick={() => setPicking(true)} className="rounded-2xl px-4 py-3 text-left font-medium text-ink-2 hover:bg-card">{t('Something else…')}</button>
          </div>
        </div>
        {picker}
      </section>
    )
  }

  if (baseRule.cases?.length && !condition) {
    return <section aria-live="polite" className="animate-rise">
      <div className="rounded-3xl bg-well p-6 sm:p-8">
        {preview && <img src={preview} alt={t('Item being checked')} className="mb-5 size-20 rounded-2xl object-cover" />}
        <p className="mb-2 text-lg font-medium">{itemName(item)}</p>
        {alternate}
        <h2 className="text-title">{baseRule.ask ?? t('Which condition applies?')}</h2>
        <div className="mt-5 grid gap-2">
          {baseRule.cases.map((c) => <button key={c.id} onClick={() => setConditionId(c.id)} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-left text-lg font-medium hover:ring-2 hover:ring-ink">
            {c.label}<BinChip bin={binById(pack, c.bin)} />
          </button>)}
          <button onClick={() => setPicking(true)} className="rounded-2xl px-4 py-3 text-left font-medium text-ink-2 hover:bg-card">{t('Something else…')}</button>
        </div>
      </div>
      {picker}
    </section>
  }

  const rule = condition ? caseRule(baseRule, condition) : baseRule
  const bin = binById(pack, rule.bin)
  const also = (rule.also ?? []).map((id) => binById(pack, id))
  const parts = partsOf(pack, item).map((p, i) => i === 0 ? { ...p, bin } : p)
  const others = packs.filter((p) => p.id !== pack.id)
  const differ = others.filter((p) => ruleBins(p, item, condition?.id).some((b) => b.kind !== bin.kind)).length
  const alternatives = ans ? ans.items.filter((it) => it.id !== item).slice(0, 3) : []

  return (
    <section aria-live="polite" key={`${pack.id}-${item}`}>
      <div className="relative overflow-hidden rounded-3xl p-6 animate-flood sm:p-8" style={{ background: bin.color, color: bin.ink }}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-lg font-medium leading-snug">{itemName(item)}</p>
          <Share pack={pack} item={item} bin={bin} caseId={condition?.id} />
        </div>
        {alternate}
        {otherCases.map((c) => <button key={c.id} onClick={() => setConditionId(c.id)} className="mt-3 flex min-h-12 flex-wrap items-center gap-2 rounded-2xl bg-black/10 px-3 py-2 text-left font-medium">
          {t('{condition}? →', { condition: c.label })}<BinChip bin={binById(pack, c.bin)} />
        </button>)}
        {condition && !defaultCase && (matched ? <p className="mt-3 text-sm">{condition.label}</p> : <button onClick={() => setConditionId(null)} className="mt-3 min-h-11 text-left text-sm underline underline-offset-4">{condition.label} · {t('Change condition')}</button>)}
        <div className="mt-10 flex items-end justify-between gap-4 sm:mt-14">
          <div className="min-w-0">
            <h2 className="text-display">{bin.name}</h2>
            {rule.prep[0] && <p className="mt-3 text-lg font-medium">{rule.prep[0]}</p>}
          </div>
          {preview && <img src={preview} alt={t('Item being checked')} className="size-20 shrink-0 rounded-2xl object-cover ring-2 ring-white/40 sm:size-24" />}
        </div>
      </div>

      <div className="divide-y divide-line px-1 animate-rise">
        {also.length > 0 && <p className="py-4 text-ink-2">{t('Also accepted in: {bins}', { bins: also.map((b) => b.name).join(', ') })}</p>}

        {parts.length > 0 && (
          <div className="py-5">
            <h3 className="font-semibold">{t('Take it apart')}</h3>
            <ul className="mt-2 grid gap-2.5">
              {parts.map((p) => (
                <li key={p.name}>
                  <div className="flex items-center justify-between gap-3"><span>{t(p.name)}</span><BinChip bin={p.bin} /></div>
                  {p.note && <p className="mt-0.5 text-sm text-ink-2">{t(p.note)}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {rule.prep.length > 1 && (
          <div className="py-5">
            <h3 className="font-semibold">{t('Before you toss it')}</h3>
            <ul className="mt-2 grid gap-1.5">
              {rule.prep.slice(1).map((s) => <li key={s} className="flex gap-2.5"><Check className="mt-1 size-4 shrink-0 text-ink-3" aria-hidden />{s}</li>)}
            </ul>
          </div>
        )}

        <div className="py-5">
          <p className="text-ink-2">{rule.why}</p>
          <a href={rule.source} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
            {bin.kind === 'special' ? t('Where to drop it off: {authority}', { authority: pack.authority }) : t('Source: {authority}', { authority: pack.authority })}<ArrowUpRight className="size-4" aria-hidden />
          </a>
          {lang !== 'en' && <p className="mt-2 text-sm text-ink-3">{t('Translated by Cleanstream. If in doubt, check the official source, which is in English.')}</p>}
        </div>

        {others.length > 0 && (
          <details className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold marker:hidden">
              {t('Same item in other places')}
              <span className="text-sm font-normal text-ink-2">{differ ? t('{count} of {total} differ', { count: differ, total: others.length }) : t('All the same')}</span>
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5">
              {others.map((p) => {
                return <div key={p.id}><div className="mb-1 text-sm text-ink-2">{p.name}</div><RuleDestination pack={p} item={item} conditionId={condition?.id} /></div>
              })}
            </div>
          </details>
        )}

        <div className="py-5">
          <h3 className="font-semibold">{ans ? t('Not right?') : t('Not the item you meant?')}</h3>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {alternatives.map((it) => (
              <button key={it.id} onClick={() => onChoose(it.id)} className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm hover:bg-well">
                <span className="size-2.5 rounded-full" style={{ background: binById(pack, pack.items[it.id].bin).color }} />{itemName(it.id)}<span className="text-ink-3">{pct(it.p)}</span>
              </button>
            ))}
            {chosen && ans && <button onClick={() => onChoose(null)} className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-well">{t('Use model answer')}</button>}
            <button onClick={() => setPicking(true)} className="rounded-full bg-well px-3 py-1.5 text-sm font-medium hover:bg-line">{ans ? t('Something else…') : t('Browse all items')}</button>
          </div>
        </div>

        {ans && !chosen && (
          <p className="flex items-center gap-2 py-4 text-sm text-ink-2">
            <Lock className="size-4 shrink-0" aria-hidden />{t('Recognised on this device in {ms} ms. Nothing was uploaded.', { ms: Math.round(ms ?? 0) })}
          </p>
        )}
      </div>
      {picker}
    </section>
  )
}
