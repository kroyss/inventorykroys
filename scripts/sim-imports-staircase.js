// Simulador ESCALERA — avanza N estados y reabre, para N=1,2,3,...,9, verificando
// estado + inventario en cada profundidad y tras cada reapertura.
// También verifica carga/descarga de inventario en parciales/inconsistente y en la
// recepción del usuario normal (reabrir recepción / deshacer).
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
const receive = (id, items, partial) => api(`/api/imports/${id}/receive`, { method: 'POST', body: JSON.stringify({ items, partial }) })
const finalize = (id, b) => api(`/api/imports/${id}/status/finalize`, { method: 'PUT', body: JSON.stringify(b || { status: 'FINALIZADA' }) })
async function uploadFile(id) { const fd = new FormData(); fd.append('file', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), 'f.png'); return (await fetch(`${url}/api/imports/${id}/files`, { method: 'POST', headers: { Cookie: ck() }, body: fd })).status }

const created = []
let PID

;(async () => {
  const admin = await login('admin', 'admin123'); if (!admin) { console.log('login admin falló'); process.exit(1) }
  const product = (await api('/api/products')).data.find(p => p.is_active)
  const sup = (await api('/api/imports/suppliers')).data?.[0] || (await api('/api/suppliers')).data[0]
  PID = product.id
  console.log(`✓ admin · Producto ${product.code} (id=${PID}) · ${sup.name}\n`)
  async function newImp(qty) { const res = await api('/api/imports', { method: 'POST', body: JSON.stringify({ supplier_id: sup.id, origin_country: 'China', items: [{ product_id: PID, quantity: qty, unit_cost_usd: 3 }] }) }); const o = (await api('/api/imports')).data.find(x => x.id === res.data.id); created.push(o.id); return o }

  // Cadena de avance: cada paso lleva al estado indicado con el delta de inventario esperado (acumulado)
  const STEPS = [
    { status: 'PAGO_PARCIAL',        inv: 0,  run: async id => { await pay(id, '50', 50) } },
    { status: 'ESPERANDO_FOTOS',     inv: 0,  run: async id => { await setStatus(id, { status: 'ESPERANDO_FOTOS' }) } },
    { status: 'PAGADA',              inv: 0,  run: async id => { await uploadFile(id); await pay(id, '100', 100) } },
    { status: 'EN_TRANSITO',         inv: 0,  run: async id => { await setStatus(id, { status: 'EN_TRANSITO', tracking_number: 'T' }) } },
    { status: 'ADUANA',              inv: 0,  run: async id => { await setStatus(id, { status: 'ADUANA' }) } },
    { status: 'EN_IMPORTADOR_PAGAR', inv: 0,  run: async id => { await setStatus(id, { status: 'EN_IMPORTADOR_PAGAR' }) } },
    { status: 'EN_CAMINO',           inv: 0,  run: async id => { await setStatus(id, { status: 'EN_CAMINO', shipping_cost: 10, box_count: 1 }) } },
    { status: 'RECIBIDA',            inv: 0,  run: async id => { await receive(id, [{ product_id: PID, received_qty: 10 }], false) } },
    { status: 'FINALIZADA',          inv: 10, run: async id => { await finalize(id) } },
  ]

  console.log('▼ ESCALERA — avanzar N estados y reabrir (N=1..9)')
  for (let depth = 1; depth <= STEPS.length; depth++) {
    const s0 = await stockOf(PID)
    const imp = await newImp(10)
    for (let i = 0; i < depth; i++) await STEPS[i].run(imp.id)
    const exp = STEPS[depth - 1]
    const o = await getImp(imp.id)
    const st = await stockOf(PID)
    assert(`avanza ${depth} → ${exp.status} | inv ${exp.inv >= 0 ? '+' : ''}${exp.inv}`,
      o.status === exp.status && st === s0 + exp.inv, `got ${o.status}/${st} exp ${exp.status}/${s0 + exp.inv}`)
    // reabrir y comprobar regreso a PENDIENTE + inventario restaurado
    await setStatus(imp.id, { status: 'REABIERTA' })
    const o2 = await getImp(imp.id)
    const st2 = await stockOf(PID)
    assert(`  reabrir desde ${exp.status} → PENDIENTE | inv restaurado a s0`,
      o2.status === 'PENDIENTE' && st2 === s0, `got ${o2.status}/${st2} exp PENDIENTE/${s0}`)
    // re-avanzar un paso para confirmar que el reset quedó limpio
    await pay(imp.id, '50', 50)
    assert(`  re-avanzar tras reabrir → PAGO_PARCIAL`, (await getImp(imp.id)).status === 'PAGO_PARCIAL')
  }

  console.log('\n▼ TERMINALES CON CARGA — parcial e inconsistente (carga y revierte exacto)')
  async function toEnCamino(id) { await pay(id, '100', 100); await setStatus(id, { status: 'EN_TRANSITO', tracking_number: 'T' }); await setStatus(id, { status: 'ADUANA' }); await setStatus(id, { status: 'EN_IMPORTADOR_PAGAR' }); await setStatus(id, { status: 'EN_CAMINO', shipping_cost: 10, box_count: 1 }) }
  // Parcial acumulada: +6, +2 = +8, reabrir revierte
  {
    const s0 = await stockOf(PID); const imp = await newImp(10); await toEnCamino(imp.id)
    await receive(imp.id, [{ product_id: PID, received_qty: 6 }], true)
    assert('parcial +6 carga inmediato', await stockOf(PID) === s0 + 6)
    await receive(imp.id, [{ product_id: PID, received_qty: 2 }], true)
    assert('parcial +2 acumula → +8', await stockOf(PID) === s0 + 8)
    await setStatus(imp.id, { status: 'REABIERTA' })
    assert('reabrir parcial revierte +8 → s0', await stockOf(PID) === s0)
  }
  // Inconsistente desde RECIBIDA: carga lo recibido, reabrir revierte exacto
  {
    const s0 = await stockOf(PID); const imp = await newImp(10); await toEnCamino(imp.id)
    await receive(imp.id, [{ product_id: PID, received_qty: 7 }], false)
    assert('RECIBIDA 7/10 sin cargar aún', await stockOf(PID) === s0)
    await finalize(imp.id, { status: 'INCONSISTENTE', incomplete_note: '7/10' })
    assert('INCONSISTENTE carga +7', await stockOf(PID) === s0 + 7)
    await setStatus(imp.id, { status: 'REABIERTA' })
    assert('reabrir inconsistente revierte +7 exacto', await stockOf(PID) === s0)
  }

  console.log('\n▼ USUARIO NORMAL — recepción: carga/descarga en cada cambio y reapertura')
  const impN = await newImp(10); await toEnCamino(impN.id)
  const base = await stockOf(PID)
  const w = await login('wilmer', 'test1234'); assert('login wilmer (user)', w?.role === 'user')

  // recibir completo (no carga) → finalizar (+10) → reabrir recepción (revierte)
  await receive(impN.id, [{ product_id: PID, received_qty: 10 }], false)
  assert('recibir → RECIBIDA, inv sin cambio', (await getImp(impN.id)).status === 'RECIBIDA' && await stockOf(PID) === base)
  await finalize(impN.id)
  assert('finalizar → FINALIZADA, inv +10', (await getImp(impN.id)).status === 'FINALIZADA' && await stockOf(PID) === base + 10)
  await setStatus(impN.id, { status: 'RESET_RECEPTION' })
  assert('reabrir recepción → EN_CAMINO, inv revertido', (await getImp(impN.id)).status === 'EN_CAMINO' && await stockOf(PID) === base)

  // parcial +5 → deshacer último (revierte) → EN_CAMINO
  await receive(impN.id, [{ product_id: PID, received_qty: 5 }], true)
  assert('parcial +5 carga', (await getImp(impN.id)).status === 'PARCIAL' && await stockOf(PID) === base + 5)
  await setStatus(impN.id, { status: 'UNDO' })
  assert('deshacer parcial → EN_CAMINO, inv revertido', (await getImp(impN.id)).status === 'EN_CAMINO' && await stockOf(PID) === base)

  console.log('\n▼ LIMPIEZA')
  await login('admin', 'admin123')
  for (const id of created) { const del = await api(`/api/imports/${id}`, { method: 'DELETE' }); assert(`eliminar IMP #${id}`, del.status === 200, JSON.stringify(del.data)) }

  console.log(`\n${'='.repeat(52)}\nRESULTADO: ${passed.length} ✓   ${failed.length} ❌`)
  if (failed.length) { console.log('FALLOS:'); failed.forEach(f => console.log('  - ' + f)) }
  process.exit(failed.length ? 1 : 0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
