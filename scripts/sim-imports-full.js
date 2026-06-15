// Simulador EXHAUSTIVO de Importaciones — avanza paso a paso y retrocede (reabrir/
// deshacer) en cada punto, como ADMIN y como USUARIO NORMAL (wilmer).
// Requiere: dev server en :3000 y que wilmer tenga password 'test1234' (temporal).
// Usage: node scripts/sim-imports-full.js
const url = 'http://localhost:3000'
let COOKIES = {}
const passed = [], failed = []

function parseCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(';'); const [k, v] = kv.split('=')
    if (k && v !== undefined) COOKIES[k.trim()] = v.trim()
  }
}
const cookie = () => Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join('; ')
async function api(path, init = {}) {
  const res = await fetch(url + path, { ...init, headers: { Cookie: cookie(), 'Content-Type': 'application/json', ...(init.headers || {}) } })
  const txt = await res.text(); let data; try { data = txt ? JSON.parse(txt) : null } catch { data = txt }
  return { status: res.status, data }
}
async function login(username, password) {
  COOKIES = {}
  let r = await fetch(url + '/api/auth/csrf'); parseCookies(r)
  const { csrfToken } = await r.json()
  r = await fetch(url + '/api/auth/callback/credentials', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, username, password, country: 'VE', json: 'true', callbackUrl: '/dashboard' }).toString(),
    redirect: 'manual',
  })
  parseCookies(r)
  return (await api('/api/auth/session')).data?.user
}
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${label}`); passed.push(label) }
  else { console.log(`  ❌ ${label} ${detail}`); failed.push(label) }
}
async function stockOf(pid) { const r = await api('/api/inventory'); const it = r.data.find(i => i.product_id === pid); return it ? it.quantity : null }
const getImp = async id => (await api('/api/imports')).data.find(o => o.id === id)
const pay = (id, step, amount) => api(`/api/imports/${id}/payment`, { method: 'PUT', body: JSON.stringify({ payment_step: step, amount }) })
const setStatus = (id, body) => api(`/api/imports/${id}/status`, { method: 'PUT', body: JSON.stringify(body) })
const receive = (id, items, partial) => api(`/api/imports/${id}/receive`, { method: 'POST', body: JSON.stringify({ items, partial }) })
const finalize = (id, body) => api(`/api/imports/${id}/status/finalize`, { method: 'PUT', body: JSON.stringify(body || { status: 'FINALIZADA' }) })
async function uploadFile(id) {
  const fd = new FormData()
  fd.append('file', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), 'foto.png')
  const res = await fetch(`${url}/api/imports/${id}/files`, { method: 'POST', headers: { Cookie: cookie() }, body: fd })
  return res.status
}

const created = []

;(async () => {
  const admin = await login('admin', 'admin123')
  if (!admin) { console.log('❌ login admin'); process.exit(1) }
  console.log('✓ login admin\n')

  const product = (await api('/api/products')).data.find(p => p.is_active)
  const sup = (await api('/api/imports/suppliers')).data?.[0] || (await api('/api/suppliers')).data[0]
  const PID = product.id
  console.log(`Producto ${product.code} (id=${PID}) · Proveedor ${sup.name}\n`)

  async function newImp(qty = 10) {
    const res = await api('/api/imports', { method: 'POST', body: JSON.stringify({ supplier_id: sup.id, origin_country: 'China', items: [{ product_id: PID, quantity: qty, unit_cost_usd: 3 }] }) })
    const ord = (await api('/api/imports')).data.find(o => o.id === res.data.id)
    created.push(ord.id); return ord
  }

  // ════════════════════════════════════════════════════════════
  console.log('▼ PARTE A — ADMIN: avanzar por los 12 estados (vía ESPERANDO_FOTOS)')
  {
    const s0 = await stockOf(PID)
    const imp = await newImp(10)
    assert('1. creada PENDIENTE', imp.status === 'PENDIENTE')

    await pay(imp.id, '50', 50)
    assert('2. pago 50% → PAGO_PARCIAL', (await getImp(imp.id)).status === 'PAGO_PARCIAL')

    await setStatus(imp.id, { status: 'ESPERANDO_FOTOS' })
    assert('3. → ESPERANDO_FOTOS', (await getImp(imp.id)).status === 'ESPERANDO_FOTOS')

    const noFile = await setStatus(imp.id, { status: 'PAGADA' })
    assert('4. avanzar sin archivo → BLOQUEADO', noFile.status >= 400, `status ${noFile.status}`)

    const up = await uploadFile(imp.id)
    assert('5. subir archivo (201)', up === 201, `status ${up}`)

    await pay(imp.id, '100', 100)
    assert('6. pago 100% → PAGADA', (await getImp(imp.id)).status === 'PAGADA')

    await setStatus(imp.id, { status: 'EN_TRANSITO', tracking_number: 'TRK-001' })
    let o = await getImp(imp.id)
    assert('7. → EN_TRANSITO (tracking guardado)', o.status === 'EN_TRANSITO' && o.tracking_number === 'TRK-001')

    await setStatus(imp.id, { status: 'ADUANA' })
    assert('8. → ADUANA', (await getImp(imp.id)).status === 'ADUANA')

    await setStatus(imp.id, { status: 'EN_IMPORTADOR_PAGAR' })
    assert('9. → EN_IMPORTADOR_PAGAR', (await getImp(imp.id)).status === 'EN_IMPORTADOR_PAGAR')

    const noShip = await setStatus(imp.id, { status: 'EN_CAMINO' })
    assert('10. EN_CAMINO sin envío/cajas → BLOQUEADO', noShip.status >= 400)

    await setStatus(imp.id, { status: 'EN_CAMINO', shipping_cost: 80, box_count: 4 })
    o = await getImp(imp.id)
    assert('11. → EN_CAMINO (envío+cajas)', o.status === 'EN_CAMINO' && o.box_count === 4)

    await receive(imp.id, [{ product_id: PID, received_qty: 10 }], false)
    assert('12. recibir completo → RECIBIDA', (await getImp(imp.id)).status === 'RECIBIDA')
    assert('    inventario NO cambia aún', await stockOf(PID) === s0)

    await finalize(imp.id)
    assert('13. finalizar → FINALIZADA', (await getImp(imp.id)).status === 'FINALIZADA')
    assert('    inventario +10', await stockOf(PID) === s0 + 10)
  }

  // ════════════════════════════════════════════════════════════
  console.log('\n▼ PARTE B — ADMIN: reabrir (REABIERTA→PENDIENTE) desde cada estado')
  async function toEnCamino(id) {
    await pay(id, '100', 100)
    await setStatus(id, { status: 'EN_TRANSITO', tracking_number: 'T' })
    await setStatus(id, { status: 'ADUANA' })
    await setStatus(id, { status: 'EN_IMPORTADOR_PAGAR' })
    await setStatus(id, { status: 'EN_CAMINO', shipping_cost: 10, box_count: 1 })
  }
  // B1: desde EN_TRANSITO (sin inventario)
  {
    const imp = await newImp(5)
    await pay(imp.id, '100', 100)
    await setStatus(imp.id, { status: 'EN_TRANSITO', tracking_number: 'TX' })
    await setStatus(imp.id, { status: 'REABIERTA' })
    const o = await getImp(imp.id)
    assert('B1. EN_TRANSITO → reabrir → PENDIENTE', o.status === 'PENDIENTE')
    assert('B1. pagos+tracking reseteados', o.paid_100_done === false && !o.tracking_number)
  }
  // B2: desde RECIBIDA (aún sin inventario cargado)
  {
    const s0 = await stockOf(PID)
    const imp = await newImp(5); await toEnCamino(imp.id)
    await receive(imp.id, [{ product_id: PID, received_qty: 5 }], false)
    assert('B2. RECIBIDA', (await getImp(imp.id)).status === 'RECIBIDA')
    await setStatus(imp.id, { status: 'REABIERTA' })
    assert('B2. reabrir → PENDIENTE', (await getImp(imp.id)).status === 'PENDIENTE')
    assert('B2. inventario intacto', await stockOf(PID) === s0)
  }
  // B3: desde FINALIZADA (revierte inventario)
  {
    const s0 = await stockOf(PID)
    const imp = await newImp(5); await toEnCamino(imp.id)
    await receive(imp.id, [{ product_id: PID, received_qty: 5 }], false)
    await finalize(imp.id)
    assert('B3. FINALIZADA +5', await stockOf(PID) === s0 + 5)
    await setStatus(imp.id, { status: 'REABIERTA' })
    assert('B3. reabrir → PENDIENTE', (await getImp(imp.id)).status === 'PENDIENTE')
    assert('B3. inventario revertido a s0', await stockOf(PID) === s0)
  }
  // B4: desde PARCIAL (revierte lo cargado)
  {
    const s0 = await stockOf(PID)
    const imp = await newImp(10); await toEnCamino(imp.id)
    await receive(imp.id, [{ product_id: PID, received_qty: 4 }], true)
    assert('B4. PARCIAL +4', (await getImp(imp.id)).status === 'PARCIAL' && await stockOf(PID) === s0 + 4)
    await setStatus(imp.id, { status: 'REABIERTA' })
    assert('B4. reabrir revierte +4', await stockOf(PID) === s0)
  }
  // B5: desde INCONSISTENTE (carga lo recibido, reabrir revierte exacto)
  {
    const s0 = await stockOf(PID)
    const imp = await newImp(10); await toEnCamino(imp.id)
    await receive(imp.id, [{ product_id: PID, received_qty: 7 }], false)
    await finalize(imp.id, { status: 'INCONSISTENTE', incomplete_note: '7 de 10' })
    assert('B5. INCONSISTENTE +7', (await getImp(imp.id)).status === 'INCONSISTENTE' && await stockOf(PID) === s0 + 7)
    await setStatus(imp.id, { status: 'REABIERTA' })
    assert('B5. reabrir revierte +7 exacto', await stockOf(PID) === s0)
  }

  // ════════════════════════════════════════════════════════════
  console.log('\n▼ PARTE C — USUARIO NORMAL (wilmer): recepción + reabrir/deshacer')
  // admin deja una orden EN_CAMINO
  const impN = await newImp(10)
  await toEnCamino(impN.id)
  const baseStock = await stockOf(PID)

  const w = await login('wilmer', 'test1234')
  assert('C. login wilmer (role user)', w?.role === 'user')

  // C1: recibir completo → RECIBIDA
  await receive(impN.id, [{ product_id: PID, received_qty: 10 }], false)
  assert('C1. wilmer recibir → RECIBIDA', (await getImp(impN.id)).status === 'RECIBIDA')
  assert('C1. inventario sin cambio (RECIBIDA)', await stockOf(PID) === baseStock)

  // C2: finalizar → FINALIZADA (+10)
  await finalize(impN.id)
  assert('C2. wilmer finalizar → FINALIZADA', (await getImp(impN.id)).status === 'FINALIZADA')
  assert('C2. inventario +10', await stockOf(PID) === baseStock + 10)

  // C3: Reabrir recepción (RESET_RECEPTION) → EN_CAMINO, revierte inventario  ← EL FIX
  await setStatus(impN.id, { status: 'RESET_RECEPTION' })
  assert('C3. Reabrir recepción → EN_CAMINO', (await getImp(impN.id)).status === 'EN_CAMINO')
  assert('C3. inventario revertido', await stockOf(PID) === baseStock)

  // C4: recibir de nuevo → RECIBIDA, luego Deshacer último → EN_CAMINO
  await receive(impN.id, [{ product_id: PID, received_qty: 10 }], false)
  await setStatus(impN.id, { status: 'UNDO' })
  assert('C4. Deshacer último (RECIBIDA→EN_CAMINO)', (await getImp(impN.id)).status === 'EN_CAMINO')

  // C5: parcial → PARCIAL (+6), Deshacer último → EN_CAMINO (-6)
  await receive(impN.id, [{ product_id: PID, received_qty: 6 }], true)
  assert('C5. parcial → PARCIAL +6', (await getImp(impN.id)).status === 'PARCIAL' && await stockOf(PID) === baseStock + 6)
  await setStatus(impN.id, { status: 'UNDO' })
  assert('C5. deshacer parcial revierte', (await getImp(impN.id)).status === 'EN_CAMINO' && await stockOf(PID) === baseStock)

  // C6: finalizar y luego reabrir recepción otra vez (simula botón de Historial)
  await receive(impN.id, [{ product_id: PID, received_qty: 10 }], false)
  await finalize(impN.id)
  assert('C6. finalizada de nuevo +10', (await getImp(impN.id)).status === 'FINALIZADA' && await stockOf(PID) === baseStock + 10)
  await setStatus(impN.id, { status: 'RESET_RECEPTION' })
  assert('C6. reabrir desde finalizada (Historial) → EN_CAMINO', (await getImp(impN.id)).status === 'EN_CAMINO' && await stockOf(PID) === baseStock)

  // C7: permisos — wilmer NO puede avanzar estados de admin ni REABIERTA
  const forb1 = await setStatus(impN.id, { status: 'ADUANA' })
  assert('C7. wilmer → ADUANA prohibido (403)', forb1.status === 403, `status ${forb1.status}`)
  const forb2 = await setStatus(impN.id, { status: 'REABIERTA' })
  assert('C7. wilmer → REABIERTA prohibido (403)', forb2.status === 403, `status ${forb2.status}`)

  // ── Limpieza (como admin) ──
  console.log('\n▼ LIMPIEZA')
  await login('admin', 'admin123')
  for (const id of created) {
    const del = await api(`/api/imports/${id}`, { method: 'DELETE' })
    assert(`eliminar IMP #${id}`, del.status === 200, JSON.stringify(del.data))
  }

  console.log(`\n${'='.repeat(52)}\nRESULTADO: ${passed.length} ✓   ${failed.length} ❌`)
  if (failed.length) { console.log('FALLOS:'); failed.forEach(f => console.log('  - ' + f)) }
  process.exit(failed.length ? 1 : 0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
