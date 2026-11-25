/** From the repo root, run node ml/web_parity.mjs http://localhost:5173/cleanstream/ ml/results/heldup.json
 * data/heldup /tmp/browser-probs.json with the Vite dev server running. Set PLAYWRIGHT to Playwright's
 * index.mjs path if the package is installed outside this project. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [base, heldup, images, output] = process.argv.slice(2)
if (!output) throw new Error('Usage: node ml/web_parity.mjs BASE_URL HELDUP_JSON IMAGE_DIR OUTPUT_JSON')
const baseURL = new URL(base)
if (!baseURL.pathname.endsWith('/')) baseURL.pathname += '/'
const clientURL = new URL('src/model/client.ts', baseURL).href
const { rows: photos } = JSON.parse(await readFile(heldup, 'utf8'))
const { chromium } = await import(process.env.PLAYWRIGHT
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT)).href
  : 'playwright')
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(baseURL.href)
  const response = await page.request.get(new URL('model/head.json', baseURL).href)
  if (!response.ok()) throw new Error(`Cannot read model classes: HTTP ${response.status()}`)
  const { classes } = await response.json()
  const rows = []
  for (const { pageid } of photos) {
    const jpeg = await readFile(join(images, `${pageid}.jpg`))
    const probs = await page.evaluate(async ({ clientURL, jpeg }) => {
      const { classify } = await import(clientURL)
      const bytes = Uint8Array.from(atob(jpeg), ch => ch.charCodeAt(0))
      const result = await classify(new Blob([bytes], { type: 'image/jpeg' }))
      return Array.from(result.probs)
    }, { clientURL, jpeg: jpeg.toString('base64') })
    if (probs.length !== classes.length || !probs.every(Number.isFinite)) {
      throw new Error(`Invalid probabilities for pageid ${pageid}`)
    }
    rows.push({ pageid, probs })
    if (rows.length % 10 === 0) console.log(`${rows.length}/${photos.length} photos`)
  }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify({ classes, rows }) + '\n')
} finally {
  await browser.close()
}
