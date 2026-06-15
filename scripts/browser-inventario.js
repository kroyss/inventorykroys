const { chromium } = require('playwright-core')
const path = require('path')
const EXEC = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe')
const url = 'http://localhost:3000'

;(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
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

  // DESKTOP
  await page.goto(url + '/inventario', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  const body = await page.innerText('body')
  console.log('--- DESKTOP ---')
  console.log('KPI "Valor inventario":', /Valor inventario/.test(body) ? 'YES' : 'NO')
  console.log('KPI "SKUs activos":', /SKUs activos/.test(body) ? 'YES' : 'NO')
  console.log('Export button:', await page.$('a:has-text("Exportar Excel")') ? 'YES' : 'NO')
  // select a product, check "Valor stock" in detail
  const firstItem = await page.$('div.flex-1.overflow-y-auto button')
  if (firstItem) { await firstItem.click(); await page.waitForTimeout(800) }
  const detailBody = await page.innerText('body')
  console.log('Detail "Valor stock":', /Valor stock/.test(detailBody) ? 'YES' : 'NO')

  // Export download check
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    page.click('a:has-text("Exportar Excel")').catch(() => {}),
  ])
  console.log('Excel download:', dl ? ('YES (' + dl.suggestedFilename() + ')') : 'no triggered')

  // MOBILE
  console.log('--- MOBILE (390px) ---')
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(url + '/inventario', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  // On mobile with nothing selected → list visible, detail hidden
  const listVisible = await page.$('input[placeholder="Buscar…"]')
  console.log('Mobile: list/search visible:', listVisible ? 'YES' : 'NO')
  // tap a product
  const mItem = await page.$('div.flex-1.overflow-y-auto button')
  if (mItem) { await mItem.click(); await page.waitForTimeout(800) }
  const backBtn = await page.$('button:has-text("Volver a la lista")')
  console.log('Mobile: detail shows with back button:', backBtn ? 'YES' : 'NO')
  if (backBtn) { await backBtn.click(); await page.waitForTimeout(500) }
  const backToList = await page.$('input[placeholder="Buscar…"]')
  console.log('Mobile: back returns to list:', backToList ? 'YES' : 'NO')

  console.log('\nERRORS: ' + errors.length)
  for (const e of errors.slice(0, 10)) console.log('  ' + e)
  await browser.close()
})().catch(e => { console.error('CRASH:', e.message); process.exit(1) })
