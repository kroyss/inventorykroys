// Simulador del flujo de Compras — verifica inventario y movimientos paso a paso.
// Requiere el dev server corriendo (npm run dev) y DB local.
// Usage: node scripts/sim-compras.js
const url = 'http://localhost:3000'
const COOKIES = {}

const passed = []
const failed = []

function parseCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(';'); const [k, v] = kv.split('=')
    if (k && v !== undefined) COOKIES[k.trim()] = v.trim()
  }
}
const cookie = () => Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join('; ')

async function api(path, init = {}) {
  const res = await fetch(url + path, {
    ...init,
    headers: { 'Cookie': cookie(), 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const txt = await res.text()
  let data; try { data = txt ? JSON.parse(txt) : null } catch { data = txt }
  return { status: res.status, data }
}

function assert(label, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${label}`); passed.push(label) }
  else { console.log(`  ❌ ${label} ${detail}`); failed.push(label) }
}

// Helper: get current stock of a product
async function stockOf(productId) {
  const r = await api('/api/inventory')
  const it = r.data.find(i => i.product_id === productId)
  return it ? it.quantity : null
}

;(async () => {
  // ── Login ──
  let r = await fetch(url + '/api/auth/csrf'); parseCookies(r)
  const { csrfToken } = await r.json()
  r = await fetch(url + '/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookie() },
    body: new URLSearchParams({ csrfToken, username: 'admin', password: 'admin123', country: 'VE', json: 'true', callbackUrl: '/dashboard' }).toString(),
    redirect: 'manual',
  })
  parseCookies(r)
  const sess = await api('/api/auth/session')
  if (sess.status !== 200 || !sess.data?.user) { console.log('❌ login falló'); process.exit(1) }
  console.log(`✓ login admin VE\n`)

  // Product + supplier
  const prods = await api('/api/products')
  const product = prods.data.find(p => p.is_active)
  const sup = (await api('/api/suppliers')).data[0]
  if (!product || !sup) { console.log('❌ falta producto o proveedor'); process.exit(1) }
  const PID = product.id
  console.log(`Producto ${product.code} (id=${PID}) · Proveedor ${sup.name}\n`)

  const createdOrders = []
  async function newPO(items) {
    const res = await api('/api/purchases', { method: 'POST', body: JSON.stringify({ supplier_id: sup.id, items }) })
    if (res.status !== 200 && res.status !== 201) throw new Error('create failed: ' + JSON.stringify(res.data))
    // fetch the just-created order (most recent PENDIENTE for this supplier)
    const list = await api('/api/purchases')
    const ord = list.data.find(o => o.id === res.data.id) || list.data[0]
    createdOrders.push(ord.id)
    return ord
  }
  const advance = (id) => api(`/api/purchases/${id}/status`, { method: 'PUT', body: JSON.stringify({ action: 'advance' }) })
  const receive = (id, items, partial) => api(`/api/purchases/${id}/receive`, { method: 'POST', body: JSON.stringify({ items, partial }) })
  const finalize = (id) => api(`/api/purchases/${id}/status`, { method: 'PUT', body: JSON.stringify({ action: 'finalize' }) })
  const inconsistente = (id, note) => api(`/api/purchases/${id}/status`, { method: 'PUT', body: JSON.stringify({ action: 'inconsistente', note }) })
  const reopen = (id) => api(`/api/purchases/${id}/status`, { method: 'PUT', body: JSON.stringify({ action: 'reopen' }) })
  const undo = (id) => api(`/api/purchases/${id}/status`, { method: 'PUT', body: JSON.stringify({ action: 'undo' }) })
  const resetRec = (id) => api(`/api/purchases/${id}/status`, { method: 'PUT', body: JSON.stringify({ action: 'reset_reception' }) })
  const getOrder = async (id) => (await api('/api/purchases')).data.find(o => o.id === id)

  // ════════════════════════════════════════════════════════════════
  // FLUJO A — Recepción completa + finalizar + reabrir
  // ════════════════════════════════════════════════════════════════
  console.log('▼ FLUJO A — completa → finalizar → reabrir')
  {
    const s0 = await stockOf(PID)
    const po = await newPO([{ product_id: PID, quantity: 10, unit_cost_usd: 2 }])
    assert('PO creada PENDIENTE', po.status === 'PENDIENTE')

    let a = await advance(po.id); assert('→ PAGADA', (await getOrder(po.id)).status === 'PAGADA', JSON.stringify(a.data))
    a = await advance(po.id);     assert('→ EN_CAMINO', (await getOrder(po.id)).status === 'EN_CAMINO')

    await receive(po.id, [{ product_id: PID, received_qty: 10 }], false)
    assert('→ RECIBIDA', (await getOrder(po.id)).status === 'RECIBIDA')
    assert('inventario NO cambia aún (carga al finalizar)', await stockOf(PID) === s0, `got ${await stockOf(PID)} exp ${s0}`)

    await finalize(po.id)
    const oF = await getOrder(po.id)
    assert('→ FINALIZADA', oF.status === 'FINALIZADA')
    assert('inventario +10', await stockOf(PID) === s0 + 10, `got ${await stockOf(PID)} exp ${s0 + 10}`)

    await reopen(po.id)
    assert('→ PENDIENTE (reabierta)', (await getOrder(po.id)).status === 'PENDIENTE')
    assert('inventario revertido a inicial', await stockOf(PID) === s0, `got ${await stockOf(PID)} exp ${s0}`)
  }

  // ════════════════════════════════════════════════════════════════
  // FLUJO B — Recepciones parciales acumuladas + finalizar + reabrir
  // ════════════════════════════════════════════════════════════════
  console.log('\n▼ FLUJO B — parcial x2 → finalizar → reabrir')
  {
    const s0 = await stockOf(PID)
    const po = await newPO([{ product_id: PID, quantity: 10, unit_cost_usd: 2 }])
    await advance(po.id); await advance(po.id) // → EN_CAMINO

    await receive(po.id, [{ product_id: PID, received_qty: 4 }], true)
    assert('parcial 1 → PARCIAL', (await getOrder(po.id)).status === 'PARCIAL')
    assert('inventario +4 inmediato', await stockOf(PID) === s0 + 4, `got ${await stockOf(PID)} exp ${s0 + 4}`)

    await receive(po.id, [{ product_id: PID, received_qty: 3 }], true)
    assert('parcial 2 acumula → +7', await stockOf(PID) === s0 + 7, `got ${await stockOf(PID)} exp ${s0 + 7}`)

    await finalize(po.id)
    const oF = await getOrder(po.id)
    assert('→ FINALIZADA', oF.status === 'FINALIZADA')
    assert('inventario sigue +7 (no recarga)', await stockOf(PID) === s0 + 7, `got ${await stockOf(PID)} exp ${s0 + 7}`)
    assert('marcada incompleta (7≠10)', oF.is_incomplete === true)

    await reopen(po.id)
    assert('reabrir revierte +7', await stockOf(PID) === s0, `got ${await stockOf(PID)} exp ${s0}`)
  }

  // ════════════════════════════════════════════════════════════════
  // FLUJO C — Inconsistente desde RECIBIDA (bug corregido)
  // ════════════════════════════════════════════════════════════════
  console.log('\n▼ FLUJO C — recibida(8/10) → inconsistente → reabrir')
  {
    const s0 = await stockOf(PID)
    const po = await newPO([{ product_id: PID, quantity: 10, unit_cost_usd: 2 }])
    await advance(po.id); await advance(po.id)

    await receive(po.id, [{ product_id: PID, received_qty: 8 }], false)
    assert('→ RECIBIDA (8/10)', (await getOrder(po.id)).status === 'RECIBIDA')

    await inconsistente(po.id, 'Faltaron 2 unidades')
    const oI = await getOrder(po.id)
    assert('→ INCONSISTENTE', oI.status === 'INCONSISTENTE')
    assert('inventario +8 (carga lo recibido)', await stockOf(PID) === s0 + 8, `got ${await stockOf(PID)} exp ${s0 + 8}`)

    await reopen(po.id)
    assert('reabrir revierte +8 exacto', await stockOf(PID) === s0, `got ${await stockOf(PID)} exp ${s0}`)
  }

  // ════════════════════════════════════════════════════════════════
  // FLUJO D — Movimientos: signo y running_total
  // ════════════════════════════════════════════════════════════════
  console.log('\n▼ FLUJO D — movimientos con signo correcto')
  {
    const mv = await api(`/api/inventory/${PID}/movements`)
    const rows = mv.data
    assert('endpoint movimientos responde', Array.isArray(rows) && rows.length > 0)
    const outMov = rows.find(m => m.movement_type === 'OUT')
    if (outMov) assert('OUT guardado negativo', outMov.quantity < 0, `got ${outMov.quantity}`)
    const inMov = rows.find(m => m.movement_type === 'IN')
    if (inMov) assert('IN guardado positivo', inMov.quantity > 0, `got ${inMov.quantity}`)
    // Consistencia interna del ledger: running_total del más reciente == suma de todas las cantidades.
    // (No tiene que igualar el stock actual: el stock puede haberse fijado sin movimiento.)
    // El endpoint limita a 100 filas; solo verificable contra suma total si cabe el historial completo.
    if (rows.length < 100) {
      const sumAll = rows.reduce((s, m) => s + Number(m.quantity), 0)
      assert('running_total == suma de movimientos', Number(rows[0].running_total) === sumAll, `rt ${rows[0].running_total} sum ${sumAll}`)
    } else {
      console.log('  · (sumatoria total omitida: historial >100 movimientos)')
    }
    // Cada par consecutivo difiere por la cantidad del movimiento más nuevo
    let ledgerOk = true
    for (let i = 0; i < rows.length - 1; i++) {
      if (Number(rows[i].running_total) - Number(rows[i + 1].running_total) !== Number(rows[i].quantity)) { ledgerOk = false; break }
    }
    assert('ledger consistente (deltas correctos)', ledgerOk)
  }

  // ════════════════════════════════════════════════════════════════
  // FLUJO E — Recepción: deshacer último + reabrir recepción
  // ════════════════════════════════════════════════════════════════
  console.log('\n▼ FLUJO E — deshacer último + reabrir recepción')
  {
    const s0 = await stockOf(PID)
    const po = await newPO([{ product_id: PID, quantity: 10, unit_cost_usd: 2 }])
    await advance(po.id); await advance(po.id) // EN_CAMINO

    // Parcial +5, deshacer → EN_CAMINO revierte
    await receive(po.id, [{ product_id: PID, received_qty: 5 }], true)
    assert('parcial +5 → PARCIAL', (await getOrder(po.id)).status === 'PARCIAL' && await stockOf(PID) === s0 + 5)
    await undo(po.id)
    let o = await getOrder(po.id)
    assert('deshacer PARCIAL → EN_CAMINO', o.status === 'EN_CAMINO')
    assert('inventario revertido a inicial', await stockOf(PID) === s0, `got ${await stockOf(PID)} exp ${s0}`)

    // Recibida completa, finalizar, deshacer finalización → RECIBIDA revierte carga
    await receive(po.id, [{ product_id: PID, received_qty: 10 }], false)
    await finalize(po.id)
    assert('finalizada +10', (await getOrder(po.id)).status === 'FINALIZADA' && await stockOf(PID) === s0 + 10)
    await undo(po.id)
    o = await getOrder(po.id)
    assert('deshacer FINALIZADA → RECIBIDA', o.status === 'RECIBIDA')
    assert('inventario revertido (finalización)', await stockOf(PID) === s0, `got ${await stockOf(PID)} exp ${s0}`)

    // Deshacer otra vez: RECIBIDA → EN_CAMINO (sin tocar inventario)
    await undo(po.id)
    assert('deshacer RECIBIDA → EN_CAMINO', (await getOrder(po.id)).status === 'EN_CAMINO')
    assert('inventario sigue inicial', await stockOf(PID) === s0)

    // Reabrir recepción desde PARCIAL revierte todo
    await receive(po.id, [{ product_id: PID, received_qty: 7 }], true)
    assert('parcial +7', await stockOf(PID) === s0 + 7)
    await resetRec(po.id)
    assert('reabrir recepción → EN_CAMINO', (await getOrder(po.id)).status === 'EN_CAMINO')
    assert('inventario revertido por reset', await stockOf(PID) === s0, `got ${await stockOf(PID)} exp ${s0}`)
  }

  // ── Cleanup ──
  console.log('\n▼ LIMPIEZA')
  for (const id of createdOrders) {
    const del = await api(`/api/purchases/${id}`, { method: 'DELETE' })
    assert(`eliminar PO #${id}`, del.status === 200, JSON.stringify(del.data))
  }

  // ── Resumen ──
  console.log(`\n${'='.repeat(50)}`)
  console.log(`RESULTADO: ${passed.length} ✓   ${failed.length} ❌`)
  if (failed.length) { console.log('FALLOS:'); failed.forEach(f => console.log('  - ' + f)) }
  process.exit(failed.length ? 1 : 0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
