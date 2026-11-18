// Capturas del manual de Aprendizaje (14-11-2026). Entra a STAGING con la empresa de ejemplo «Tienda Ejemplo»
// (datos inventados, scripts/manual/seed-tienda-ejemplo.sql) y guarda public/manual/inventario/<capítulo>.png.
// 18-11: con «automatizaciones» entra a la empresa DEMO de staging (ML simulado, datos inventados; el usuario de capturas
// tiene acceso ahí) y guarda public/manual/automatizaciones/<capítulo>.png.
// Uso: ssh -N -L 8511:127.0.0.1:8511 root@VPS  (en otra terminal)   y   node scripts/manual/capturas.js <archivo-clave> [automatizaciones]
// La clave del usuario manual.capturas vive solo en ese archivo (nunca en el repo).
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const EXEC = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe')
const URL = process.env.CAPTURAS_URL || 'http://localhost:8511'
const MANUAL = process.argv[3] === 'automatizaciones' ? 'automatizaciones' : 'inventario'
const SALIDA = path.join(__dirname, '..', '..', 'public', 'manual', MANUAL)
const EMPRESA_DEMO = Number(process.env.CAPTURAS_EMPRESA || 10)
// Mismo listado que CAPTURAS_AUTOMATIZACIONES de lib/manual.ts
const PANTALLAS_AUTO = [
  { id: 'cuentas', ruta: '/cuentas-ml' }, { id: 'preguntas', ruta: '/preguntas' }, { id: 'mensajes', ruta: '/mensajes' },
  { id: 'calificaciones', ruta: '/calificaciones' }, { id: 'stock', ruta: '/alertas-stock' }, { id: 'pagosme', ruta: '/pagos-me' },
  { id: 'despachos', ruta: '/despachos' }, { id: 'reportador', ruta: '/reportador' },
]
// Mismo listado que CAPTURAS_INVENTARIO de lib/manual.ts
const PANTALLAS_INV = [
  { id: 'inicio', ruta: '/dashboard' }, { id: 'productos', ruta: '/productos' }, { id: 'ventas', ruta: '/ventas' },
  { id: 'inventario', ruta: '/inventario' }, { id: 'compras', ruta: '/compras' }, { id: 'reportes', ruta: '/reportes' },
]
const PANTALLAS = MANUAL === 'automatizaciones' ? PANTALLAS_AUTO : PANTALLAS_INV

;(async () => {
  const clave = fs.readFileSync(process.argv[2], 'utf8').trim()
  fs.mkdirSync(SALIDA, { recursive: true })
  const browser = await chromium.launch({ executablePath: EXEC, headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1, locale: 'es-VE' })
  // Sin la ventana del video de bienvenida (es de Automatizaciones, no de esta pantalla)
  await ctx.addInitScript(() => { try { sessionStorage.setItem('bienvenida_pospuesta', '1') } catch {} })
  // Sin las marcas «Nuevo» (se van solas en unas semanas; en la captura quedarían para siempre)
  await ctx.addInitScript(() => { try { ['actualizar', 'manual_automatizaciones', 'mis_publicaciones', 'preparar', 'reponer', 'mi_ia', 'seguimiento']
    .forEach(c => localStorage.setItem('nuevo:' + c, '1')) } catch {} })
  const page = await ctx.newPage()
  await page.goto(URL + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[name="username"], input[type="text"]', 'manual.capturas')
  await page.fill('input[type="password"]', clave)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(4000)
  if (MANUAL === 'automatizaciones') {
    // Cambia a la empresa DEMO como el selector del menú (NextAuth update → POST /api/auth/session).
    const ok = await page.evaluate(async id => {
      const { csrfToken } = await (await fetch('/api/auth/csrf')).json()
      const r = await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrfToken, data: { empresaId: id } }) })
      const s = await r.json()
      return s?.user?.empresaId === id ? s.user.empresaNombre : null
    }, EMPRESA_DEMO)
    if (!ok) { console.log('no se pudo entrar a la empresa', EMPRESA_DEMO); process.exit(1) }
    console.log('empresa', ok)
    // 18-11: siembra Stock y Pagos ME (el «Restaurar» de /demo) para que sus capturas no salgan vacías.
    const sembrado = await page.evaluate(async () => {
      const r = await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secciones: ['stock', 'pagos'] }) })
      return r.status
    })
    console.log('demo sembrada (stock, pagos):', sembrado)
  }
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
    // 18-11: lo que delata la copia de pruebas: el link con localhost, el aviso de «copia de pruebas» y la otra empresa
    // del usuario de capturas en el selector.
    await page.evaluate(() => {
      document.querySelectorAll('input').forEach(i => { if (i.value.includes('localhost')) i.value = i.value.replace(/https?:\/\/localhost:\d+/, 'https://app.elcomerciantedigital.com') })
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.includes('localhost')) n.nodeValue = n.nodeValue.replace(/https?:\/\/localhost:\d+/g, 'https://app.elcomerciantedigital.com')
      document.querySelectorAll('p, div').forEach(d => { if (d.children.length === 0 && /copia de pruebas/i.test(d.textContent || '')) d.style.display = 'none' })
      document.querySelectorAll('nav button, nav a').forEach(b => { if ((b.textContent || '').trim() === 'TI') b.style.display = 'none' })
    })
    await page.screenshot({ path: path.join(SALIDA, p.id + '.png') })
    console.log('ok', p.id, page.url().replace(URL, ''))
  }
  await browser.close()
})().catch(e => { console.error(e.message); process.exit(1) })
