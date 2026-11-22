import { t } from '../i18n'
import { binById, type Pack } from '../rules'
import { BinChip } from '../ui'

// A conditional destination must remain conditional in reference pages and comparisons.
export function RuleDestination({ pack, item, conditionId }: { pack: Pack; item: string; conditionId?: string }) {
  const rule = pack.items[item]
  const condition = rule.cases?.find((c) => c.id === conditionId)
  if (condition) return <BinChip bin={binById(pack, condition.bin)} />
  if (rule.cases?.length) return <div className="grid gap-2">
    {rule.cases.map((c) => <div key={c.id} className="flex flex-wrap items-center gap-2"><span>{t('If {condition}:', { condition: c.label })}</span><BinChip bin={binById(pack, c.bin)} /></div>)}
  </div>
  return <BinChip bin={binById(pack, rule.bin)} />
}
