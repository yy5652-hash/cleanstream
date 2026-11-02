// Type-ahead search over item names and everyday synonyms ("tin foil", "amazon box"); needs no model.
import { Command } from 'cmdk'
import { Search as SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { t } from '../i18n'
import { itemExamples, itemName, itemShort, searchable, searchItems } from '../items'
import { binById, type Pack } from '../rules'
import { BinChip } from '../ui'

export function ItemSearch({ pack, onPick, popular = [] }: { pack: Pack; onPick: (id: string) => void; popular?: string[] }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const hits = searchItems(q)
  const pick = (id: string) => {
    onPick(id)
    setQ('')
    setOpen(false)
  }
  const showList = open && searchable(q)

  return (
    <div>
      <Command shouldFilter={false} loop label={t('Search an item')} className="relative">
        <label className="flex h-14 items-center gap-3 rounded-2xl border border-line bg-card px-4 transition-colors focus-within:border-ink">
          <SearchIcon className="size-5 shrink-0 text-ink-3" aria-hidden />
          <Command.Input
            value={q} onValueChange={(v) => (setQ(v), setOpen(true))} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder={t('Or type it: pizza box, tin foil, vape')} aria-label={t('Search an item')}
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-3"
          />
        </label>
        {showList && (
          <Command.List className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-line bg-card p-1.5 shadow-xl animate-rise">
            {hits.length === 0 ? (
              <div className="px-3 py-3 text-sm text-ink-2">{t('Nothing matches “{query}”. Try a simpler word, or show it with a photo. When in doubt, keep it out of recycling.', { query: q.trim() })}</div>
            ) : hits.map((id) => (
              <Command.Item key={id} value={id} onSelect={() => pick(id)} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 data-[selected=true]:bg-well">
                <span className="min-w-0"><span className="block font-medium">{itemName(id)}</span><span className="block truncate text-sm text-ink-2">{itemExamples(id)}</span></span>
                <BinChip bin={binById(pack, pack.items[id].bin)} />
              </Command.Item>
            ))}
          </Command.List>
        )}
      </Command>
      {popular.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {popular.map((id) => <button key={id} onClick={() => pick(id)} className="rounded-full border border-line px-3 py-1.5 text-sm text-ink hover:bg-well">{itemShort(id)}</button>)}
        </div>
      )}
    </div>
  )
}

// Every item type at once, for correcting a wrong answer.
export function ItemPicker({ pack, onPick }: { pack: Pack; onPick: (id: string) => void }) {
  const [q, setQ] = useState('')
  const ids = searchable(q) ? searchItems(q, 32) : Object.keys(pack.items)
  return (
    <>
      <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Filter: foil, mug, vape…')} aria-label={t('Filter item types')}
        className="mb-3 h-12 w-full rounded-xl border border-line bg-transparent px-4 text-base outline-none focus:border-ink placeholder:text-ink-3" />
      <div className="grid gap-0.5">
        {ids.map((id) => {
          const bin = binById(pack, pack.items[id].bin)
          return (
            <button key={id} onClick={() => onPick(id)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-well">
              <span className="size-3 shrink-0 rounded-full" style={{ background: bin.color }} />
              <span className="min-w-0 flex-1 font-medium">{itemName(id)}</span>
              <span className="text-sm text-ink-2">{bin.name}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
