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

  // login
  await page.goto(url + '/login', { waitUntil: 'networkidle' })
  await page.selectOption('select', 'VE').catch(() => {})
  const ti = await page.$$('input[type="text"], input:not([type])')
  const pw = await page.$$('input[type="password"]')
  if (ti[0]) await ti[0].fill('admin')
  if (pw[0]) await pw[0].fill('admin123')
  await page.click('button[type="submit"]').catch(() => page.click('button'))
  await page.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)

  // VENTAS pipeline
  await page.goto(url + '/ventas', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  const pipeBtn = await page.$('button:has-text("Pipeline")')
  if (pipeBtn) { await pipeBtn.click(); await page.waitForTimeout(1000) }
  console.log('Ventas: Pipeline button exists:', pipeBtn ? 'YES' : 'NO')
  console.log('Ventas: pipeline columns render:', /Pago verificado/.test(await page.innerText('body')) ? 'YES' : 'NO')

  // COMPRAS stepper
  await page.goto(url + '/compras', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  const firstRow = await page.$('tbody tr')
  if (firstRow) { await firstRow.click(); await page.waitForTimeout(1000) }
  const body = await page.innerText('body')
  console.log('Compras: stepper visible (Pendiente..Finalizada):', /Pendiente/.test(body) && /Finalizada/.test(body) ? 'YES' : 'NO')

  // REPORTES presets
  await page.goto(url + '/reportes', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  const presets = await page.$$eval('button', bs => bs.map(b => b.textContent.trim()).filter(t => ['Hoy', 'Semana', 'Mes', '30 días', '90 días', 'Personalizado'].includes(t)))
  console.log('Reportes presets:', [...new Set(presets)].join(', '))

  // COMMAND PALETTE
  await page.goto(url + '/dashboard', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  await page.keyboard.press('Control+k'); await page.waitForTimeout(600)
  const palette = await page.$('input[placeholder*="Buscar acción"]')
  console.log('Command palette (Ctrl+K):', palette ? 'OPENS' : 'NO')
  if (palette) await page.keyboard.press('Escape')

  // MOBILE bottom nav
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(url + '/dashboard', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  const bottomNav = await page.$$eval('nav', navs => navs.some(n => n.className.includes('fixed') && n.className.includes('bottom-0')))
  console.log('Mobile bottom nav:', bottomNav ? 'PRESENT' : 'NO')

  // INVENTARIO sort + PRODUCTOS margin
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(url + '/inventario', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  const sortSel = await page.$('select')
  console.log('Inventario sort selector:', sortSel ? 'PRESENT' : 'NO')
  await page.goto(url + '/productos', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
  console.log('Productos Margen column:', /Margen/.test(await page.innerText('body')) ? 'PRESENT' : 'NO')

  console.log('\nTOTAL ERRORS: ' + errors.length)
  for (const e of errors.slice(0, 15)) console.log('  ' + e)
  await browser.close()
})().catch(e => { console.error('CRASH:', e.message); process.exit(1) })
