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

  await page.goto(url + '/ventas', { waitUntil: 'networkidle' }); await page.waitForTimeout(1200)

  // Open new sale → should be a slide-over on the right
  await page.click('button:has-text("Nueva venta")')
  await page.waitForTimeout(700)
  const panel = await page.$('h2:has-text("Nueva venta")')
  console.log('Slide-over opened:', panel ? 'YES' : 'NO')

  // Check it's anchored right (the panel div has right-0)
  const isRight = await page.$$eval('div', divs => divs.some(d => d.className.includes('right-0') && d.className.includes('max-w-xl')))
  console.log('Panel anchored right:', isRight ? 'YES' : 'NO')

  // Check "Guardar y crear otra" button present
  const crearOtra = await page.$('button:has-text("Guardar y crear otra")')
  console.log('"Guardar y crear otra" button:', crearOtra ? 'PRESENT' : 'NO')

  // Fill a quick LOCAL sale and use "crear otra"
  await page.click('text=Venta LOCAL').catch(() => {})
  await page.waitForTimeout(800) // local number autogen
  // add a product
  await page.fill('input[placeholder*="Buscar por código"]', 'COD')
  await page.waitForTimeout(600)
  const firstProd = await page.$('div.cursor-pointer')
  if (firstProd) { await firstProd.click(); await page.waitForTimeout(400) }
  const itemRows = await page.$$('table tbody tr')
  console.log('Item added to form:', itemRows.length > 0 ? 'YES' : 'NO')

  if (crearOtra && itemRows.length > 0) {
    await page.click('button:has-text("Guardar y crear otra")')
    await page.waitForTimeout(1500)
    const stillOpen = await page.$('h2:has-text("Nueva venta")')
    const okMsg = await page.$('text=Listo para la siguiente')
    console.log('After "crear otra" — panel stays open:', stillOpen ? 'YES' : 'NO')
    console.log('After "crear otra" — confirmation msg:', okMsg ? 'YES' : 'NO')
    // close
    await page.click('button:has-text("Cancelar")')
  }

  console.log('\nERRORS: ' + errors.length)
  for (const e of errors.slice(0, 10)) console.log('  ' + e)
  await browser.close()
})().catch(e => { console.error('CRASH:', e.message); process.exit(1) })
