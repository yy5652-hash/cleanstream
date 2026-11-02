import { useEffect, useState } from 'react'
import type { Pack } from '../rules'
import { pct } from '../ui'

type Scores = { item_acc: number; material_acc: number | null; bin_acc: Record<string, number>; n_item: number }
type Answered = { coverage: number; accuracy_answered: number | null }
type SetKey = 'test' | 'test_original' | 'external' | 'field'
// test_original (TrashNet, Garbage Dataset and TACO only) and field (everyday photos) are written by ml/final_eval.py, so they can be missing
type Metrics = {
  backbone: string
  classes: number
  n_train: number
  model_mb: number
  test: Scores
  test_original?: Scores
  external: Scores
  field?: Scores
  zero_shot: { test: Scores; external: Scores } & Partial<Record<SetKey, Scores>>
  answered: Record<string, { test: Answered; external: Answered } & Partial<Record<SetKey, Answered>>>
  datasets: { name: string; url: string; license: string; role: string; images: number }[]
}

// The sets shown in the tables, in order; a set is listed only when metrics.json has it
const SETS: { key: SetKey; name: string; short: string }[] = [
  { key: 'test', name: 'All held-out test photos', short: 'Held-out test' },
  { key: 'test_original', name: 'Held-out test, TrashNet, Garbage Dataset and TACO only', short: 'Original three sources' },
  { key: 'external', name: 'RealWaste (never seen)', short: 'RealWaste' },
  { key: 'field', name: 'Web field test (everyday items)', short: 'Field test' },
]
const REPO = 'https://github.com/yy5652-hash/cleanstream/blob/main'
const pctOrDash = (x: number | null | undefined) => (x == null ? '—' : pct(x))

