const { chromium } = require('playwright-core')
const path = require('path')
const EXEC = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe')
const url = 'http://localhost:3000'

;(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, headless: true })
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
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

  console.log('--- DESKTOP: Compras Local ---')
  await page.goto(url + '/compras', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  let body = await page.innerText('body')
  console.log('KPI "Valor activo":', /Valor activo/.test(body) ? 'YES' : 'NO')
  console.log('KPI "Por recibir":', /Por recibir/.test(body) ? 'YES' : 'NO')
  // open new order → slide-over from right
  await page.click('button:has-text("+ Nueva")')
  await page.waitForTimeout(600)
  const slideRight = await page.$$eval('div', divs => divs.some(d => d.className.includes('right-0') && d.className.includes('max-w-2xl')))
  console.log('Local: create slide-over from right:', slideRight ? 'YES' : 'NO')
  console.log('Local: "Guardar y crear otra":', await page.$('button:has-text("Guardar y crear otra")') ? 'YES' : 'NO')
  await page.click('button:has-text("Cancelar")').catch(() => {})
  await page.waitForTimeout(400)

  console.log('--- DESKTOP: Importaciones ---')
  await page.click('button:has-text("Importaciones")')
  await page.waitForTimeout(1200)
  body = await page.innerText('body')
  console.log('Imports KPI "Por pagar":', /Por pagar/.test(body) ? 'YES' : 'NO')
  const newImp = await page.$('button:has-text("Nueva importación")')
  if (newImp) { await newImp.click(); await page.waitForTimeout(600) }
  const impSlide = await page.$$eval('div', divs => divs.some(d => d.className.includes('right-0') && d.className.includes('max-w-2xl')))
  console.log('Imports: create slide-over from right:', impSlide ? 'YES' : 'NO')
  console.log('Imports: "Guardar y crear otra":', await page.$('button:has-text("Guardar y crear otra")') ? 'YES' : 'NO')
  await page.click('button:has-text("Cancelar")').catch(() => {})
  await page.waitForTimeout(400)

  console.log('--- MOBILE (390px): Compras Local ---')
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(url + '/compras', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  // tap first order
  const firstOrder = await page.$('div[class*="cursor-pointer"]')
  if (firstOrder) { await firstOrder.click(); await page.waitForTimeout(800) }
  const back = await page.$('button:has-text("Volver a la lista")')
  console.log('Mobile: detail + back button:', back ? 'YES' : 'NO')
  if (back) { await back.click(); await page.waitForTimeout(400) }

  console.log('\nERRORS: ' + errors.length)
  for (const e of errors.slice(0, 10)) console.log('  ' + e)
  await browser.close()
})().catch(e => { console.error('CRASH:', e.message); process.exit(1) })
