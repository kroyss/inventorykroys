const { chromium } = require('playwright-core')
const path = require('path')

const EXEC = path.join(
  process.env.LOCALAPPDATA || (process.env.HOME + '/AppData/Local'),
  'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe'
)
const url = 'http://localhost:3000'

;(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()) })
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message))

  // ── Login ──
  await page.goto(url + '/login', { waitUntil: 'networkidle' })
  // Country selector + username + password
  // Inspect form
  const fields = await page.$$eval('input,select,button', els => els.map(e => ({ tag: e.tagName, type: e.type, name: e.name, ph: e.placeholder, txt: e.textContent?.trim().slice(0,15) })))

  // Fill: select VE, username admin, password admin123
  try { await page.selectOption('select', 'VE').catch(() => {}) } catch {}
  const textInputs = await page.$$('input[type="text"], input:not([type])')
  const pwInputs = await page.$$('input[type="password"]')
  if (textInputs[0]) await textInputs[0].fill('admin')
  if (pwInputs[0]) await pwInputs[0].fill('admin123')
  await page.click('button[type="submit"]').catch(() => page.click('button'))
  await page.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)
  console.log('After login URL:', page.url())

  // ── DASHBOARD ──
  console.log('\n▼ DASHBOARD')
  await page.goto(url + '/dashboard', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const canvasCount = await page.$$eval('canvas', els => els.length)
  const canvasSize = await page.$$eval('canvas', els => els.map(c => ({ w: c.width, h: c.height, clientH: c.clientHeight })))
  console.log('Canvas elements:', canvasCount, JSON.stringify(canvasSize))
  const dashText = await page.$eval('body', b => b.innerText.slice(0, 300)).catch(() => 'NO BODY')
  console.log('Dashboard text sample:', dashText.replace(/\n+/g, ' | ').slice(0, 200))

  // ── REPORTES ──
  console.log('\n▼ REPORTES')
  await page.goto(url + '/reportes', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const repText = await page.$eval('body', b => b.innerText.slice(0, 400)).catch(() => 'NO BODY')
  console.log('Reportes text sample:', repText.replace(/\n+/g, ' | ').slice(0, 300))
  // Click each tab and check for errors
  const tabButtons = await page.$$('button')
  for (const label of ['Inventario', 'Stock', 'En tránsito', 'Top productos']) {
    const btn = await page.$(`button:has-text("${label}")`)
    if (btn) {
      await btn.click()
      await page.waitForTimeout(1500)
      const txt = await page.$eval('body', b => b.innerText).catch(() => '')
      const hasContent = txt.length > 100
      console.log(`  Tab "${label}": ${hasContent ? 'rendered' : 'EMPTY'} (${txt.length} chars)`)
    } else {
      console.log(`  Tab "${label}": BUTTON NOT FOUND`)
    }
  }

  console.log('\n▼ ERRORS CAPTURED:', errors.length)
  for (const e of errors.slice(0, 20)) console.log('  ' + e)

  await browser.close()
})().catch(e => { console.error('CRASH:', e.message); process.exit(1) })
