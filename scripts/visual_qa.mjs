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
    const sectors = await page.$$eval('g.sector', (els) =>
      els.map((e) => ({ name: e.getAttribute('data-name') || '', score: Number(e.getAttribute('data-mean')) })),
    )
    console.log(`  pathways lit: ${sectors.length}`)
    if (sectors.length < sc.minSectors) fail(sc.id, `expected >=${sc.minSectors} pathways, got ${sectors.length}`)
    if (sc.named) {
      const s = sectors.find((x) => x.name === sc.named.name)
      console.log(`  ${sc.named.name} score=${s ? s.score : 'n/a'} (want sign ${sc.named.sign})`)
      if (s && Math.sign(s.score) !== sc.named.sign) fail(sc.id, `${sc.named.name} sign ${Math.sign(s.score)} != ${sc.named.sign}`)
    }
    await page.screenshot({ path: `${OUT}/${sc.id}__overview.png` })

    // small/unlabeled tiles must reveal their pathway name on hover (request #3)
    if (sc.id === SCENARIOS[0].id) {
      const box = await page.evaluate(() => {
        const tiles = [...document.querySelectorAll('g.sector')]
        const t = tiles.find((x) => !x.querySelector('.sector-label')) || tiles[tiles.length - 1]
        if (!t) return null
        const r = t.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, name: t.getAttribute('data-name') }
      })
      if (box) {
        await page.mouse.move(box.x, box.y)
        await page.waitForTimeout(200)
        const tipName = await page.locator('.brenda-tip .tip-name').first().textContent().catch(() => null)
        console.log(`  hover unlabeled tile → tooltip="${tipName}" (tile data-name="${box.name}")`)
        if (!tipName) fail(sc.id, 'overview hover tooltip did not appear on an unlabeled tile')
        await page.screenshot({ path: `${OUT}/${sc.id}__overview_hover.png` })
        await page.mouse.move(5, 5)
      }
    }

    const ranked = sectors
      .map((s, i) => ({ i, name: s.name, score: s.score }))
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
