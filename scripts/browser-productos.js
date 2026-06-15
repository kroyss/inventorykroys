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

  console.log('--- DESKTOP ---')
  await page.goto(url + '/productos', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  const body = await page.innerText('body')
  console.log('KPI "Valor catálogo":', /Valor cat[aá]logo/.test(body) ? 'YES' : 'NO')
  console.log('KPI "Sin categoría":', /Sin categor[ií]a/.test(body) ? 'YES' : 'NO')
  // open create → slide-over
  await page.click('button:has-text("+ Nuevo")')
  await page.waitForTimeout(700)
  const slide = await page.$$eval('div', divs => divs.some(d => d.className.includes('right-0') && d.className.includes('max-w-xl')))
  console.log('Create slide-over from right:', slide ? 'YES' : 'NO')
  console.log('"Guardar y crear otro":', await page.$('button:has-text("Guardar y crear otro")') ? 'YES' : 'NO')
  // verify calculator visible
  const calcBody = await page.innerText('body')
  console.log('Calculator (Precio final):', /Precio final/.test(calcBody) ? 'YES' : 'NO')
  console.log('Code auto-filled:', await page.$eval('input[readonly], input.font-mono', el => el.value).catch(() => '') ? 'YES' : 'maybe')
  await page.click('button:has-text("Cancelar")').catch(() => {})
  await page.waitForTimeout(400)

  console.log('--- MOBILE (390px) ---')
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(url + '/productos', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  // table should be hidden, cards shown
  const tableVisible = await page.$eval('table', el => {
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el.closest('div')).display !== 'none'
  }).catch(() => false)
  // detect card markers: "Precio:" and "Stock:" labels
  const mobBody = await page.innerText('body')
  console.log('Mobile cards (Precio:/Stock:):', /Precio:/.test(mobBody) && /Stock:/.test(mobBody) ? 'YES' : 'NO')

  console.log('\nERRORS: ' + errors.length)
  for (const e of errors.slice(0, 10)) console.log('  ' + e)
  await browser.close()
})().catch(e => { console.error('CRASH:', e.message); process.exit(1) })
