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
  const sectors = await page.$$eval('g.sector', (els) =>
    els.map((e) => ({ name: e.getAttribute('data-name') || '', mean: Number(e.getAttribute('data-mean')) })),
  )
  console.log(`overview pathways lit: ${sectors.length}`)
  if (sectors.length < 10) fail(`expected >=10 pathways, got ${sectors.length}`)

  const gly = sectors.find((s) => s.name === 'glycolysis')
  console.log(`  glycolysis mean log2FC = ${gly ? gly.mean : 'n/a'}`)
  if (!gly) fail('glycolysis pathway missing from overview')
  else if (!(gly.mean > 0)) fail(`glycolysis should be up, got ${gly.mean}`)

  // 3. drill into glycolysis -> BRENDA SVG map
  const idx = sectors.findIndex((s) => s.name === 'glycolysis')
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

  // 4.5 EC links: BRENDA's relative `../enzyme.php` links must be rewritten to
  // absolute URLs opening a new tab — clicking one must NOT reset the SPA.
  const links = await page.$$eval('.brenda-svg svg a', (as) =>
    as.map((a) => ({ href: a.getAttribute('href') || '', target: a.getAttribute('target') || '' })),
  )
  const ecLinks = links.filter((l) => /brenda-enzymes\.org\/enzyme\.php\?ecno=/.test(l.href))
  const relative = links.filter((l) => l.href.startsWith('../'))
  console.log(`  links: ${links.length} total, ${ecLinks.length} absolute BRENDA enzyme links, ${relative.length} still-relative`)
  if (ecLinks.length < 1) fail('no absolute BRENDA enzyme.php links on the map')
  if (relative.length) fail(`${relative.length} link(s) still relative (would reset the SPA)`)
  if (ecLinks.some((l) => l.target !== '_blank')) fail('an EC link is missing target=_blank')

  // actually click an enzyme EC link → it should open a BRENDA popup, SPA stays put.
  // force:true because the enzyme <rect> sits over its parent <a> (Playwright calls
  // the anchor "obscured"); the rect is INSIDE the anchor, so a real click navigates.
  const urlBefore = page.url()
  const popupP = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null)
  await page.locator('.brenda-svg svg a[href*="enzyme.php"]').first().click({ timeout: 5000, force: true }).catch((e) => fail(`EC click failed: ${e.message}`))
  const popup = await popupP
  if (popup) {
    console.log(`  EC click opened popup: ${popup.url().slice(0, 64)}…`)
    if (!/brenda-enzymes\.org/.test(popup.url())) fail(`EC popup url unexpected: ${popup.url()}`)
    await popup.close()
  } else {
    fail('EC click opened no BRENDA tab (popup not detected)')
  }
  await page.waitForTimeout(300)
  const stillOnMap = (await page.locator('.brenda-svg svg').count()) > 0
  if (page.url() !== urlBefore) fail(`SPA navigated away on EC click (${page.url()})`)
  if (!stillOnMap) fail('EC click reset the SPA — detail map gone')
  console.log(`  after EC click: stayed-on-map=${stillOnMap}, url-unchanged=${page.url() === urlBefore}`)

  // 5. browser/mouse Back & Forward must navigate overview ⇄ detail (History API)
  if (!/#glycolysis$/.test(page.url())) fail(`detail URL should carry #glycolysis, got ${page.url()}`)

  // 5a. browser Back → overview (hash cleared, detail map gone)
  await page.goBack()
  await page.locator('main.overview-layout g.sector').first().waitFor({ timeout: 6000 }).catch(() => fail('Back did not return to overview'))
  const onOverviewAfterBack = (await page.locator('main.overview-layout').count()) > 0 && (await page.locator('.brenda-svg svg').count()) === 0
  if (!onOverviewAfterBack) fail('browser Back did not show the overview')
  if (/#/.test(page.url())) fail(`Back should clear the hash, got ${page.url()}`)
  console.log(`  browser Back → overview ok (url=${page.url()})`)

  // 5b. browser Forward → detail glycolysis again
  await page.goForward()
  await page.locator('.brenda-svg svg').first().waitFor({ timeout: 15000 }).catch(() => fail('Forward did not restore the detail map'))
  if (!/#glycolysis$/.test(page.url())) fail(`Forward should restore #glycolysis, got ${page.url()}`)
  const detailHeader = await page.locator('main.detail h2').first().textContent().catch(() => '')
  console.log(`  browser Forward → detail ok (${detailHeader?.trim()}, url=${page.url()})`)
  if (detailHeader?.trim() !== 'glycolysis') fail(`Forward restored wrong pathway: ${detailHeader}`)

  // 5c. in-app "← Overview" button mirrors Back
  await page.getByRole('button', { name: '← Overview' }).click()
  await page.locator('main.overview-layout g.sector').first().waitFor({ timeout: 6000 })
  if (/#/.test(page.url())) fail(`← Overview button should clear the hash, got ${page.url()}`)
  console.log('  ← Overview button → overview ok')

  // 6. switching dataset while on a pathway resets to overview + clears stale hash
  const names6 = await page.$$eval('g.sector', (els) => els.map((e) => e.getAttribute('data-name') || ''))
  await page.locator('g.sector').nth(Math.max(0, names6.indexOf('glycolysis'))).click()
  await page.locator('.brenda-svg svg').first().waitFor({ timeout: 15000 })
  if (!/#glycolysis$/.test(page.url())) fail(`expected #glycolysis before sample switch, got ${page.url()}`)
  await page.locator('.sample-selector select').first().selectOption('core_glucose_acetate')
  await page.locator('main.overview-layout g.sector').first().waitFor({ timeout: 15000 }).catch(() => fail('sample switch did not return to overview'))
  if ((await page.locator('.brenda-svg svg').count()) !== 0) fail('sample switch left the detail map mounted')
  if (/#/.test(page.url())) fail(`sample switch should clear the hash, got ${page.url()}`)
  console.log(`  sample switch while on detail → overview, hash cleared (url=${page.url()})`)

  // 7. a stale/unknown #pathway reached via Back must fall back to the overview
  //    (not "pathway not found") and drop the dead hash
  await page.evaluate(() => {
    history.pushState({ pathway: '__nope__' }, '', '#__nope__')
    history.pushState(null, '', location.pathname + location.search)
  })
  await page.goBack() // traverses onto the stale #__nope__ entry → fires popstate
  await page.locator('main.overview-layout g.sector').first().waitFor({ timeout: 6000 }).catch(() => fail('stale hash did not fall back to overview'))
  if ((await page.locator('.brenda-svg svg').count()) !== 0) fail('stale hash left a detail map mounted')
  if (/#/.test(page.url())) fail(`stale hash should be cleared on fallback, got ${page.url()}`)
  console.log(`  stale/unknown #hash → overview fallback, hash cleared (url=${page.url()})`)

  // 8. a pathway name with spaces/special chars must round-trip through the hash + Back/Forward
  const names8 = await page.$$eval('g.sector', (els) => els.map((e) => e.getAttribute('data-name') || ''))
  const spacey = names8.find((n) => /[\s/]/.test(n))
  if (!spacey) {
    console.log('  (no multi-word pathway available to test special-char hash)')
  } else {
    await page.locator('g.sector').nth(names8.indexOf(spacey)).click()
    await page.locator('.brenda-svg svg').first().waitFor({ timeout: 15000 })
    const expected = '#' + encodeURIComponent(spacey)
    if (!page.url().endsWith(expected)) fail(`special-char hash mismatch: want …${expected}, got ${page.url()}`)
    await page.goBack()
    await page.locator('main.overview-layout g.sector').first().waitFor({ timeout: 6000 })
    await page.goForward()
    await page.locator('.brenda-svg svg').first().waitFor({ timeout: 15000 })
    const hdr = (await page.locator('main.detail h2').first().textContent())?.trim()
    if (hdr !== spacey) fail(`special-char Forward restored "${hdr}", expected "${spacey}"`)
    console.log(`  special-char pathway "${spacey}" round-trips through hash + Back/Forward ok`)
  }
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
