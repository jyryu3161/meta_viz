// Visual QA harness for the BRENDA-map flow: loads each sample, captures the
// pathway-category overview + drilled BRENDA pathway maps into ./temp_figures/,
// and asserts the maps render with flux-colored enzyme boxes and a populated panel.
//
// Usage: `npm run preview` in one shell, then `node scripts/visual_qa.mjs`.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:4173/'
const OUT = process.env.OUT_DIR || './temp_figures'
mkdirSync(OUT, { recursive: true })

let failures = 0
const fail = (s, m) => {
  console.error(`  FAIL [${s}]: ${m}`)
  failures++
}
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 40)
const parseScore = (t) => Number((t.match(/mean log2FC (-?[\d.]+)/) || [])[1])

const SCENARIOS = [
  { id: 'core_aerobic_anaerobic', sample: 'core_aerobic_anaerobic', minSectors: 10, named: { name: 'glycolysis', sign: 1 } },
  { id: 'core_glucose_acetate', sample: 'core_glucose_acetate', minSectors: 10, named: { name: 'glycolysis', sign: -1 } },
  { id: 'core_edge_cases', sample: 'core_edge_cases', minSectors: 1 },
  { id: 'ijo_nutrient_shift', sample: 'ijo_nutrient_shift', minSectors: 30 },
]

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

async function loadScenario(page, sc) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.locator('.sample-selector select').first().selectOption(sc.sample)
  await page.locator('g.sector').first().waitFor({ timeout: 25000 })
}

async function enzymeProbe(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('.brenda-svg svg')
    if (!svg) return { visible: 0, colored: 0, realColor: 0 }
    let visible = 0
    let colored = 0
    let realColor = 0
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
}

async function run() {
  if (!(await waitForServer(BASE))) {
    console.error(`preview not reachable at ${BASE}`)
    process.exit(1)
  }
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  for (const sc of SCENARIOS) {
    console.log(`\n=== ${sc.id} ===`)
    try {
      await loadScenario(page, sc)
    } catch (e) {
      fail(sc.id, `load: ${e.message}`)
      continue
    }
    const titles = await page.$$eval('g.sector title', (els) => els.map((e) => e.textContent || ''))
    console.log(`  pathways lit: ${titles.length}`)
    if (titles.length < sc.minSectors) fail(sc.id, `expected >=${sc.minSectors} pathways, got ${titles.length}`)
    if (sc.named) {
      const t = titles.find((x) => x.split('\n')[0].trim() === sc.named.name) || ''
      const score = parseScore(t)
      console.log(`  ${sc.named.name} score=${score} (want sign ${sc.named.sign})`)
      if (t && Math.sign(score) !== sc.named.sign) fail(sc.id, `${sc.named.name} sign ${Math.sign(score)} != ${sc.named.sign}`)
    }
    await page.screenshot({ path: `${OUT}/${sc.id}__overview.png` })

    const ranked = titles
      .map((t, i) => ({ i, name: (t.split('\n')[0] || '').trim(), score: parseScore(t) }))
      .filter((x) => Number.isFinite(x.score))
      .sort((a, b) => b.score - a.score)
    const picks = [ranked[0], ranked[ranked.length - 1]].filter(Boolean)

    for (const pick of picks) {
      await page.locator('g.sector').nth(pick.i).click()
      const rendered = await page.locator('.brenda-svg svg').first().waitFor({ timeout: 25000 }).then(() => true).catch(() => false)
      const fellBack = (await page.locator('.brenda-status.err').count()) > 0
      if (rendered) {
        await page
          .waitForFunction(() => {
            const s = document.querySelector('.brenda-svg svg')
            return s && s.querySelectorAll('g.node.nodeEN').length > 0
          }, { timeout: 15000 })
          .catch(() => {})
        await page.waitForTimeout(1500)
        const probe = await enzymeProbe(page)
        console.log(`  detail ${pick.name}: visibleEnzymes=${probe.visible}, colored=${probe.colored}, real=${probe.realColor}`)
        if (!fellBack && probe.visible < 1) fail(sc.id, `no visible enzyme boxes for ${pick.name}`)
        if (!fellBack && probe.colored < 1) fail(sc.id, `no flux-colored enzymes for ${pick.name}`)
        if (!fellBack && probe.realColor < 1) fail(sc.id, `flux enzymes not actually painted for ${pick.name}`)
      } else if (!fellBack) {
        fail(sc.id, `map neither rendered nor fell back (${pick.name})`)
      }
      const rows = await page.locator('.sector-panel .rxn-table tbody tr').count()
      if (rows < 1) fail(sc.id, `no panel rows for ${pick.name}`)
      await page.screenshot({ path: `${OUT}/${sc.id}__${slug(pick.name)}.png` })
      await page.getByRole('button', { name: '← Overview' }).click()
      await page.locator('g.sector').first().waitFor({ timeout: 6000 })
    }
  }

  console.log('\n--- uncaught page errors ---')
  console.log(errors.length ? errors.join('\n') : '(none)')
  failures += errors.length
  await browser.close()
  console.log(`\nVisual QA: ${failures ? `FAILED (${failures})` : 'PASSED'} — figures in ${OUT}/`)
  process.exit(failures ? 1 : 0)
}

run()