export default function About({ packs }: { packs: Pack[] }) {
  const [m, setM] = useState<Metrics | null>(null)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}model/metrics.json`).then((r) => r.json()).then(setM).catch(() => setM(null))
  }, [])
  const nyc = m?.answered.nyc
  const sets = m ? SETS.filter((s) => m[s.key]) : []
  // one column per (set, model); zero-shot columns exist only where metrics.json has them
  const cols = sets.flatMap((s) => [{ ...s, model: 'zero-shot', scores: m?.zero_shot[s.key], bold: false }, { ...s, model: 'Cleanstream', scores: m?.[s.key], bold: true }]).filter((c) => c.scores)
  const trainSets = m?.datasets.filter((d) => d.role.includes('train')) ?? []

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
        <div><b>2. Image encoder</b>SigLIP 2 (ViT-B/16), open weights stored in 8 bits, running in WebAssembly.</div>
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
            {m.field && <div className="card"><span className="label">Right bin, everyday photos</span><b>{pct(m.field.bin_acc.nyc)}</b><span className="small muted">web field test: {m.field.n_item.toLocaleString()} stock photos and video frames, never trained on</span></div>}
            {nyc && <div className="card"><span className="label">When it answers</span><b>{pctOrDash(nyc.test.accuracy_answered)}</b><span className="small muted">bin accuracy on the {pct(nyc.test.coverage)} of test photos it is sure about</span></div>}
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="list">
              <thead><tr><th>Test set</th><th>Model</th><th>Item type</th><th>Material</th></tr></thead>
              <tbody>
                {sets.map((st) => (
                  [['Text prompts only (zero-shot)', m.zero_shot[st.key]], ['Cleanstream', m[st.key]]] as const).filter(([, s]) => s).map(([model, s], i) => (
                  <tr key={st.key + model}>
                    <td>{i === 0 ? <><strong>{st.name}</strong><div className="small muted">{m[st.key]!.n_item.toLocaleString()} photos</div></> : null}</td>
                    <td>{model}</td>
                    <td>{pct(s!.item_acc)}</td>
                    <td>{pctOrDash(s!.material_acc)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ margin: '14px 0 8px' }}>Right bin under each place's rules: the same model and photos, only the rule pack changes.</p>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="list">
              <thead><tr><th>Rules</th>{cols.map((c) => <th key={c.key + c.model}>{c.short}, {c.model}</th>)}</tr></thead>
              <tbody>
                {packs.filter((p) => m.test.bin_acc[p.id] !== undefined).map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    {cols.map((c) => <td key={c.key + c.model}>{c.bold ? <strong>{pctOrDash(c.scores!.bin_acc[p.id])}</strong> : pctOrDash(c.scores!.bin_acc[p.id])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            Item head trained on {m.n_train.toLocaleString()} photos from {trainSets.length} open sources ({trainSets.map((d) => d.name).join(', ')}), each given the same total weight in training.
            Every number above is measured with the same {m.model_mb} MB model file that ships in this page.
            Bin accuracy counts the bin the app would show. Training images that were near-copies of any test image were removed first.
            {m.field && ' The field test is photos and video frames of everyday items from Pexels, labelled by looking at each one and never trained on; its errors on mugs and pizza boxes are why those types got more photos.'}
            {' '}RealWaste was looked at twice during development, so treat its numbers as slightly optimistic. This model is stronger on everyday items and weaker on landfill photos than the first one (79.3% before for New York's bins).
          </p>
        </>
      )}

      <h2>What makes the model good at this job</h2>
      <ul>
        <li><b>Item types follow the rules, not the material.</b> A plastic bottle and a plastic bag are both plastic, but most cities want them in different places, so they are different classes.</li>
        <li><b>It learns from coarse labels too.</b> Thousands of public photos are only labelled "plastic" or "metal". A partial-label loss lets those photos teach the model without guessing their exact type.</li>
        <li><b>It keeps what the encoder already knows.</b> The classifier starts from the model's own text descriptions of each item ("a crumpled chip bag") and is pulled back toward them while it trains. For the rarest item types we added Wikimedia Commons photos, each checked by eye.</li>
        <li><b>No single source sets the boundaries.</b> Each of the {trainSets.length || 'seven'} training sources carries the same total weight in the loss, so the largest one cannot drown out the rest.</li>
        <li><b>It was tested on photos from somewhere else.</b> RealWaste, photos of real waste at a landfill sorting line, is never used for training, and the model's settings were chosen on validation photos. We did look at RealWaste twice during development (an earlier candidate lifted everyday photos but lost 6 points on it), so treat it as slightly optimistic. It shows how the model holds up on photos unlike its training data.</li>
        <li><b>It knows when to ask.</b> The app adds up probability per bin, so it can be sure of the bin even when two item types look alike, and it says so plainly when it is not.</li>
      </ul>

      <h2>Measuring the impact</h2>
      <p>The audit tab turns a standard bin audit into a few minutes of photos. A site audits its bins for a baseline, adds a bin station, then audits again. The before-and-after view shows the change in contamination rate and which items still cause it, and the CSV export keeps every item for reporting.</p>

      <h2>Built to deploy</h2>
      <ul>
        <li>A static web page. No server, no account, no per-scan cost. After the first load it works offline.</li>
        <li>Runs on an old tablet or phone at a bin station, or on anyone's phone at home. The model uses several threads where the browser allows it.</li>
        <li>The bin station spots an item by the share of the view that changed, ignores changes in light, and classifies a crop around the item, so a small item such as a held-up bottle counts.</li>
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
          <p className="small muted">Image encoder: SigLIP 2 ViT-B/16 at 256 px (Google, Apache 2.0), loaded through open_clip and exported to ONNX. Runtime: ONNX Runtime Web. Rule sources are linked on the Rules tab. Photo credits for the Wikimedia Commons images are in <a href={`${REPO}/ml/commons_credits.csv`} target="_blank" rel="noreferrer">ml/commons_credits.csv</a>.</p>
        </>
      )}
    </div>
  )
}
