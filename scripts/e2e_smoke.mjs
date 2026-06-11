// Headless E2E smoke test for the BRENDA-map money path.
// Run with the preview server up: `npm run preview` then `node scripts/e2e_smoke.mjs`.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:4173/'

const fail = (msg) => {
  console.error('FAIL:', msg)
  process.exitCode = 1
}

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return true
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

if (!(await waitForServer(BASE))) {
  fail(`preview server not reachable at ${BASE}`)
  process.exit(1)
}

const consoleErrors = []
const pageErrors = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => pageErrors.push(e.message))

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })

  // 1. load the default sample
  await page.getByRole('button', { name: 'Load sample' }).first().click()

  // 2. overview: BRENDA pathway tiles
  await page.locator('g.sector').first().waitFor({ timeout: 20000 })
  const titles = await page.$$eval('g.sector title', (els) => els.map((e) => e.textContent || ''))
  console.log(`overview pathways lit: ${titles.length}`)
  if (titles.length < 10) fail(`expected >=10 pathways, got ${titles.length}`)

  const gly = titles.find((t) => t.split('\n')[0].trim() === 'glycolysis') || ''
  const glyScore = Number((gly.match(/mean log2FC (-?[\d.]+)/) || [])[1])
  console.log(`  glycolysis mean log2FC = ${glyScore}`)
  if (!gly) fail('glycolysis pathway missing from overview')
  else if (!(glyScore > 0)) fail(`glycolysis should be up, got ${glyScore}`)

  // 3. drill into glycolysis -> BRENDA SVG map
  const idx = titles.findIndex((t) => t.split('\n')[0].trim() === 'glycolysis')
  await page.locator('g.sector').nth(idx).click()
  await page.locator('.brenda-svg svg').first().waitFor({ timeout: 25000 })
  await page
    .waitForFunction(() => {
      const s = document.querySelector('.brenda-svg svg')
      return s && s.querySelectorAll('g.node.nodeEN').length > 0
    }, { timeout: 15000 })
    .catch(() => {})
  await page.waitForTimeout(1500)

  const probe = await page.evaluate(() => {
    const svg = document.querySelector('.brenda-svg svg')
    let visible = 0
    let colored = 0
    let realColor = 0 // computed fill is an actual red/blue (not grey/default)
    svg.querySelectorAll('g.node.nodeEN').forEach((n) => {
      const b = n.getBoundingClientRect()
      if (b.width > 2 && b.height > 2) visible++
      if (n.getAttribute('data-flux') === '1') {
        colored++
        const rect = n.querySelector('rect')
        const m = rect && /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(getComputedStyle(rect).fill)
        if (m && Math.max(+m[1], +m[2], +m[3]) - Math.min(+m[1], +m[2], +m[3]) > 25) realColor++
      }
    })
    return { visible, colored, realColor }
  })
  console.log(`  glycolysis map: visibleEnzymes=${probe.visible}, flux-colored=${probe.colored}, real-colored=${probe.realColor}`)
  if (probe.visible < 5) fail(`expected enzyme boxes visible, got ${probe.visible}`)
  if (probe.colored < 3) fail(`expected flux-colored enzymes, got ${probe.colored}`)
  if (probe.realColor < 3) fail(`flux enzymes not actually painted a diverging color, got ${probe.realColor}`)

  // 4. side panel lists EC-level flux
  const rows = await page.locator('.sector-panel .rxn-table tbody tr').count()
  console.log(`  sector panel rows: ${rows}`)
  if (rows < 1) fail('sector panel has no rows')

  // 5. back to overview
  await page.getByRole('button', { name: '← Overview' }).click()
  await page.locator('g.sector').first().waitFor({ timeout: 6000 })
  console.log('back-to-overview: ok')
} catch (e) {
  fail(`exception: ${e.message}`)
} finally {
  console.log('\n--- console.error ---')
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)')
  console.log('--- uncaught page errors ---')
  console.log(pageErrors.length ? pageErrors.join('\n') : '(none)')
  await browser.close()
}

if (pageErrors.length) fail(`${pageErrors.length} uncaught page error(s)`)
console.log(process.exitCode ? '\nE2E: FAILED' : '\nE2E: PASSED')
