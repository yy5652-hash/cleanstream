import { useState } from 'react'
import { ITEMS, itemName, searchItems } from '../items'
import { binById, type Pack } from '../rules'
import { BinChip } from '../ui'

export default function Rules({ pack, packs }: { pack: Pack; packs: Pack[] }) {
  const [q, setQ] = useState('')
  const [onlyDiff, setOnlyDiff] = useState(false)
  const hits = q.trim().length >= 2 ? new Set(searchItems(q, 32)) : null // same synonyms as the Scan search
  const ids = Object.keys(ITEMS).filter((id) => {
    if (hits && !hits.has(id)) return false
    if (onlyDiff) return new Set(packs.map((p) => binById(p, p.items[id].bin).kind)).size > 1
    return true
  })
  const differ = Object.keys(ITEMS).filter((id) => new Set(packs.map((p) => binById(p, p.items[id].bin).kind)).size > 1).length

  return (
    <>
      <div className="lede">
        <div>
          <h1>{pack.name} rules</h1>
          <p>Every answer Cleanstream gives comes from this table, and every row links to the official source. Rules are plain JSON, so a campus or city can edit its own pack. Checked {pack.checked}.</p>
        </div>
        <div className="row">
          <input className="search" placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className={`btn${onlyDiff ? ' primary' : ''}`} onClick={() => setOnlyDiff(!onlyDiff)}>Where places differ ({differ})</button>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        {pack.bins.map((b) => (
          <div key={b.id} className="card" style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="dot" style={{ background: b.color, width: 14, height: 14, outline: '1px solid #0002' }} />
            <div><strong className="small">{b.name}</strong><div className="small muted">{b.accepts}</div></div>
          </div>
        ))}
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="list">
          <thead>
            <tr><th>Item</th><th>{pack.name}</th><th>Before you toss it</th>{packs.filter((p) => p.id !== pack.id).map((p) => <th key={p.id}>{p.name}</th>)}</tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const r = pack.items[id]
              return (
                <tr key={id}>
                  <td style={{ minWidth: 180 }}><strong>{itemName(id)}</strong><div className="small faint">{ITEMS[id].examples}</div></td>
                  <td><BinChip bin={binById(pack, r.bin)} /></td>
                  <td style={{ minWidth: 260 }}>
                    <div className="small">{r.prep.join(' · ')}</div>
                    <div className="small faint" style={{ marginTop: 4 }}>{r.why} <a href={r.source} target="_blank" rel="noreferrer">Source</a></div>
                  </td>
                  {packs.filter((p) => p.id !== pack.id).map((p) => <td key={p.id}><BinChip bin={binById(p, p.items[id].bin)} /></td>)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="small muted" style={{ marginTop: 14 }}>
        Sources: {pack.sources.map((s, i) => <span key={s.url}>{i ? ' · ' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>)}
      </div>
    </>
  )
}
