// "Which bin?" quiz: ten items under the chosen city's rules, weighted toward the ones places disagree on.
import { useMemo, useState } from 'react'
import { t } from '../i18n'
import { itemExamples, itemName } from '../items'
import { belongs, binById, type Pack } from '../rules'
import { Can, sampleUrl, useSamples, type Sample } from '../ui'

export const ROUNDS = 10

// Items where the bin kind differs between places are the ones people get wrong; at least half the quiz is those.
export function pickQuiz(packs: Pack[], pool: string[], n = ROUNDS, rand = Math.random): string[] {
  const shuffle = (a: string[]) => a.map((x) => [rand(), x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x)
  const tricky = pool.filter((id) => new Set(packs.map((p) => binById(p, p.items[id].bin).kind)).size > 1)
  const first = shuffle(tricky).slice(0, Math.ceil(n / 2))
  const rest = shuffle(pool.filter((id) => !first.includes(id))).slice(0, n - first.length)
  return shuffle([...first, ...rest])
}

export default function Quiz({ pack, packs }: { pack: Pack; packs: Pack[] }) {
  const samples = useSamples()
  const photo = useMemo(() => {
    const m = new Map<string, Sample>()
    for (const s of samples) if (!m.has(s.label)) m.set(s.label, s)
    return m
  }, [samples])
  const [game, setGame] = useState(0)
  const items = useMemo(() => (photo.size ? pickQuiz(packs, [...photo.keys()].filter((id) => pack.items[id])) : []), [photo, packs, pack, game])
  const [round, setRound] = useState(0)
  const [picks, setPicks] = useState<string[]>([])
  const [shared, setShared] = useState(false)

  const restart = () => (setGame((g) => g + 1), setRound(0), setPicks([]), setShared(false))
  if (!items.length) return <p className="muted">{t('Loading…')}</p>

  const right = picks.filter((b, k) => belongs(pack, items[k], b)).length
  const done = picks.length === ROUNDS && round === ROUNDS

  const share = async () => {
    const url = `${location.origin}${import.meta.env.BASE_URL}#quiz?city=${pack.id}`
    const text = t('I sorted {right} of {total} items into the right bin for {city}. Can you beat it?', { right, total: ROUNDS, city: pack.name })
    try {
      if (navigator.share) return await navigator.share({ title: t('Which bin? quiz'), text, url })
      await navigator.clipboard.writeText(`${text} ${url}`)
      setShared(true)
    } catch {
      /* share sheet dismissed */
    }
  }

  const lede = (
    <div className="lede">
      <div>
        <h1>{t('Which bin? Quiz')}</h1>
        <p>{t('Ten everyday items. Pick the bin each one goes in under {city} rules. Half of them are items that places disagree on.', { city: pack.name })}</p>
      </div>
    </div>
  )

  if (done) {
    const missed = items.filter((id, k) => !belongs(pack, id, picks[k]))
    return (
      <>
        {lede}
        <div className="card pad quiz">
          <div className="quiz-score">
            <b>{right}<small>/{ROUNDS}</small></b>
            <p>{right === ROUNDS ? t('Perfect sorting. Your bins thank you.') : right >= 7 ? t('Good sorting. A few tricky ones left.') : t('The rules are tricky. Here is what to remember.')}</p>
          </div>
          {missed.length > 0 && (
            <div className="section">
              <div className="label">{t('Worth remembering')}</div>
              {missed.map((id) => {
                const b = binById(pack, pack.items[id].bin)
                return (
                  <div key={id} className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                    <div><strong className="small">{itemName(id)}</strong><div className="small muted">{pack.items[id].why}</div></div>
                    <span className="chip" style={{ background: b.color, color: b.ink }}>{b.name}</span>
                  </div>
                )
              })}
            </div>
          )}
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn primary" onClick={restart}>{t('Play again')}</button>
            <button className="btn" onClick={share}>{shared ? t('Link copied') : t('Share your score')}</button>
          </div>
        </div>
      </>
    )
  }

  const id = items[round]
  const pick = picks[round]
  const rule = pack.items[id]
  const correct = binById(pack, rule.bin)
  const ok = pick !== undefined && belongs(pack, id, pick)
  const s = photo.get(id)!

  return (
    <>
      {lede}
      <div className="card pad quiz">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="label">{t('Item {number} of {total}', { number: round + 1, total: ROUNDS })}</span>
          <span className="small muted">{t('{count} right so far', { count: right })}</span>
        </div>
        <div className="meter" style={{ marginTop: 8 }}><i style={{ width: `${((round + (pick ? 1 : 0)) / ROUNDS) * 100}%` }} /></div>

        <div className="quiz-item">
          <img src={sampleUrl(s)} alt={itemName(id)} />
          <div>
            <h2>{itemName(id)}</h2>
            <p className="muted">{itemExamples(id)}</p>
          </div>
        </div>

        <div className="quiz-bins">
          {pack.bins.map((b) => {
            const state = pick === undefined ? '' : belongs(pack, id, b.id) ? ' right' : pick === b.id ? ' wrong' : ' dim'
            return (
              <button key={b.id} className={`quiz-bin${state}`} style={{ background: b.color, color: b.ink }} disabled={pick !== undefined}
                onClick={() => setPicks((p) => [...p.slice(0, round), b.id])}>
                <Can bin={b} size={34} />
                <strong>{b.name}</strong>
                {state === ' right' && <span className="mark" aria-label={t('right bin')}>✓</span>}
                {state === ' wrong' && <span className="mark" aria-label={t('your pick')}>✗</span>}
              </button>
            )
          })}
        </div>

        {pick !== undefined && (
          <div className={`notice quiz-feedback${ok ? ' ok' : ''}`}>
            <strong>{ok ? t('Right.') : t('Not quite. In {city}: {bin}.', { city: pack.name, bin: correct.name })}</strong> {rule.why}
            {rule.prep.length > 0 && <div className="small" style={{ marginTop: 6 }}>{t('Before you toss it: {prep}', { prep: rule.prep.join(' · ') })}</div>}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary" autoFocus onClick={() => setRound((r) => r + 1)}>{round + 1 < ROUNDS ? t('Next item') : t('See your score')}</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
