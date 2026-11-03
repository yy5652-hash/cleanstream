import { Check, Share2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/button'
import { dailyDate, dailyItems, dailyShare, readDaily, saveDaily, type DailyStorage } from '../daily'
import { t } from '../i18n'
import { itemExamples, itemName } from '../items'
import { belongs, binById, type Pack } from '../rules'
import { BinChip, sampleUrl, useSamples, type Sample } from '../ui'

export const ROUNDS = 10

// Items where the bin kind differs between places are the ones people get wrong; at least half the quiz is those.
export function pickQuiz(packs: Pack[], pool: string[], n = ROUNDS, rand = Math.random): string[] {
  const shuffle = (a: string[]) => a.map((x) => [rand(), x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x)
  const tricky = pool.filter((id) => new Set(packs.map((p) => binById(p, p.items[id].bin).kind)).size > 1)
  const first = shuffle(tricky).slice(0, Math.ceil(n / 2))
  const rest = shuffle(pool.filter((id) => !first.includes(id))).slice(0, n - first.length)
  return shuffle([...first, ...rest])
}

function storage(): DailyStorage | null {
  try { return localStorage } catch { return null }
}

export default function Quiz({ pack, packs }: { pack: Pack; packs: Pack[] }) {
  const samples = useSamples()
  const [date, setDate] = useState(dailyDate)
  useEffect(() => {
    const timer = setInterval(() => setDate(dailyDate()), 30000)
    return () => clearInterval(timer)
  }, [])
  const photos = useMemo(() => {
    const map = new Map<string, Sample>()
    for (const sample of samples) if (!map.has(sample.label)) map.set(sample.label, sample)
    return map
  }, [samples])
  return <QuizDay key={`${pack.id}:${date}`} pack={pack} packs={packs} photos={photos} date={date} />
}

function QuizDay({ pack, packs, photos, date }: { pack: Pack; packs: Pack[]; photos: Map<string, Sample>; date: string }) {
  const [mode, setMode] = useState<'daily' | 'full' | null>(null)
  const [game, setGame] = useState(0)
  const saved = readDaily(storage(), pack.id, date)
  const items = dailyItems(packs, pack.id, date)
  return <div className="max-w-3xl animate-rise">
    {mode === null ? <>
      <header><h1 className="text-display">{t('Which bin?')}</h1><p className="mt-5 text-lg text-ink-2">{t('Learn the small differences in {city}. One item at a time.', { city: pack.name })}</p></header>
      <section className="mt-8 rounded-3xl bg-well p-6 sm:p-8">
        <p className="text-sm text-ink-2">{t('{date} · Resets at midnight UTC', { date })}</p><h2 className="mt-4 text-title">{t("Today's three")}</h2>
        {saved?.picks.length === 3 ? <Game key="daily-result" pack={pack} date={date} photos={photos} items={saved.items} daily initialPicks={saved.picks} onExit={() => setMode(null)} /> : <><p className="mt-3 text-ink-2">{t('Three items. The same challenge for everyone in your city today.')}</p><Button size="lg" className="mt-6" onClick={() => setMode('daily')}>{saved?.picks.length ? t('Continue today’s challenge') : t('Start today’s challenge')}</Button></>}
      </section>
      <section className="mt-8 flex flex-col items-start justify-between gap-5 border-t border-line py-8 sm:flex-row sm:items-center"><div><h2 className="text-title">{t('The ten-item quiz')}</h2><p className="mt-2 text-ink-2">{t('More practice, with the items cities disagree on.')}</p></div><Button variant="outline" size="lg" onClick={() => setMode('full')}>{t('Play ten items')}</Button></section>
    </> : <>
      <div className="mb-6 flex items-center justify-between gap-3"><h1 className="text-title">{mode === 'daily' ? t("Today's three") : t('The ten-item quiz')}</h1><Button variant="ghost" onClick={() => setMode(null)}>{t('Back to quizzes')}</Button></div>
      {mode === 'daily' ? <Game key="daily" pack={pack} date={date} photos={photos} items={saved?.items ?? items} daily initialPicks={saved?.picks ?? []} onExit={() => setMode(null)} /> : <FullGame key={game} pack={pack} packs={packs} photos={photos} date={date} onExit={() => setGame((g) => g + 1)} />}
    </>}
  </div>
}

function FullGame({ pack, packs, photos, date, onExit }: { pack: Pack; packs: Pack[]; photos: Map<string, Sample>; date: string; onExit: () => void }) {
  const [items] = useState(() => pickQuiz(packs, Object.keys(pack.items).filter((id) => packs.every((p) => p.items[id]))))
  return <Game pack={pack} photos={photos} date={date} items={items} initialPicks={[]} onExit={onExit} />
}

function Game({ pack, photos, date, items, daily = false, initialPicks, onExit }: { pack: Pack; photos: Map<string, Sample>; date: string; items: string[]; daily?: boolean; initialPicks: string[]; onExit: () => void }) {
  const [picks, setPicks] = useState(initialPicks)
  const [round, setRound] = useState(initialPicks.length)
  const [shared, setShared] = useState(false)
  const [shareError, setShareError] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const right = picks.filter((pick, i) => belongs(pack, items[i], pick)).length
  const done = round >= items.length || (daily && picks.length === items.length)
  const result = daily ? readDaily(storage(), pack.id, date) ?? { items, picks, streak: picks.length === 3 ? 1 : 0 } : null
  const share = async () => {
    const url = `${location.origin}${import.meta.env.BASE_URL}#quiz?city=${encodeURIComponent(pack.id)}`
    const text = daily ? dailyShare(date, pack, { items, picks, streak: result?.streak ?? 0 }, url) : `${t('I sorted {right} of {total} items into the right bin for {city}. Can you beat it?', { right, total: items.length, city: pack.name })}\n${url}`
    try {
      if (navigator.share) await navigator.share({ title: t('Which bin? quiz'), text })
      else { await navigator.clipboard.writeText(text); setShared(true) }
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setShareError(true) }
  }
  // Keep the final daily answer visible until the learner advances to the result.
  const showResult = done && (round >= items.length || initialPicks.length === items.length)
  if (showResult) return <section className="py-6 animate-rise" aria-live="polite">
    <p className="text-display tabular-nums">{t('{right} of {total}', { right, total: items.length })}</p>
    <h2 className="mt-4 text-title">{right === items.length ? t('Perfect sorting. Your bins thank you.') : t('A little clearer for next time.')}</h2>
    {daily && <p className="mt-3 text-ink-2">{t('{count} consecutive days played', { count: result?.streak ?? 1 })}</p>}
    <ul className="mt-6 divide-y divide-line">{items.map((id, i) => <li key={id} className="flex items-start gap-3 py-4">{belongs(pack, id, picks[i]) ? <Check className="mt-1 size-5 shrink-0 text-ok" aria-label={t('Correct')} /> : <X className="mt-1 size-5 shrink-0 text-danger" aria-label={t('Incorrect')} />}<div className="min-w-0 flex-1"><p className="font-semibold">{t('{item}', { item: itemName(id) })}</p><p className="mt-1 text-sm text-ink-2">{t('{reason}', { reason: pack.items[id].why })}</p><div className="mt-2"><BinChip bin={binById(pack, pack.items[id].bin)} /></div></div></li>)}</ul>
    <div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => void share()}><Share2 aria-hidden />{shared ? t('Link copied') : t('Share your score')}</Button>{!daily && <Button variant="outline" onClick={onExit}>{t('Play again')}</Button>}</div>
    {storageError && <p role="status" className="mt-3 text-danger">{t('This result could not be saved on your device.')}</p>}
    {shareError && <p role="status" className="mt-3 text-danger">{t('Could not share. Try again.')}</p>}
  </section>
  const id = items[round]
  const rule = pack.items[id]
  const correct = binById(pack, rule.bin)
  const pick = picks[round]
  const photo = photos.get(id)
  return <section className="animate-rise" key={id}>
    <div className="flex flex-wrap justify-between gap-2 text-sm text-ink-2"><p>{t('Item {number} of {total}', { number: round + 1, total: items.length })}</p><p>{t('{count} right so far', { count: right })}</p></div>
    <div className="mt-4 overflow-hidden rounded-3xl bg-well">{photo ? <img src={sampleUrl(photo)} alt={t('{item}', { item: itemName(id) })} className="aspect-[4/3] max-h-96 w-full object-contain" /> : <div className="flex aspect-[4/3] items-center justify-center p-8 text-title">{t('{item}', { item: itemName(id) })}</div>}</div>
    {photo && <p className="mt-2 text-sm text-ink-3">{t('Example data')}</p>}
    <h2 className="mt-6 text-title">{t('{item}', { item: itemName(id) })}</h2><p className="mt-2 text-ink-2">{t('{examples}', { examples: itemExamples(id) })}</p>
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">{pack.bins.map((bin) => <button key={bin.id} aria-pressed={pick === bin.id} disabled={pick !== undefined} onClick={() => {
      const next = [...picks, bin.id]
      setPicks(next)
      if (daily) { saveDaily(storage(), pack.id, date, items, next); setStorageError(!readDaily(storage(), pack.id, date)) }
    }} className="flex min-h-20 items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left text-lg font-semibold disabled:cursor-default" style={{ background: bin.color, color: bin.ink }}>
      {t('{bin}', { bin: bin.name })}{pick !== undefined && (belongs(pack, id, bin.id) ? <Check className="size-6 shrink-0" aria-label={t('Correct bin')} /> : pick === bin.id ? <X className="size-6 shrink-0" aria-label={t('Your pick')} /> : null)}
    </button>)}</div>
    {pick !== undefined && <div role="status" className="mt-6 rounded-3xl border border-line bg-card p-6 animate-rise"><h3 className={`text-title ${belongs(pack, id, pick) ? 'text-ok' : 'text-ink'}`}>{belongs(pack, id, pick) ? t('Right.') : t('Not quite. In {city}: {bin}.', { city: pack.name, bin: correct.name })}</h3><p className="mt-3 text-ink-2">{t('{reason}', { reason: rule.why })}</p><p className="mt-3 text-ink-2">{t('Before you toss it: {prep}', { prep: rule.prep.join(' · ') })}</p><Button size="lg" className="mt-5" autoFocus onClick={() => setRound((r) => r + 1)}>{round + 1 < items.length ? t('Next item') : t('See your score')}</Button></div>}
    {storageError && <p role="status" className="mt-3 text-danger">{t('Progress cannot be saved on this device. Keep this page open to finish.')}</p>}
  </section>
}
