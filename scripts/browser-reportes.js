const { chromium } = require('playwright-core')
const path = require('path')
const EXEC = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe')
const url = 'http://localhost:3000'

;(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, headless: true })
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true })).newPage()
  const errors = []
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 120)) })

  await page.goto(url + '/login', { waitUntil: 'networkidle' })
  await page.selectOption('select', 'VE').catch(() => {})
  const ti = await page.$$('input[type="text"], input:not([type])')
  const pw = await page.$$('input[type="password"]')
  if (ti[0]) await ti[0].fill('admin')
  if (pw[0]) await pw[0].fill('admin123')
  await page.click('button[type="submit"]').catch(() => page.click('button'))
  await page.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)

  await page.goto(url + '/reportes', { waitUntil: 'networkidle' }); await page.waitForTimeout(2000)
  const body = await page.innerText('body')
  console.log('Tab groups (Por período / Estado actual):', /Por per[ií]odo/.test(body) && /Estado actual/.test(body) ? 'YES' : 'NO')
  console.log('Ventas: export button:', await page.$('button:has-text("Exportar Excel")') ? 'YES' : 'NO')
  console.log('Ventas: status filter:', await page.$('select') ? 'YES' : 'NO')
  console.log('Ventas: search bar:', await page.$('input[placeholder*="Buscar orden"]') ? 'YES' : 'NO')

  // sort a column (click "Total")
  const totalHeader = await page.$('th:has-text("Total")')
  if (totalHeader) { await totalHeader.click(); await page.waitForTimeout(400) }
  console.log('Ventas: clickable sort header:', totalHeader ? 'YES' : 'NO')
  // totals footer
  console.log('Ventas: totals footer row (tfoot):', await page.$('tfoot') ? 'YES' : 'NO')

  // Test export download
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    page.click('button:has-text("Exportar Excel")').catch(() => {}),
  ])
  console.log('Ventas: Excel download:', dl ? ('YES (' + dl.suggestedFilename() + ')') : 'no')

  // Top productos: category filter
  await page.click('button:has-text("Top productos")'); await page.waitForTimeout(1500)
  const catSel = await page.$$eval('select', sels => sels.some(s => Array.from(s.options).some(o => o.textContent === 'Todas')))
  console.log('Top: category filter present:', catSel ? 'YES' : 'NO')
  const topBody = await page.innerText('body')
  console.log('Top: KPI "Ganancia total":', /Ganancia total/.test(topBody) ? 'YES' : 'NO')

  // Tránsito: tipo filter + export
  await page.click('button:has-text("En tránsito")'); await page.waitForTimeout(1500)
  const transBody = await page.innerText('body')
  console.log('Tránsito: tipo filter (Local + Importación):', /Local \+ Importaci/.test(transBody) ? 'YES' : 'NO')
  console.log('Tránsito: export button:', await page.$('button:has-text("Exportar Excel")') ? 'YES' : 'NO')

  console.log('\nERRORS: ' + errors.length)
  for (const e of errors.slice(0, 10)) console.log('  ' + e)
  await browser.close()
})().catch(e => { console.error('CRASH:', e.message); process.exit(1) })
