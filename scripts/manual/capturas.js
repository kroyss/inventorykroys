// Capturas del manual de Aprendizaje (14-11-2026). Entra a STAGING con la empresa de ejemplo «Tienda Ejemplo»
// (datos inventados, scripts/manual/seed-tienda-ejemplo.sql) y guarda public/manual/inventario/<capítulo>.png.
// Uso: ssh -N -L 8511:127.0.0.1:8511 root@VPS  (en otra terminal)   y   node scripts/manual/capturas.js <archivo-clave>
// La clave del usuario manual.capturas vive solo en ese archivo (nunca en el repo).
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const EXEC = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe')
const URL = process.env.CAPTURAS_URL || 'http://localhost:8511'
const SALIDA = path.join(__dirname, '..', '..', 'public', 'manual', 'inventario')
// Mismo listado que CAPTURAS_INVENTARIO de lib/manual.ts
const PANTALLAS = [
  { id: 'inicio', ruta: '/dashboard' }, { id: 'productos', ruta: '/productos' }, { id: 'ventas', ruta: '/ventas' },
  { id: 'inventario', ruta: '/inventario' }, { id: 'compras', ruta: '/compras' }, { id: 'reportes', ruta: '/reportes' },
]

;(async () => {
  const clave = fs.readFileSync(process.argv[2], 'utf8').trim()
  fs.mkdirSync(SALIDA, { recursive: true })
  const browser = await chromium.launch({ executablePath: EXEC, headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1, locale: 'es-VE' })
  // Sin la ventana del video de bienvenida (es de Automatizaciones, no de esta pantalla)
  await ctx.addInitScript(() => { try { sessionStorage.setItem('bienvenida_pospuesta', '1') } catch {} })
  const page = await ctx.newPage()
  await page.goto(URL + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[name="username"], input[type="text"]', 'manual.capturas')
  await page.fill('input[type="password"]', clave)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(4000)
  for (const p of PANTALLAS) {
    await page.goto(URL + p.ruta, { waitUntil: 'networkidle' }).catch(() => {})
    await page.waitForTimeout(3500)
    if (/\/login/.test(page.url())) { console.log('sin sesión en', p.ruta); process.exitCode = 1; break }
    // Fuera lo flotante (Ayuda, avisos) para que la captura muestre solo la pantalla
    await page.addStyleTag({ content: '[data-flotante],[aria-label="Ayuda"],.fixed.bottom-4,.fixed.bottom-5{display:none!important}' })
    // Barras que no son de la pantalla: «copia de pruebas» de staging y avisos de créditos / conexión
    await page.evaluate(() => document.querySelectorAll('div.text-center.border-b, div.bg-amber-400.text-center').forEach(d => {
      if (/COPIA DE PRUEBAS|créditos|Reconectar|conect/i.test(d.textContent || '')) d.style.display = 'none'
    }))
    await page.screenshot({ path: path.join(SALIDA, p.id + '.png') })
    console.log('ok', p.id, page.url().replace(URL, ''))
  }
  await browser.close()
})().catch(e => { console.error(e.message); process.exit(1) })
