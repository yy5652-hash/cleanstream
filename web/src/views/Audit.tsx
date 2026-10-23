import { useMemo, useRef, useState } from 'react'
import { itemName } from '../items'
import { classify, useModel } from '../model/client'
import { belongs, binById, type Pack } from '../rules'
import { download, thumbnail, today, uid, useAudits, type Audit as AuditT, type AuditItem } from '../store'
import { BinChip, ItemPicker, pct } from '../ui'

const label = (it: AuditItem) => it.fixed ?? it.pred

export function contamination(a: AuditT, pack: Pack) {
  const done = a.items.filter((i) => i.pred)
  const bad = done.filter((i) => !belongs(pack, label(i), a.bin))
  const by = new Map<string, number>()
  bad.forEach((i) => by.set(label(i), (by.get(label(i)) ?? 0) + 1))
  return { n: done.length, bad: bad.length, rate: done.length ? bad.length / done.length : 0, top: [...by].sort((x, y) => y[1] - x[1]) }
}

export default function Audit({ pack, packs }: { pack: Pack; packs: Pack[] }) {
  const model = useModel()
  const [audits, setAudits] = useAudits()
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState({ site: '', bin: pack.bins.find((b) => b.kind === 'recycle')?.id ?? pack.bins[0].id, phase: 'baseline' as AuditT['phase'], date: today() })
  const packOf = (id: string) => packs.find((p) => p.id === id) ?? pack
  const current = audits.find((a) => a.id === open)

  const start = () => {
    const a: AuditT = { id: uid(), site: form.site.trim() || 'Untitled site', pack: pack.id, bin: form.bin, phase: form.phase, date: form.date, items: [] }
    setAudits((xs) => [a, ...xs])
    setOpen(a.id)
  }

  if (current) return <AuditSession audit={current} pack={packOf(current.pack)} ready={model.status === 'ready'} classes={model.classes} close={() => setOpen(null)}
    update={(f) => setAudits((xs) => xs.map((x) => (x.id === current.id ? f(x) : x)))}
    remove={() => (setAudits((xs) => xs.filter((x) => x.id !== current.id)), setOpen(null))} />

  return (
    <>
      <div className="lede">
        <div>
          <h1>Bin audit</h1>
          <p>Measure contamination the way waste teams already do: pull items from a bin and photograph each one. Cleanstream sorts them, and you get the contamination rate and the top offenders. Audit before and after a change to see if it worked.</p>
        </div>
      </div>
      <div className="card pad" style={{ marginBottom: 20 }}>
        <div className="form">
          <label className="field">Site or station<input value={form.site} placeholder="e.g. Library lobby" onChange={(e) => setForm({ ...form, site: e.target.value })} /></label>
          <label className="field">Bin audited
            <select value={form.bin} onChange={(e) => setForm({ ...form, bin: e.target.value })}>
              {pack.bins.filter((b) => b.kind !== 'special').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="field">Phase
            <select value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value as AuditT['phase'] })}>
              <option value="baseline">Baseline (before)</option>
              <option value="after">After change</option>
            </select>
          </label>
          <label className="field">Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <button className="btn primary" onClick={start}>Start audit</button>
        </div>
      </div>
      <Compare audits={audits} packOf={packOf} />
      <div className="card">
        <table className="list">
          <thead><tr><th>Site</th><th>Bin</th><th>Phase</th><th>Date</th><th>Items</th><th>Contamination</th></tr></thead>
          <tbody>
            {audits.length === 0 && <tr><td colSpan={6} className="muted">No audits yet. Start one above.</td></tr>}
            {audits.map((a) => {
              const p = packOf(a.pack)
              const c = contamination(a, p)
              return (
                <tr key={a.id} className="click" onClick={() => setOpen(a.id)}>
                  <td><strong>{a.site}</strong><div className="small faint">{p.name}</div></td>
                  <td><BinChip bin={binById(p, a.bin)} /></td>
                  <td>{a.phase === 'baseline' ? 'Baseline' : 'After'}</td>
                  <td>{a.date}</td>
                  <td>{c.n}</td>
                  <td><strong style={{ color: c.rate > 0.15 ? 'var(--bad)' : 'var(--good)' }}>{c.n ? pct(c.rate) : '–'}</strong></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// Baseline vs after, per site and bin, using the latest audit of each phase.
function Compare({ audits, packOf }: { audits: AuditT[]; packOf: (id: string) => Pack }) {
  const pairs = useMemo(() => {
    const m = new Map<string, { base?: AuditT; after?: AuditT }>()
    for (const a of [...audits].sort((x, y) => x.date.localeCompare(y.date))) {
      const k = `${a.site}|${a.pack}|${a.bin}`
      const e = m.get(k) ?? {}
      e[a.phase === 'baseline' ? 'base' : 'after'] = a
      m.set(k, e)
    }
    return [...m.values()].filter((e) => e.base && e.after && e.base.items.length && e.after.items.length) as { base: AuditT; after: AuditT }[]
  }, [audits])
  if (!pairs.length) return null
  return (
    <div className="card pad" style={{ marginBottom: 20 }}>
      <div className="label" style={{ marginBottom: 12 }}>Before and after</div>
      <div style={{ display: 'grid', gap: 18 }}>
        {pairs.map(({ base, after }) => {
          const p = packOf(base.pack)
          const b = contamination(base, p)
          const a = contamination(after, p)
          const max = Math.max(b.rate, a.rate, 0.01)
          const change = a.rate - b.rate
          return (
            <div key={base.id} style={{ display: 'grid', gap: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row"><strong>{base.site}</strong><BinChip bin={binById(p, base.bin)} /></div>
                <strong style={{ color: change <= 0 ? 'var(--good)' : 'var(--bad)' }}>{change <= 0 ? '−' : '+'}{Math.abs(Math.round(change * 100))} points</strong>
              </div>
              {[['Baseline', base.date, b], ['After', after.date, a]].map(([name, date, c]) => {
                const cc = c as ReturnType<typeof contamination>
                return (
                  <div key={name as string} className="hbar">
                    <span className="small">{name as string} <span className="faint">{date as string} · {cc.n} items</span></span>
                    <span className="track"><i style={{ width: `${(cc.rate / max) * 100}%` }} /></span>
                    <strong className="small">{pct(cc.rate)}</strong>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AuditSession({ audit, pack, ready, classes, close, update, remove }: {
  audit: AuditT; pack: Pack; ready: boolean; classes: string[]; close: () => void; update: (f: (a: AuditT) => AuditT) => void; remove: () => void
}) {
  const [queue, setQueue] = useState(0)
  const [fixing, setFixing] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const bin = binById(pack, audit.bin)
  const c = contamination(audit, pack)

  const add = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    setQueue((q) => q + imgs.length)
    for (const f of imgs) {
      const id = uid()
      const thumb = await thumbnail(f)
      update((a) => ({ ...a, items: [...a.items, { id, thumb, pred: '', p: 0 }] }))
      try {
        const r = await classify(f)
        let best = 0
        r.probs.forEach((p, k) => (p > r.probs[best] ? (best = k) : 0))
        update((a) => ({ ...a, items: a.items.map((i) => (i.id === id ? { ...i, pred: classes[best], p: r.probs[best] } : i)) }))
      } finally {
        setQueue((q) => q - 1)
      }
    }
  }

  const csv = () => {
    const rows = [['site', 'city', 'bin_audited', 'phase', 'date', 'item', 'model_item', 'model_confidence', 'corrected', 'belongs_in', 'contaminant']]
    for (const i of audit.items.filter((x) => x.pred)) {
      const l = label(i)
      rows.push([audit.site, pack.name, bin.name, audit.phase, audit.date, itemName(l), itemName(i.pred), i.p.toFixed(3), i.fixed ? 'yes' : 'no', binById(pack, pack.items[l].bin).name, belongs(pack, l, audit.bin) ? 'no' : 'yes'])
    }
    download(`audit-${audit.site.replace(/\W+/g, '-')}-${audit.date}.csv`, rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'))
  }

  return (
    <>
      <div className="lede">
        <div>
          <button className="btn small" onClick={close} style={{ marginBottom: 12 }}>← All audits</button>
          <h1>{audit.site}</h1>
          <div className="row" style={{ marginTop: 8 }}><BinChip bin={bin} /><span className="muted">{audit.phase === 'baseline' ? 'Baseline' : 'After change'} · {audit.date} · {pack.name} rules</span></div>
        </div>
        <div className="row">
          <button className="btn" onClick={csv} disabled={!c.n}>Export CSV</button>
          <button className="btn" onClick={() => confirm('Delete this audit?') && remove()}>Delete</button>
        </div>
      </div>
      <div className="grid2" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <div className="card pad">
          <div className={`drop${over ? ' over' : ''}`} style={{ aspectRatio: 'auto', minHeight: 120, marginBottom: 16 }}
            onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)}
            onDrop={(e) => (e.preventDefault(), setOver(false), add([...e.dataTransfer.files]))}>
            <div className="hint">
              <strong>Add photos of the items you pulled from this bin</strong>
              <span>One item per photo. Drop a whole folder's worth at once.</span>
              <button className="btn primary" disabled={!ready} onClick={() => input.current?.click()}>{ready ? 'Choose photos' : 'Loading model…'}</button>
              <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => (add([...(e.target.files ?? [])]), (e.target.value = ''))} />
            </div>
          </div>
          {queue > 0 && <p className="small muted" style={{ marginBottom: 10 }}>Sorting {queue} photo{queue > 1 ? 's' : ''}…</p>}
          <div className="tiles">
            {audit.items.map((i) => {
              const l = i.pred ? label(i) : ''
              const bad = l && !belongs(pack, l, audit.bin)
              return (
                <button key={i.id} className={`tile${bad ? ' bad' : ''}${i.pred ? '' : ' pending'}`} onClick={() => i.pred && setFixing(i.id)}>
                  <img src={i.thumb} alt={l ? itemName(l) : 'Sorting'} />
                  <span className="cap">
                    <strong>{l ? itemName(l) : 'Sorting…'}</strong>
                    {l && <span className={bad ? '' : 'faint'}>{bad ? `Belongs in ${binById(pack, pack.items[l].bin).name}` : 'Belongs here'}{i.fixed ? ' · corrected' : ''}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="card pad" style={{ display: 'grid', gap: 18 }}>
          <div className="stats">
            <div className="stat"><span className="label">Items</span><b>{c.n}</b></div>
            <div className="stat"><span className="label">Don't belong</span><b>{c.bad}</b></div>
            <div className="stat"><span className="label">Contamination</span><b style={{ color: c.rate > 0.15 ? 'var(--bad)' : 'var(--good)' }}>{c.n ? pct(c.rate) : '–'}</b></div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="label">Top contaminants</div>
            {c.top.length === 0 && <p className="small muted">None yet.</p>}
            {c.top.slice(0, 6).map(([id, n]) => (
              <div key={id} className="hbar">
                <span className="small">{itemName(id)}</span>
                <span className="track"><i style={{ width: `${(n / c.top[0][1]) * 100}%` }} /></span>
                <strong className="small">{n}</strong>
              </div>
            ))}
          </div>
          {c.top.length > 0 && (
            <div className="notice" style={{ background: 'var(--accent-soft)', color: '#0b4a3a' }}>
              <strong>Where to focus:</strong> {itemName(c.top[0][0])} makes up {pct(c.top[0][1] / Math.max(1, c.bad))} of the contamination here. In {pack.name} it belongs in the {binById(pack, pack.items[c.top[0][0]].bin).name.toLowerCase()}. A sign at this station that names it is the cheapest first fix.
            </div>
          )}
          <p className="small faint">Tap any tile to correct it. Corrections count in the totals and are marked in the export.</p>
        </div>
      </div>
      {fixing && <ItemPicker pack={pack} onClose={() => setFixing(null)} onPick={(id) => (update((a) => ({ ...a, items: a.items.map((i) => (i.id === fixing ? { ...i, fixed: id === i.pred ? undefined : id } : i)) })), setFixing(null))} />}
    </>
  )
}
