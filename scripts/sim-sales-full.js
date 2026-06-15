// Barrido COMPLETO de Ventas: verifica el inventario en CADA avance y retroceso.
//   ML normal  → descuenta en PROCESADA; revierte al reabrir desde PROCESADA/DESCARGADA.
//   LOCAL      → descuenta al verificar (DESCARGADA_LOCAL); revierte al reabrir.
//   Stock insuficiente → no permite procesar.
//   Usuario normal (wilmer) → mismo flujo con su rol.
// Requiere dev server :3000 y wilmer con password 'test1234' (temporal).
const url = 'http://localhost:3000'
let COOKIES = {}
const passed = [], failed = []
function pc(res) { for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (k && v !== undefined) COOKIES[k.trim()] = v.trim() } }
const ck = () => Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join('; ')
async function api(p, init = {}) { const r = await fetch(url + p, { ...init, headers: { Cookie: ck(), 'Content-Type': 'application/json', ...(init.headers || {}) } }); const t = await r.text(); let d; try { d = t ? JSON.parse(t) : null } catch { d = t } return { status: r.status, data: d } }
async function login(u, pw) { COOKIES = {}; let r = await fetch(url + '/api/auth/csrf'); pc(r); const { csrfToken } = await r.json(); r = await fetch(url + '/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck() }, body: new URLSearchParams({ csrfToken, username: u, password: pw, country: 'VE', json: 'true', callbackUrl: '/dashboard' }).toString(), redirect: 'manual' }); pc(r); return (await api('/api/auth/session')).data?.user }
function assert(label, cond, detail = '') { if (cond) { console.log(`  ✓ ${label}`); passed.push(label) } else { console.log(`  ❌ ${label} ${detail}`); failed.push(label) } }

const stockOf = async pid => { const r = await api('/api/inventory'); const it = r.data.find(i => i.product_id === pid); return it ? it.quantity : null }
const statusOf = async id => (await api(`/api/sales/${id}`)).data?.status
const setStatus = (id, status) => api(`/api/sales/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) })
const del = id => api(`/api/sales/${id}`, { method: 'DELETE' })
const exportXlsx = id => api(`/api/sales/export-excel?ids=${id}`)

const created = []
let PID, Q = 3, boost = 0

async function newSale(num, qty = Q) {
  const res = await api('/api/sales', { method: 'POST', body: JSON.stringify({ ml_order_number: num, customer_name: 'SIM Test', discount_percent: 0, items: [{ product_id: PID, quantity: qty, unit_price: 10 }] }) })
  if (res.data?.id) created.push(res.data.id)
  return res
}
const rnd = () => Math.random().toString(36).slice(2, 8).toUpperCase()

;(async () => {
  await login('admin', 'admin123')
  // Producto con más stock
  const inv = (await api('/api/inventory')).data
  const top = inv.filter(i => i.status !== 'INACTIVO').sort((a, b) => b.quantity - a.quantity)[0]
  PID = top.product_id
  let s0 = await stockOf(PID)
  if (s0 < 15) { boost = 30; await api(`/api/inventory/${PID}/adjust`, { method: 'POST', body: JSON.stringify({ movement_type: 'IN', quantity: boost, notes: 'sim boost' }) }); s0 = await stockOf(PID) }
  console.log(`✓ admin · Producto id=${PID} · stock base ${s0}\n`)

  // ── VENTA ML NORMAL ──
  console.log('▼ VENTA ML NORMAL — inventario en cada avance/retroceso')
  {
    let s = await stockOf(PID)
    const { data } = await newSale(`SIMML-${rnd()}`); const id = data.id
    assert('crear BORRADOR | inv intacto', await statusOf(id) === 'BORRADOR' && await stockOf(PID) === s)

    await setStatus(id, 'PAGO_VERIFICADO')
    assert('verificar → PAGO_VERIFICADO | inv intacto (no descuenta aún)', await statusOf(id) === 'PAGO_VERIFICADO' && await stockOf(PID) === s)

    await setStatus(id, 'REABIERTA')
    assert('reabrir antes de procesar → BORRADOR | inv intacto', await statusOf(id) === 'BORRADOR' && await stockOf(PID) === s)

    await setStatus(id, 'PAGO_VERIFICADO'); await setStatus(id, 'PROCESADA')
    assert(`procesar → PROCESADA | inv -${Q}`, await statusOf(id) === 'PROCESADA' && await stockOf(PID) === s - Q)

    await setStatus(id, 'REABIERTA')
    assert('reabrir desde PROCESADA → BORRADOR | inv revertido', await statusOf(id) === 'BORRADOR' && await stockOf(PID) === s)

    await setStatus(id, 'PAGO_VERIFICADO'); await setStatus(id, 'PROCESADA')
    const ex = await exportXlsx(id)
    assert(`exportar Excel → DESCARGADA (200) | inv sigue -${Q}`, ex.status === 200 && await statusOf(id) === 'DESCARGADA' && await stockOf(PID) === s - Q)

    await setStatus(id, 'REABIERTA')
    assert('reabrir desde DESCARGADA → BORRADOR | inv revertido', await statusOf(id) === 'BORRADOR' && await stockOf(PID) === s)

    const d = await del(id)
    assert('eliminar (BORRADOR) | inv intacto', d.status === 200 && await stockOf(PID) === s)
  }

  // ── VENTA LOCAL ──
  console.log('\n▼ VENTA LOCAL — descuenta al verificar, revierte al reabrir')
  {
    let s = await stockOf(PID)
    const num = (await api('/api/sales/next-local-number')).data.next_local
    const { data } = await newSale(num); const id = data.id
    assert('crear LOCAL BORRADOR | inv intacto', await statusOf(id) === 'BORRADOR' && await stockOf(PID) === s)

    await setStatus(id, 'PAGO_VERIFICADO')
    assert(`verificar LOCAL → DESCARGADA_LOCAL | inv -${Q} inmediato`, await statusOf(id) === 'DESCARGADA_LOCAL' && await stockOf(PID) === s - Q)

    await setStatus(id, 'REABIERTA')
    assert('reabrir LOCAL → BORRADOR | inv revertido', await statusOf(id) === 'BORRADOR' && await stockOf(PID) === s)

    await setStatus(id, 'PAGO_VERIFICADO')
    assert(`re-verificar LOCAL → DESCARGADA_LOCAL | inv -${Q} de nuevo`, await statusOf(id) === 'DESCARGADA_LOCAL' && await stockOf(PID) === s - Q)

    await setStatus(id, 'REABIERTA')
    assert('reabrir LOCAL otra vez | inv revertido exacto', await statusOf(id) === 'BORRADOR' && await stockOf(PID) === s)

    await del(id)
    assert('eliminar LOCAL | inv intacto', await stockOf(PID) === s)
  }

  // ── STOCK INSUFICIENTE ──
  console.log('\n▼ STOCK INSUFICIENTE — no permite procesar ni descontar')
  {
    let s = await stockOf(PID)
    const { data } = await newSale(`SIMNO-${rnd()}`, s + 1000); const id = data.id
    await setStatus(id, 'PAGO_VERIFICADO')
    const r = await setStatus(id, 'PROCESADA')
    assert('procesar sin stock → 400', r.status === 400, `status ${r.status}`)
    assert('estado sigue PAGO_VERIFICADO | inv intacto', await statusOf(id) === 'PAGO_VERIFICADO' && await stockOf(PID) === s)
    await setStatus(id, 'REABIERTA'); await del(id)
    assert('limpiar venta sin stock | inv intacto', await stockOf(PID) === s)
  }

  // ── USUARIO NORMAL (wilmer) ──
  console.log('\n▼ USUARIO NORMAL (wilmer) — flujo de venta con descuento/reversión')
  {
    const w = await login('wilmer', 'test1234')
    assert('login wilmer (user)', w?.role === 'user')
    let s = await stockOf(PID)
    const { data } = await newSale(`SIMW-${rnd()}`); const id = data.id
    assert('wilmer crea BORRADOR | inv intacto', await statusOf(id) === 'BORRADOR' && await stockOf(PID) === s)
    await setStatus(id, 'PAGO_VERIFICADO'); await setStatus(id, 'PROCESADA')
    assert(`wilmer procesa | inv -${Q}`, await statusOf(id) === 'PROCESADA' && await stockOf(PID) === s - Q)
    await setStatus(id, 'REABIERTA')
    assert('wilmer reabre | inv revertido', await statusOf(id) === 'BORRADOR' && await stockOf(PID) === s)
    await del(id)
    assert('wilmer elimina | inv intacto', await stockOf(PID) === s)
    await login('admin', 'admin123')
  }

  // ── LIMPIEZA ──
  console.log('\n▼ LIMPIEZA')
  await login('admin', 'admin123')
  for (const id of created) {
    try { await setStatus(id, 'REABIERTA') } catch {}
    const d = await del(id)
    if (d.status === 200) console.log(`  ✓ eliminar venta #${id}`)
  }
  if (boost) {
    await api(`/api/inventory/${PID}/adjust`, { method: 'POST', body: JSON.stringify({ movement_type: 'OUT', quantity: boost, notes: 'sim boost revert' }) })
    console.log(`  ✓ revertir boost de stock (-${boost})`)
  }

  console.log('\n====================================================')
  console.log(`RESULTADO: ${passed.length} ✓   ${failed.length} ❌`)
  if (failed.length) { console.log('Fallidos:'); failed.forEach(f => console.log('  - ' + f)); process.exit(1) }
})().catch(e => { console.error('ERROR FATAL', e); process.exit(1) })
