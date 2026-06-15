// Barrido COMPLETO de Compras locales: escalera (avanzar N → reabrir), parciales
// repetidas, reaperturas/deshacer, caso mixto parcial→completa, y ciclo del usuario
// normal. Verifica que el inventario nunca se rompa.
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
const getOrd = async id => (await api('/api/purchases')).data.find(o => o.id === id)
const act = (id, action, note) => api(`/api/purchases/${id}/status`, { method: 'PUT', body: JSON.stringify({ action, note }) })
const receive = (id, qty, partial) => api(`/api/purchases/${id}/receive`, { method: 'POST', body: JSON.stringify({ items: [{ product_id: PID, received_qty: qty }], partial }) })

const created = []
let PID, SUP

;(async () => {
  await login('admin', 'admin123')
  const product = (await api('/api/products')).data.find(p => p.is_active)
  SUP = (await api('/api/suppliers')).data[0]
  PID = product.id
  console.log(`✓ admin · Producto ${product.code} (id=${PID}) · ${SUP.name}\n`)
  async function newPO(qty) { const res = await api('/api/purchases', { method: 'POST', body: JSON.stringify({ supplier_id: SUP.id, items: [{ product_id: PID, quantity: qty, unit_cost_usd: 2 }] }) }); const o = (await api('/api/purchases')).data.find(x => x.id === res.data.id); created.push(o.id); return o }
  async function toEnCamino(qty) { const o = await newPO(qty); await act(o.id, 'advance'); await act(o.id, 'advance'); return o.id }

  // ── ESCALERA: avanzar N → reabrir → re-avanzar (N=1..4) ──
  console.log('▼ ESCALERA — avanzar N estados y reabrir (N=1..4)')
  const STEPS = [
    { status: 'PAGADA',     inv: 0,  run: async id => act(id, 'advance') },
    { status: 'EN_CAMINO',  inv: 0,  run: async id => act(id, 'advance') },
    { status: 'RECIBIDA',   inv: 0,  run: async id => receive(id, 10, false) },
    { status: 'FINALIZADA', inv: 10, run: async id => act(id, 'finalize') },
  ]
  for (let depth = 1; depth <= STEPS.length; depth++) {
    const s0 = await stockOf(PID); const o = await newPO(10)
    for (let i = 0; i < depth; i++) await STEPS[i].run(o.id)
    const exp = STEPS[depth - 1]
    assert(`avanza ${depth} → ${exp.status} | inv +${exp.inv}`, (await getOrd(o.id)).status === exp.status && await stockOf(PID) === s0 + exp.inv)
    await act(o.id, 'reopen')
    assert(`  reabrir → PENDIENTE | inv s0`, (await getOrd(o.id)).status === 'PENDIENTE' && await stockOf(PID) === s0)
    await act(o.id, 'advance')
    assert(`  re-avanzar tras reabrir → PAGADA`, (await getOrd(o.id)).status === 'PAGADA')
  }

  // ── TERMINALES con carga: parcial e inconsistente ──
  console.log('\n▼ TERMINALES — parcial / inconsistente (carga y revierte exacto)')
  {
    const s0 = await stockOf(PID); const id = await toEnCamino(10)
    await receive(id, 6, true); assert('parcial +6', await stockOf(PID) === s0 + 6)
    await receive(id, 2, true); assert('parcial +2 → +8', await stockOf(PID) === s0 + 8)
    await act(id, 'reopen'); assert('reabrir revierte +8 → s0', await stockOf(PID) === s0)
  }
  {
    const s0 = await stockOf(PID); const id = await toEnCamino(10)
    await receive(id, 7, false); assert('RECIBIDA 7/10 sin cargar', await stockOf(PID) === s0)
    await act(id, 'inconsistente', '7 de 10'); assert('INCONSISTENTE carga +7', (await getOrd(id)).status === 'INCONSISTENTE' && await stockOf(PID) === s0 + 7)
    await act(id, 'reopen'); assert('reabrir revierte +7 exacto', await stockOf(PID) === s0)
  }

  // ── USUARIO NORMAL: parciales repetidas + reaperturas ──
  console.log('\n▼ USUARIO NORMAL (wilmer) — parciales repetidas + reaperturas')
  async function enCaminoAs(qty) { await login('admin', 'admin123'); const id = await toEnCamino(qty); await login('wilmer', 'test1234'); return id }
  const w = await login('wilmer', 'test1234'); assert('login wilmer (user)', w?.role === 'user')

  // S1: parciales repetidas → reabrir recepción
  {
    const id = await enCaminoAs(20); const s0 = await stockOf(PID)
    await receive(id, 5, true); await receive(id, 5, true); await receive(id, 4, true)
    assert('parciales +5+5+4 → +14', (await getOrd(id)).status === 'PARCIAL' && await stockOf(PID) === s0 + 14)
    await act(id, 'reset_reception'); assert('reabrir recepción → EN_CAMINO, inv s0', (await getOrd(id)).status === 'EN_CAMINO' && await stockOf(PID) === s0)
  }
  // S2: parciales → deshacer último
  {
    const id = await enCaminoAs(20); const s0 = await stockOf(PID)
    await receive(id, 8, true); await receive(id, 3, true)
    assert('parciales +11', await stockOf(PID) === s0 + 11)
    await act(id, 'undo'); assert('deshacer → EN_CAMINO, inv s0', (await getOrd(id)).status === 'EN_CAMINO' && await stockOf(PID) === s0)
  }
  // S3: parcial → finalizar incompleto → reabrir recepción
  {
    const id = await enCaminoAs(20); const s0 = await stockOf(PID)
    await receive(id, 6, true); assert('parcial +6', await stockOf(PID) === s0 + 6)
    await act(id, 'finalize'); assert('finalizar incompleto sigue +6', (await getOrd(id)).status === 'FINALIZADA' && await stockOf(PID) === s0 + 6)
    await act(id, 'reset_reception'); assert('reabrir recepción revierte +6 → s0', (await getOrd(id)).status === 'EN_CAMINO' && await stockOf(PID) === s0)
  }
  // S4 (EDGE): desde PARCIAL, "completa" se fuerza a parcial (sin fantasma)
  {
    const id = await enCaminoAs(20); const s0 = await stockOf(PID)
    await receive(id, 5, true); assert('parcial +5', await stockOf(PID) === s0 + 5)
    await receive(id, 5, false); assert('completa-forzada-parcial → PARCIAL +10', (await getOrd(id)).status === 'PARCIAL' && await stockOf(PID) === s0 + 10)
    await act(id, 'finalize'); assert('finalizar no recarga (+10)', await stockOf(PID) === s0 + 10)
    await login('admin', 'admin123'); await act(id, 'reopen')
    assert('reabrir admin revierte TODO → s0 (sin fantasma)', await stockOf(PID) === s0)
    await login('wilmer', 'test1234')
  }
  // S5: permisos — wilmer NO puede 'advance' ni 'reopen' admin
  {
    const id = await enCaminoAs(10)
    const f1 = await act(id, 'advance'); assert('wilmer advance prohibido (403)', f1.status === 403, `status ${f1.status}`)
    const f2 = await act(id, 'reopen');  assert('wilmer reopen admin prohibido (403)', f2.status === 403, `status ${f2.status}`)
  }

  // ── Limpieza ──
  console.log('\n▼ LIMPIEZA')
  await login('admin', 'admin123')
  for (const id of created) { const del = await api(`/api/purchases/${id}`, { method: 'DELETE' }); assert(`eliminar PO #${id}`, del.status === 200, JSON.stringify(del.data)) }

  console.log(`\n${'='.repeat(52)}\nRESULTADO: ${passed.length} ✓   ${failed.length} ❌`)
  if (failed.length) { console.log('FALLOS:'); failed.forEach(f => console.log('  - ' + f)) }
  process.exit(failed.length ? 1 : 0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
