// Simulador del flujo de Importaciones — pagos, 12 estados, parciales, reabrir.
// Requiere dev server corriendo. Usage: node scripts/sim-imports.js
const url = 'http://localhost:3000'
const COOKIES = {}
const passed = [], failed = []

function parseCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(';'); const [k, v] = kv.split('=')
    if (k && v !== undefined) COOKIES[k.trim()] = v.trim()
  }
}
const cookie = () => Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join('; ')
async function api(path, init = {}) {
  const res = await fetch(url + path, { ...init, headers: { 'Cookie': cookie(), 'Content-Type': 'application/json', ...(init.headers || {}) } })
  const txt = await res.text(); let data; try { data = txt ? JSON.parse(txt) : null } catch { data = txt }
  return { status: res.status, data }
}
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${label}`); passed.push(label) }
  else { console.log(`  ❌ ${label} ${detail}`); failed.push(label) }
}
async function stockOf(productId) {
  const r = await api('/api/inventory'); const it = r.data.find(i => i.product_id === productId)
  return it ? it.quantity : null
}

;(async () => {
  let r = await fetch(url + '/api/auth/csrf'); parseCookies(r)
  const { csrfToken } = await r.json()
  r = await fetch(url + '/api/auth/callback/credentials', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookie() },
    body: new URLSearchParams({ csrfToken, username: 'admin', password: 'admin123', country: 'VE', json: 'true', callbackUrl: '/dashboard' }).toString(),
    redirect: 'manual',
  })
  parseCookies(r)
  const sess = await api('/api/auth/session')
  if (sess.status !== 200 || !sess.data?.user) { console.log('❌ login falló'); process.exit(1) }
  console.log('✓ login admin VE\n')

  const prods = await api('/api/products')
  const product = prods.data.find(p => p.is_active)
  const sup = (await api('/api/imports/suppliers')).data?.[0] || (await api('/api/suppliers')).data[0]
  if (!product || !sup) { console.log('❌ falta producto o proveedor import'); process.exit(1) }
  const PID = product.id
  console.log(`Producto ${product.code} (id=${PID}) · Proveedor ${sup.name}\n`)

  const created = []
  async function newImp(items) {
    const res = await api('/api/imports', { method: 'POST', body: JSON.stringify({ supplier_id: sup.id, origin_country: 'China', items }) })
    if (res.status !== 200 && res.status !== 201) throw new Error('create failed: ' + JSON.stringify(res.data))
    const list = await api('/api/imports')
    const ord = list.data.find(o => o.id === res.data.id) || list.data[0]
    created.push(ord.id)
    return ord
  }
  const pay = (id, step, amount) => api(`/api/imports/${id}/payment`, { method: 'PUT', body: JSON.stringify({ payment_step: step, amount }) })
  const setStatus = (id, body) => api(`/api/imports/${id}/status`, { method: 'PUT', body: JSON.stringify(body) })
  const receive = (id, items, partial) => api(`/api/imports/${id}/receive`, { method: 'POST', body: JSON.stringify({ items, partial }) })
  const finalize = (id, body) => api(`/api/imports/${id}/status/finalize`, { method: 'PUT', body: JSON.stringify(body || { status: 'FINALIZADA' }) })
  const getImp = async (id) => (await api('/api/imports')).data.find(o => o.id === id)

  // Avanza una orden recién creada hasta EN_CAMINO usando pago 100% (evita ESPERANDO_FOTOS)
  async function toEnCamino(id) {
    await pay(id, '100', 100)                                    // PENDIENTE → PAGADA
    await setStatus(id, { status: 'EN_TRANSITO', tracking_number: 'TRK-123' })
    await setStatus(id, { status: 'ADUANA' })
    await setStatus(id, { status: 'EN_IMPORTADOR_PAGAR' })
    await setStatus(id, { status: 'EN_CAMINO', shipping_cost: 50, box_count: 3 })
  }

  // ════════════════════════════════════════════════════════════════
  console.log('▼ FLUJO A — pagos + 12 estados → finalizar → reabrir')
  {
    const s0 = await stockOf(PID)
    const imp = await newImp([{ product_id: PID, quantity: 10, unit_cost_usd: 3 }])
    assert('IMP creada PENDIENTE', imp.status === 'PENDIENTE')

    await pay(imp.id, '50', 50)
    let o = await getImp(imp.id)
    assert('pago 50% → PAGO_PARCIAL', o.status === 'PAGO_PARCIAL' && o.paid_50_done === true)

    await pay(imp.id, '100', 100)
    o = await getImp(imp.id)
    assert('pago 100% → PAGADA', o.status === 'PAGADA' && o.paid_100_done === true)

    await setStatus(imp.id, { status: 'EN_TRANSITO', tracking_number: 'TRK-999' })
    assert('→ EN_TRANSITO (tracking)', (await getImp(imp.id)).tracking_number === 'TRK-999')
    await setStatus(imp.id, { status: 'ADUANA' });               assert('→ ADUANA', (await getImp(imp.id)).status === 'ADUANA')
    await setStatus(imp.id, { status: 'EN_IMPORTADOR_PAGAR' });  assert('→ EN_IMPORTADOR_PAGAR', (await getImp(imp.id)).status === 'EN_IMPORTADOR_PAGAR')

    // EN_CAMINO requiere shipping + box_count
    const bad = await setStatus(imp.id, { status: 'EN_CAMINO' })
    assert('EN_CAMINO sin envío/cajas → error', bad.status >= 400)
    await setStatus(imp.id, { status: 'EN_CAMINO', shipping_cost: 80, box_count: 5 })
    o = await getImp(imp.id)
    assert('→ EN_CAMINO (envío+cajas)', o.status === 'EN_CAMINO' && o.box_count === 5)

    await receive(imp.id, [{ product_id: PID, received_qty: 10 }], false)
    assert('→ RECIBIDA', (await getImp(imp.id)).status === 'RECIBIDA')
    assert('inventario NO cambia aún', await stockOf(PID) === s0, `got ${await stockOf(PID)} exp ${s0}`)

    await finalize(imp.id)
    assert('→ FINALIZADA', (await getImp(imp.id)).status === 'FINALIZADA')
    assert('inventario +10', await stockOf(PID) === s0 + 10, `got ${await stockOf(PID)} exp ${s0 + 10}`)

    await setStatus(imp.id, { status: 'REABIERTA' })
    o = await getImp(imp.id)
    assert('reabrir → PENDIENTE', o.status === 'PENDIENTE')
    assert('inventario revertido', await stockOf(PID) === s0, `got ${await stockOf(PID)} exp ${s0}`)
    assert('pagos reseteados', o.paid_50_done === false && o.paid_100_done === false)
  }

  // ════════════════════════════════════════════════════════════════
  console.log('\n▼ FLUJO B — parciales acumuladas → finalizar → reabrir')
  {
    const s0 = await stockOf(PID)
    const imp = await newImp([{ product_id: PID, quantity: 10, unit_cost_usd: 3 }])
    await toEnCamino(imp.id)

    await receive(imp.id, [{ product_id: PID, received_qty: 6 }], true)
    assert('parcial 1 → PARCIAL', (await getImp(imp.id)).status === 'PARCIAL')
    assert('inventario +6 inmediato', await stockOf(PID) === s0 + 6, `got ${await stockOf(PID)} exp ${s0 + 6}`)

    await receive(imp.id, [{ product_id: PID, received_qty: 2 }], true)
    assert('parcial 2 acumula → +8', await stockOf(PID) === s0 + 8, `got ${await stockOf(PID)} exp ${s0 + 8}`)

    await finalize(imp.id)
    assert('→ FINALIZADA (no recarga)', await stockOf(PID) === s0 + 8, `got ${await stockOf(PID)} exp ${s0 + 8}`)

    await setStatus(imp.id, { status: 'REABIERTA' })
    assert('reabrir revierte +8', await stockOf(PID) === s0, `got ${await stockOf(PID)} exp ${s0}`)
  }

  // ════════════════════════════════════════════════════════════════
  console.log('\n▼ FLUJO C — inconsistente desde RECIBIDA → reabrir')
  {
    const s0 = await stockOf(PID)
    const imp = await newImp([{ product_id: PID, quantity: 10, unit_cost_usd: 3 }])
    await toEnCamino(imp.id)

    await receive(imp.id, [{ product_id: PID, received_qty: 7 }], false)
    assert('→ RECIBIDA (7/10)', (await getImp(imp.id)).status === 'RECIBIDA')

    await finalize(imp.id, { status: 'INCONSISTENTE', incomplete_note: 'Llegaron 7 de 10' })
    assert('→ INCONSISTENTE', (await getImp(imp.id)).status === 'INCONSISTENTE')
    assert('inventario +7 (carga lo recibido)', await stockOf(PID) === s0 + 7, `got ${await stockOf(PID)} exp ${s0 + 7}`)

    await setStatus(imp.id, { status: 'REABIERTA' })
    assert('reabrir revierte +7 exacto', await stockOf(PID) === s0, `got ${await stockOf(PID)} exp ${s0}`)
  }

  // ── Cleanup ──
  console.log('\n▼ LIMPIEZA')
  for (const id of created) {
    const del = await api(`/api/imports/${id}`, { method: 'DELETE' })
    assert(`eliminar IMP #${id}`, del.status === 200, JSON.stringify(del.data))
  }

  console.log(`\n${'='.repeat(50)}\nRESULTADO: ${passed.length} ✓   ${failed.length} ❌`)
  if (failed.length) { console.log('FALLOS:'); failed.forEach(f => console.log('  - ' + f)) }
  process.exit(failed.length ? 1 : 0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
