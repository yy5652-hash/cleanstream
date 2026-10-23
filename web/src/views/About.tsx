import { useEffect, useState } from 'react'
import type { Pack } from '../rules'
import { pct } from '../ui'

type Scores = { item_acc: number; material_acc: number; bin_acc: Record<string, number>; n_item: number }
type Metrics = {
  backbone: string
  classes: number
  n_train: number
  model_mb: number
  test: Scores
  external: Scores
  zero_shot: { test: Scores; external: Scores }
  answered: Record<string, { test: { coverage: number; accuracy_answered: number }; external: { coverage: number; accuracy_answered: number } }>
  datasets: { name: string; url: string; license: string; role: string; images: number }[]
}

export default function About({ packs }: { packs: Pack[] }) {
  const [m, setM] = useState<Metrics | null>(null)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}model/metrics.json`).then((r) => r.json()).then(setM).catch(() => setM(null))
  }, [])
  const nyc = m?.answered.nyc

  return (
    <div className="prose" style={{ maxWidth: 900 }}>
      <div className="lede" style={{ marginBottom: 0 }}>
        <div>
          <h1>How Cleanstream works</h1>
          <p>A recognition model that runs in the browser, rule packs with official sources, and an audit tool to measure the result.</p>
        </div>
      </div>

      <div className="pipeline">
        <div><b>1. Photo</b>Camera, upload, or a bin-station tablet. It stays on the device.</div>
        <div><b>2. Image encoder</b>SigLIP 2 (ViT-B/32), open weights stored in 8 bits, running in WebAssembly.</div>
        <div><b>3. Item head</b>{m?.classes ?? 32} item types, chosen by what changes the bin.</div>
        <div><b>4. Rule pack</b>The city's bin for that item, plus prep steps and a source link.</div>
        <div><b>5. Answer or ask</b>Probabilities are summed per bin. Below 60% it says it is not sure.</div>
      </div>

      {m && (
        <>
          <h2>Results</h2>
          <div className="metric">
            <div className="card"><span className="label">Right bin, NYC rules</span><b>{pct(m.test.bin_acc.nyc)}</b><span className="small muted">held-out test photos ({m.test.n_item.toLocaleString()})</span></div>
            <div className="card"><span className="label">Right item type</span><b>{pct(m.test.item_acc)}</b><span className="small muted">out of {m.classes} types, same test photos</span></div>
            <div className="card"><span className="label">Right bin, unseen dataset</span><b>{pct(m.external.bin_acc.nyc)}</b><span className="small muted">RealWaste: landfill photos never used in training</span></div>
            {nyc && <div className="card"><span className="label">When it answers</span><b>{pct(nyc.test.accuracy_answered)}</b><span className="small muted">bin accuracy on the {pct(nyc.test.coverage)} of test photos it is sure about</span></div>}
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="list">
              <thead><tr><th>Test set</th><th>Model</th><th>Item type</th><th>Material</th>{packs.map((p) => <th key={p.id}>Bin ({p.name})</th>)}</tr></thead>
              <tbody>
                {([['Held-out test split', 'test'], ['RealWaste (never seen)', 'external']] as const).map(([name, k]) => (
                  [['Text prompts only (zero-shot)', m.zero_shot[k]], ['Cleanstream', m[k]]] as const).map(([model, s], i) => (
                  <tr key={name + model}>
                    <td>{i === 0 ? <strong>{name}</strong> : null}</td>
                    <td>{model}</td>
                    <td>{pct(s.item_acc)}</td>
                    <td>{pct(s.material_acc)}</td>
                    {packs.map((p) => <td key={p.id}>{pct(s.bin_acc[p.id])}</td>)}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            Item head trained on {m.n_train.toLocaleString()} photos. Every number above is measured with the same {m.model_mb} MB model file that ships in this page.
            Bin accuracy counts the bin the app would show. Training images that were near-copies of any test image were removed first.
          </p>
        </>
      )}

      <h2>What makes the model good at this job</h2>
      <ul>
        <li><b>Item types follow the rules, not the material.</b> A plastic bottle and a plastic bag are both plastic, but most cities want them in different places, so they are different classes.</li>
        <li><b>It learns from coarse labels too.</b> Thousands of public photos are only labelled "plastic" or "metal". A partial-label loss lets those photos teach the model without guessing their exact type.</li>
        <li><b>It keeps what the encoder already knows.</b> The classifier starts from the model's own text descriptions of each item ("a crumpled chip bag") and is pulled back toward them while it trains. Item types with no training photos keep their text-only weights, so they are still recognised.</li>
        <li><b>It was tested on photos from somewhere else.</b> RealWaste, photos of real waste at a landfill sorting line, is never used for training or tuning. It shows how the model holds up on photos unlike its training data.</li>
        <li><b>It knows when to ask.</b> The app adds up probability per bin, so it can be sure of the bin even when two item types look alike, and it says so plainly when it is not.</li>
      </ul>

      <h2>Measuring the impact</h2>
      <p>The audit tab turns a standard bin audit into a few minutes of photos. A site audits its bins for a baseline, adds a bin station, then audits again. The before-and-after view shows the change in contamination rate and which items still cause it, and the CSV export keeps every item for reporting.</p>

      <h2>Built to deploy</h2>
      <ul>
        <li>A static web page. No server, no account, no per-scan cost. After the first load it works offline.</li>
        <li>Runs on an old tablet or phone at a bin station, or on anyone's phone at home.</li>
        <li>Rule packs are JSON with a source link on every row, so a campus facilities team can adapt one in an afternoon.</li>
      </ul>

      {m && (
        <>
          <h2>Data and credits</h2>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="list">
              <thead><tr><th>Dataset</th><th>Used for</th><th>Images</th><th>License</th></tr></thead>
              <tbody>
                {m.datasets.map((d) => (
                  <tr key={d.name}><td><a href={d.url} target="_blank" rel="noreferrer">{d.name}</a></td><td>{d.role}</td><td>{d.images.toLocaleString()}</td><td>{d.license}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Image encoder: SigLIP 2 ViT-B/32 at 256 px (Google, Apache 2.0), loaded through open_clip and exported to ONNX. Runtime: ONNX Runtime Web. Rule sources are linked on the Rules tab.</p>
        </>
      )}
    </div>
  )
}
