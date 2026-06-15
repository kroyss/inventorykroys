// Barrido de RECEPCIONES PARCIALES (usuario normal wilmer) en importaciones:
// parciales repetidas, reaperturas, deshacer, finalizar incompleto, y el caso
// MIXTO parcial→completa→finalizar. Verifica que el inventario nunca se rompa.
// Requiere dev server :3000 y wilmer con password 'test1234' (temporal).
const url = 'http://localhost:3000'
let COOKIES = {}
const passed = [], failed = []
function pc(res) { for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (k && v !== undefined) COOKIES[k.trim()] = v.trim() } }
const ck = () => Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join('; ')
async function api(p, init = {}) { const r = await fetch(url + p, { ...init, headers: { Cookie: ck(), 'Content-Type': 'application/json', ...(init.headers || {}) } }); const t = await r.text(); let d; try { d = t ? JSON.parse(t) : null } catch { d = t } return { status: r.status, data: d } }
async function login(u, pw) { COOKIES = {}; let r = await fetch(url + '/api/auth/csrf'); pc(r); const { csrfToken } = await r.json(); r = await fetch(url + '/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck() }, body: new URLSearchParams({ csrfToken, username: u, password: pw, country: 'VE', json: 'true', callbackUrl: '/dashboard' }).toString(), redirect: 'manual' }); pc(r); return (await api('/api/auth/session')).data?.user }
function assert(label, cond, detail = '') { if (cond) { console.log(`  ✓ ${label}`); passed.push(label) } else { console.log(`  ❌ ${label} ${detail}`); failed.push(label) } }
async function stockOf(pid) { const r = await api('/api/inventory'); const it = r.data.find(i => i.product_id === pid); return it ? it.quantity : null }
const getImp = async id => (await api('/api/imports')).data.find(o => o.id === id)
const pay = (id, s, a) => api(`/api/imports/${id}/payment`, { method: 'PUT', body: JSON.stringify({ payment_step: s, amount: a }) })
const setStatus = (id, b) => api(`/api/imports/${id}/status`, { method: 'PUT', body: JSON.stringify(b) })
const receive = (id, qty, partial) => api(`/api/imports/${id}/receive`, { method: 'POST', body: JSON.stringify({ items: [{ product_id: PID, received_qty: qty }], partial }) })
const finalize = (id, b) => api(`/api/imports/${id}/status/finalize`, { method: 'PUT', body: JSON.stringify(b || { status: 'FINALIZADA' }) })

const created = []
let PID

;(async () => {
  await login('admin', 'admin123')
  const product = (await api('/api/products')).data.find(p => p.is_active)
  const sup = (await api('/api/imports/suppliers')).data?.[0] || (await api('/api/suppliers')).data[0]
  PID = product.id
  console.log(`✓ admin · Producto ${product.code} (id=${PID})\n`)
  async function enCamino(qty) {
    const res = await api('/api/imports', { method: 'POST', body: JSON.stringify({ supplier_id: sup.id, origin_country: 'China', items: [{ product_id: PID, quantity: qty, unit_cost_usd: 3 }] }) })
    const o = (await api('/api/imports')).data.find(x => x.id === res.data.id); created.push(o.id)
    await pay(o.id, '100', 100)
    await setStatus(o.id, { status: 'EN_TRANSITO', tracking_number: 'T' })
    await setStatus(o.id, { status: 'ADUANA' })
    await setStatus(o.id, { status: 'EN_IMPORTADOR_PAGAR' })
    await setStatus(o.id, { status: 'EN_CAMINO', shipping_cost: 10, box_count: 1 })
    return o.id
  }

  await login('wilmer', 'test1234')
  console.log('✓ wilmer (usuario normal)\n')

  // ── S1: parciales repetidas acumulan, luego REABRIR RECEPCIÓN revierte todo ──
  console.log('▼ S1 — parciales repetidas (+5,+5,+5,+3) → reabrir recepción')
  {
    const id = await enCaminoAs(); const s0 = await stockOf(PID)
    await receive(id, 5, true); assert('parcial 1 +5', await stockOf(PID) === s0 + 5)
    await receive(id, 5, true); assert('parcial 2 → +10', await stockOf(PID) === s0 + 10)
    await receive(id, 5, true); assert('parcial 3 → +15', await stockOf(PID) === s0 + 15)
    await receive(id, 3, true); assert('parcial 4 → +18', await stockOf(PID) === s0 + 18)
    const o = await getImp(id); assert('estado PARCIAL', o.status === 'PARCIAL')
    await setStatus(id, { status: 'RESET_RECEPTION' })
    assert('reabrir recepción → EN_CAMINO, inv vuelve a s0', (await getImp(id)).status === 'EN_CAMINO' && await stockOf(PID) === s0)
  }

  // ── S2: parciales → DESHACER ÚLTIMO revierte todo ──
  console.log('\n▼ S2 — parciales (+8,+4) → deshacer último')
  {
    const id = await enCaminoAs(); const s0 = await stockOf(PID)
    await receive(id, 8, true); await receive(id, 4, true)
    assert('acumula +12', await stockOf(PID) === s0 + 12)
    await setStatus(id, { status: 'UNDO' })
    assert('deshacer → EN_CAMINO, inv s0', (await getImp(id)).status === 'EN_CAMINO' && await stockOf(PID) === s0)
  }

  // ── S3: parcial → reabrir → parcial otra vez (distinto monto) → reabrir ──
  console.log('\n▼ S3 — parcial, reabrir, parcial otra vez, reabrir (no acumula basura)')
  {
    const id = await enCaminoAs(); const s0 = await stockOf(PID)
    await receive(id, 7, true); assert('parcial +7', await stockOf(PID) === s0 + 7)
    await setStatus(id, { status: 'RESET_RECEPTION' }); assert('reabrir → s0', await stockOf(PID) === s0)
    await receive(id, 9, true); assert('parcial otra vez +9 (no +16)', await stockOf(PID) === s0 + 9)
    await setStatus(id, { status: 'RESET_RECEPTION' }); assert('reabrir → s0', await stockOf(PID) === s0)
  }

  // ── S4: parciales hasta completar → finalizar (no recarga) → reabrir(admin) ──
  console.log('\n▼ S4 — parciales completan (+10,+10) → finalizar → reabrir admin')
  {
    const id = await enCaminoAs20(); const s0 = await stockOf(PID)
    await receive(id, 10, true); await receive(id, 10, true)
    assert('parciales completan +20', await stockOf(PID) === s0 + 20)
    await finalize(id)
    assert('finalizar NO recarga (sigue +20)', (await getImp(id)).status === 'FINALIZADA' && await stockOf(PID) === s0 + 20)
    await login('admin', 'admin123')
    await setStatus(id, { status: 'REABIERTA' })
    assert('reabrir admin revierte +20 → s0', await stockOf(PID) === s0)
    await login('wilmer', 'test1234')
  }

  // ── S5: parcial incompleto → finalizar (carga solo lo parcial) → reabrir recepción ──
  console.log('\n▼ S5 — parcial incompleto (+6 de 20) → finalizar → reabrir recepción')
  {
    const id = await enCaminoAs20(); const s0 = await stockOf(PID)
    await receive(id, 6, true); assert('parcial +6', await stockOf(PID) === s0 + 6)
    await finalize(id); assert('finalizar incompleto sigue +6', (await getImp(id)).status === 'FINALIZADA' && await stockOf(PID) === s0 + 6)
    await setStatus(id, { status: 'RESET_RECEPTION' })
    assert('reabrir recepción revierte +6 → s0', (await getImp(id)).status === 'EN_CAMINO' && await stockOf(PID) === s0)
  }

  // ── S6 (EDGE, post-fix): intentar recepción COMPLETA desde PARCIAL se fuerza a
  //    parcial (carga acumulativa), evitando el inventario fantasma al reabrir ──
  console.log('\n▼ S6 — EDGE: desde PARCIAL, una "completa" se fuerza a parcial (sin fantasma)')
  {
    const id = await enCaminoAs20(); const s0 = await stockOf(PID)
    await receive(id, 5, true)                 // PARCIAL +5 (inv +5)
    assert('parcial +5', await stockOf(PID) === s0 + 5)
    await receive(id, 5, false)                // pide "completa" pero se fuerza parcial
    assert('completa-forzada-parcial → PARCIAL, carga +5 acumulado', (await getImp(id)).status === 'PARCIAL' && await stockOf(PID) === s0 + 10)
    await finalize(id)
    const afterFin = await stockOf(PID)
    assert('finalizar: inv = recibido real (s0+10), no recarga', afterFin === s0 + 10, `got ${afterFin} exp ${s0 + 10}`)
    await login('admin', 'admin123')
    await setStatus(id, { status: 'REABIERTA' })
    const afterReopen = await stockOf(PID)
    assert('reabrir revierte TODO → s0 (sin fantasma)', afterReopen === s0, `got ${afterReopen} exp ${s0}`)
    await login('wilmer', 'test1234')
  }

  // ── Limpieza ──
  console.log('\n▼ LIMPIEZA')
  await login('admin', 'admin123')
  for (const id of created) { const del = await api(`/api/imports/${id}`, { method: 'DELETE' }); assert(`eliminar IMP #${id}`, del.status === 200, JSON.stringify(del.data)) }

  console.log(`\n${'='.repeat(52)}\nRESULTADO: ${passed.length} ✓   ${failed.length} ❌`)
  if (failed.length) { console.log('FALLOS:'); failed.forEach(f => console.log('  - ' + f)) }
  process.exit(failed.length ? 1 : 0)

  // helpers que crean orden EN_CAMINO (re-login wilmer tras crear como admin)
  async function enCaminoAs() { await login('admin', 'admin123'); const id = await enCamino(20); await login('wilmer', 'test1234'); return id }
  async function enCaminoAs20() { return enCaminoAs() }
})().catch(e => { console.error('FATAL', e); process.exit(1) })
