import { useEffect, useState } from 'react'
import { t } from '../i18n'
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
const SETS: { key: SetKey; name: () => string; short: () => string }[] = [
  { key: 'test', name: () => t('All held-out test photos'), short: () => t('Held-out test') },
  { key: 'test_original', name: () => t('Held-out test, TrashNet, Garbage Dataset and TACO only'), short: () => t('Original three sources') },
  { key: 'external', name: () => t('RealWaste (never seen)'), short: () => t('RealWaste') },
  { key: 'field', name: () => t('Web field test (everyday items)'), short: () => t('Field test') },
]
const REPO = 'https://github.com/yy5652-hash/cleanstream/blob/main'
const pctOrDash = (x: number | null | undefined) => (x == null ? t('—') : pct(x))

export default function About({ packs }: { packs: Pack[] }) {
  const [m, setM] = useState<Metrics | null>(null)
  useEffect(() => {
    let ignore = false
    fetch(`${import.meta.env.BASE_URL}model/metrics.json`).then((r) => r.ok ? r.json() : Promise.reject()).then((value) => { if (!ignore) setM(value) }).catch(() => { if (!ignore) setM(null) })
    return () => { ignore = true }
  }, [])
  const nyc = m?.answered.nyc
  const sets = m ? SETS.filter((s) => m[s.key]) : []
  // one column per (set, model); zero-shot columns exist only where metrics.json has them
  const cols = sets.flatMap((s) => [{ ...s, model: 'zero-shot', scores: m?.zero_shot[s.key], bold: false }, { ...s, model: 'Cleanstream', scores: m?.[s.key], bold: true }]).filter((c) => c.scores)
  const trainSets = m?.datasets.filter((d) => d.role.includes('train')) ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-8 animate-rise [&_h2]:pt-6 [&_h2]:text-title [&_p]:leading-relaxed [&_ul]:space-y-5 [&_li]:text-ink-2 [&_li>b]:mb-2 [&_li>b]:block [&_b]:text-ink [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:underline [&_a]:underline-offset-4 [&_a]:break-words [&_th]:p-4 [&_th]:text-left [&_th]:font-medium [&_th]:text-ink-2 [&_td]:p-4 [&_tr]:border-b [&_tr]:border-line">
      <div className="max-w-2xl [&_h1]:text-display [&_p]:mt-5 [&_p]:text-lg [&_p]:text-ink-2">
        <div>
          <h1>{t("How Cleanstream works")}</h1>
          <p>{t("A recognition model that runs in the browser, rule packs with official sources, and an audit tool to measure the result.")}</p>
        </div>
      </div>

      <div className="grid gap-5 rounded-3xl bg-well p-6 sm:p-8 [&_b]:mb-2 [&_b]:block">
        <div><b>{t("1. Photo")}</b>{t("Camera, upload, or a bin-station tablet. It stays on the device.")}</div>
        <div><b>{t("2. Image encoder")}</b>{t("SigLIP 2 (ViT-B/16), open weights stored in 8 bits, running in WebAssembly.")}</div>
        <div><b>{t("3. Item head")}</b>{t('{count} item types, chosen by what changes the bin.', { count: m?.classes ?? 32 })}</div>
        <div><b>{t("4. Rule pack")}</b>{t("The city's bin for that item, plus prep steps and a source link.")}</div>
        <div><b>{t("5. Answer or ask")}</b>{t("Probabilities are summed per bin. Below 60% it says it is not sure.")}</div>
      </div>

      {!m && <p role="status" className="text-sm text-ink-2">{t('Results will appear when the model metrics are available.')}</p>}
      {m && (
        <>
          <h2>{t("Results")}</h2>
          <div className="grid gap-6 sm:grid-cols-2 [&_b]:my-3 [&_b]:block [&_b]:text-display [&_b]:tabular-nums">
            <div className="rounded-3xl bg-well p-6"><span className="block font-medium">{t("Right bin, NYC rules")}</span><b>{pct(m.test.bin_acc.nyc)}</b><span className="text-sm text-ink-2">{t('held-out test photos ({count})', { count: m.test.n_item.toLocaleString() })}</span></div>
            <div className="rounded-3xl bg-well p-6"><span className="block font-medium">{t("Right item type")}</span><b>{pct(m.test.item_acc)}</b><span className="text-sm text-ink-2">{t('out of {count} types, same test photos', { count: m.classes })}</span></div>
            <div className="rounded-3xl bg-well p-6"><span className="block font-medium">{t("Right bin, unseen dataset")}</span><b>{pct(m.external.bin_acc.nyc)}</b><span className="text-sm text-ink-2">{t("RealWaste: landfill photos never used in training")}</span></div>
            {m.field && <div className="rounded-3xl bg-well p-6"><span className="block font-medium">{t("Right bin, everyday photos")}</span><b>{pct(m.field.bin_acc.nyc)}</b><span className="text-sm text-ink-2">{t('web field test: {count} stock photos and video frames, never trained on', { count: m.field.n_item.toLocaleString() })}</span></div>}
            {nyc && <div className="rounded-3xl bg-well p-6"><span className="block font-medium">{t("When it answers")}</span><b>{pctOrDash(nyc.test.accuracy_answered)}</b><span className="text-sm text-ink-2">{t('bin accuracy on the {coverage} of test photos it is sure about', { coverage: pct(nyc.test.coverage) })}</span></div>}
          </div>
          <div role="region" tabIndex={0} aria-label={t('Results table')} className="max-w-full overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-sm">
              <thead><tr><th>{t("Test set")}</th><th>{t("Model")}</th><th>{t("Item type")}</th><th>{t("Material")}</th></tr></thead>
              <tbody>
                {sets.map((st) => (
                  [['Text prompts only (zero-shot)', m.zero_shot[st.key]], ['Cleanstream', m[st.key]]] as const).filter(([, s]) => s).map(([model, s], i) => (
                  <tr key={st.key + model}>
                    <td>{i === 0 ? <><strong>{st.name()}</strong><div className="text-sm text-ink-2">{t('{count} photos', { count: m[st.key]!.n_item.toLocaleString() })}</div></> : null}</td>
                    <td>{model === 'Cleanstream' ? t('Cleanstream') : t('Text prompts only (zero-shot)')}</td>
                    <td>{pct(s!.item_acc)}</td>
                    <td>{pctOrDash(s!.material_acc)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-ink-2">{t("Right bin under each place's rules: the same model and photos, only the rule pack changes.")}</p>
          <div role="region" tabIndex={0} aria-label={t('Results table')} className="max-w-full overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-sm">
              <thead><tr><th>{t("Rules")}</th>{cols.map((c) => <th key={c.key + c.model}>{t('{set}, {model}', { set: c.short(), model: c.model === 'zero-shot' ? t('zero-shot') : t('Cleanstream') })}</th>)}</tr></thead>
              <tbody>
                {packs.filter((p) => m.test.bin_acc[p.id] !== undefined).map((p) => (
                  <tr key={p.id}>
                    <td><strong>{t('{city}', { city: p.name })}</strong></td>
                    {cols.map((c) => <td key={c.key + c.model}>{c.bold ? <strong>{pctOrDash(c.scores!.bin_acc[p.id])}</strong> : pctOrDash(c.scores!.bin_acc[p.id])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-ink-2">
            {t('Item head trained on {count} photos from {sources} open sources ({names}), each given the same total weight in training. Every number above is measured with the same {size} MB model file that ships in this page. Bin accuracy counts the bin the app would show. Training images that were near-copies of any test image were removed first.', { count: m.n_train.toLocaleString(), sources: trainSets.length, names: trainSets.map((d) => d.name).join(', '), size: m.model_mb })}
            {m.field && <span className="mt-4 block">{t('The field test is photos and video frames of everyday items from Pexels, labelled by looking at each one and never trained on; its errors on mugs and pizza boxes are why those types got more photos.')}</span>}
            <span className="mt-4 block">{t("RealWaste was looked at twice during development, so treat its numbers as slightly optimistic. This model is stronger on everyday items and weaker on landfill photos than the first one (79.3% before for New York's bins).")}</span>
          </p>
        </>
      )}

      <h2>{t("What makes the model good at this job")}</h2>
      <ul>
        <li><b>{t("Item types follow the rules, not the material.")}</b>{t("A plastic bottle and a plastic bag are both plastic, but most cities want them in different places, so they are different classes.")}</li>
        <li><b>{t("It learns from coarse labels too.")}</b>{t("Thousands of public photos are only labelled \"plastic\" or \"metal\". A partial-label loss lets those photos teach the model without guessing their exact type.")}</li>
        <li><b>{t("It keeps what the encoder already knows.")}</b>{t("The classifier starts from the model's own text descriptions of each item (\"a crumpled chip bag\") and is pulled back toward them while it trains. For the rarest item types we added Wikimedia Commons photos, each checked by eye.")}</li>
        <li><b>{t("No single source sets the boundaries.")}</b> {t('Each of the {count} training sources carries the same total weight in the loss, so the largest one cannot drown out the rest.', { count: trainSets.length || t('seven') })}</li>
        <li><b>{t("It was tested on photos from somewhere else.")}</b>{t("RealWaste, photos of real waste at a landfill sorting line, is never used for training, and the model's settings were chosen on validation photos. We did look at RealWaste twice during development (an earlier candidate lifted everyday photos but lost 6 points on it), so treat it as slightly optimistic. It shows how the model holds up on photos unlike its training data.")}</li>
        <li><b>{t("It knows when to ask.")}</b>{t("The app adds up probability per bin, so it can be sure of the bin even when two item types look alike, and it says so plainly when it is not.")}</li>
      </ul>

      <h2>{t("Measuring the impact")}</h2>
      <p>{t("The audit tab turns a standard bin audit into a few minutes of photos. A site audits its bins for a baseline, adds a bin station, then audits again. The before-and-after view shows the change in contamination rate and which items still cause it, and the CSV export keeps every item for reporting.")}</p>

      <h2>{t("Built to deploy")}</h2>
      <ul>
        <li>{t("A static web page. No server, no account, no per-scan cost. After the first load it works offline.")}</li>
        <li>{t("Runs on an old tablet or phone at a bin station, or on anyone's phone at home. The model uses several threads where the browser allows it.")}</li>
        <li>{t("The bin station spots an item by the share of the view that changed, ignores changes in light, and classifies a crop around the item, so a small item such as a held-up bottle counts.")}</li>
        <li>{t("Rule packs are JSON with a source link on every row, so a campus facilities team can adapt one in an afternoon.")}</li>
      </ul>

      {m && (
        <>
          <h2>{t("Data and credits")}</h2>
          <div role="region" tabIndex={0} aria-label={t('Results table')} className="max-w-full overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-sm">
              <thead><tr><th>{t("Dataset")}</th><th>{t("Used for")}</th><th>{t("Images")}</th><th>{t("License")}</th></tr></thead>
              <tbody>
                {m.datasets.map((d) => (
                  <tr key={d.name}><td><a href={d.url} target="_blank" rel="noreferrer">{t('{dataset}', { dataset: d.name })}</a></td><td>{t('{role}', { role: d.role })}</td><td>{d.images.toLocaleString()}</td><td>{t('{license}', { license: d.license })}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-ink-2">{t('Image encoder: SigLIP 2 ViT-B/16 at 256 px (Google, Apache 2.0), loaded through open_clip and exported to ONNX. Runtime: ONNX Runtime Web. Rule sources are linked on the Rules tab. Photo credits for the Wikimedia Commons images are in {file}.', { file: 'ml/commons_credits.csv' })} <a href={`${REPO}/ml/commons_credits.csv`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center">{t('View photo credits')}</a></p>
        </>
      )}
    </div>
  )
}
