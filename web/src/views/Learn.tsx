// Learn: the city's rules and the quiz, one tap apart.
import { t } from '../i18n'
import type { Pack } from '../rules'
import Quiz from './Quiz'
import Rules from './Rules'

export default function Learn({ sub, pack, packs }: { sub: 'rules' | 'quiz'; pack: Pack; packs: Pack[] }) {
  return (
    <>
      <div role="tablist" aria-label={t('Learn')} className="mb-8 inline-flex rounded-full bg-well p-1">
        {([['rules', t('Rules')], ['quiz', t('Quiz')]] as const).map(([id, name]) => (
          <a key={id} role="tab" aria-selected={sub === id} href={`#${id}`} className={`rounded-full px-4 py-2 text-[15px] font-medium ${sub === id ? 'bg-card text-ink shadow-sm' : 'text-ink-2'}`}>{name}</a>
        ))}
      </div>
      {sub === 'rules' ? <Rules pack={pack} packs={packs} /> : <Quiz pack={pack} packs={packs} />}
    </>
  )
}
