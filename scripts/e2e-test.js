// End-to-end runtime test — exercises real workflows
// Usage: node scripts/e2e-test.js
const COOKIES = {}
const url = 'http://localhost:3000'

const passed = []
const failed = []

function parseCookies(res) {
  const sc = res.headers.getSetCookie?.() ?? []
  for (const c of sc) {
    const [kv] = c.split(';')
    const [k, v] = kv.split('=')
    if (k && v !== undefined) COOKIES[k.trim()] = v.trim()
  }
}
function cookie() {
  return Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join('; ')
}

async function check(label, fn) {
  try {
    await fn()
    console.log(`  ✓ ${label}`)
    passed.push(label)
  } catch (e) {
    console.log(`  ❌ ${label}: ${e.message}`)
    failed.push({ label, error: e.message })
  }
}

async function api(path, init = {}) {
  const res = await fetch(url + path, {
    ...init,
    headers: { 'Cookie': cookie(), 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const txt = await res.text()
  let data
  try { data = txt ? JSON.parse(txt) : null } catch { data = txt }
  return { status: res.status, data }
}

;(async () => {
  // ── Login ────────────────────────────────────────────────────────────────
  console.log('\n▼ AUTH')
  let r = await fetch(url + '/api/auth/csrf'); parseCookies(r)
  const { csrfToken } = await r.json()
  r = await fetch(url + '/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookie() },
    body: new URLSearchParams({ csrfToken, username: 'admin', password: 'admin123', country: 'VE', json: 'true', callbackUrl: '/dashboard' }).toString(),
    redirect: 'manual',
  })
  parseCookies(r)
  await check('login admin VE', async () => {
    const { status, data } = await api('/api/auth/session')
    if (status !== 200 || !data?.user) throw new Error('no session')
    if (data.user.role !== 'admin' || data.user.country !== 'VE') throw new Error('wrong claims')
  })

  // Get a product with stock to use in tests
  const productsRes = await api('/api/products')
  const product     = productsRes.data.find(p => p.is_active && p.quantity > 5)
  if (!product) { console.log('No product with stock found, abort'); process.exit(1) }
  console.log(`Using product ${product.code} (id=${product.id}, stock=${product.quantity})`)
  const initialStock = product.quantity

  const supRes  = await api('/api/suppliers')
  const supplier = supRes.data[0]
  console.log(`Using supplier ${supplier.name} (id=${supplier.id})`)

  // ── SALES (BORRADOR → reabrir → eliminar) ─────────────────────────────
  console.log('\n▼ SALES — normal flow')
  let saleId
  await check('POST /api/sales (BORRADOR)', async () => {
    const { status, data } = await api('/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        ml_order_number: 'TEST-NORMAL-' + Date.now(),
        customer_name:   'E2E Test',
        discount_percent: 10,
        items: [{ product_id: product.id, quantity: 2, unit_price: 100 }],
      }),
    })
    if (status !== 201) throw new Error(`status ${status}: ${JSON.stringify(data)}`)
    saleId = data.id
  })

  await check('Sale total respects discount (200 * 0.9 = 180)', async () => {
    const { data } = await api('/api/sales')
    const s = data.find(x => x.id === saleId)
    if (Math.abs(s.total_amount - 180) > 0.01) throw new Error(`got ${s.total_amount}`)
  })

  await check('PUT /api/sales/[id] (editar BORRADOR)', async () => {
    const { status } = await api(`/api/sales/${saleId}`, {
      method: 'PUT',
      body: JSON.stringify({
        ml_order_number: 'TEST-NORMAL-EDITED-' + Date.now(),
        customer_name:   'Edited',
        discount_percent: 0,
        items: [{ product_id: product.id, quantity: 1, unit_price: 50 }],
      }),
    })
    if (status !== 200) throw new Error(`status ${status}`)
  })

  await check('Sale total after edit (50)', async () => {
    const { data } = await api('/api/sales')
    const s = data.find(x => x.id === saleId)
    if (Math.abs(s.total_amount - 50) > 0.01) throw new Error(`got ${s.total_amount}`)
  })

  await check('PUT status PAGO_VERIFICADO', async () => {
    const { status } = await api(`/api/sales/${saleId}/status`, {
      method: 'PUT', body: JSON.stringify({ status: 'PAGO_VERIFICADO' }),
    })
    if (status !== 200) throw new Error(`status ${status}`)
  })

  await check('PUT status PROCESADA (deducts stock)', async () => {
    const before = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    const { status } = await api(`/api/sales/${saleId}/status`, {
      method: 'PUT', body: JSON.stringify({ status: 'PROCESADA' }),
    })
    if (status !== 200) throw new Error(`status ${status}`)
    const after = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (after !== before - 1) throw new Error(`stock should drop by 1: before ${before}, after ${after}`)
  })

  await check('PUT status REABIERTA (restores stock)', async () => {
    const before = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    const { status } = await api(`/api/sales/${saleId}/status`, {
      method: 'PUT', body: JSON.stringify({ status: 'REABIERTA' }),
    })
    if (status !== 200) throw new Error(`status ${status}`)
    const after = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (after !== before + 1) throw new Error(`stock should go up by 1: before ${before}, after ${after}`)
  })

  await check('DELETE /api/sales/[id] (only BORRADOR)', async () => {
    const { status } = await api(`/api/sales/${saleId}`, { method: 'DELETE' })
    if (status !== 200) throw new Error(`status ${status}`)
  })

  // ── SALES LOCAL — should skip directly to DESCARGADA_LOCAL ─────────────
  console.log('\n▼ SALES — LOCAL flow')
  let localSaleId
  await check('GET next-local-number', async () => {
    const { status, data } = await api('/api/sales/next-local-number')
    if (status !== 200) throw new Error(`status ${status}`)
    if (!data.next_local.startsWith('LOCAL-')) throw new Error(`bad format: ${data.next_local}`)
  })

  await check('POST LOCAL sale', async () => {
    const { status, data } = await api('/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        ml_order_number: (await api('/api/sales/next-local-number')).data.next_local,
        customer_name:   'LOCAL TEST',
        discount_percent: 0,
        items: [{ product_id: product.id, quantity: 1, unit_price: 25 }],
      }),
    })
    if (status !== 201) throw new Error(`status ${status}: ${JSON.stringify(data)}`)
    localSaleId = data.id
  })

  await check('LOCAL verify deducts stock + skips to DESCARGADA_LOCAL', async () => {
    const before = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    const { status, data } = await api(`/api/sales/${localSaleId}/status`, {
      method: 'PUT', body: JSON.stringify({ status: 'PAGO_VERIFICADO' }),
    })
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(data)}`)
    const after = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (after !== before - 1) throw new Error(`stock didn't drop: ${before} → ${after}`)
    const sale = (await api('/api/sales')).data.find(x => x.id === localSaleId)
    if (sale.status !== 'DESCARGADA_LOCAL') throw new Error(`status is ${sale.status}, expected DESCARGADA_LOCAL`)
  })

  await check('LOCAL reopen restores stock', async () => {
    const before = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    const { status } = await api(`/api/sales/${localSaleId}/status`, {
      method: 'PUT', body: JSON.stringify({ status: 'REABIERTA' }),
    })
    if (status !== 200) throw new Error(`status ${status}`)
    const after = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (after !== before + 1) throw new Error(`stock didn't restore: ${before} → ${after}`)
    await api(`/api/sales/${localSaleId}`, { method: 'DELETE' })  // cleanup
  })

  // ── PURCHASE: create → advance → receive → finalize ──────────────────────
  console.log('\n▼ PURCHASES — full flow')
  let purchId
  await check('POST /api/purchases', async () => {
    const { status, data } = await api('/api/purchases', {
      method: 'POST',
      body: JSON.stringify({
        supplier_id: supplier.id,
        notes: 'e2e test',
        total_paid: 0,
        items: [{ product_id: product.id, quantity: 5, unit_cost_usd: 10 }],
      }),
    })
    if (status !== 201) throw new Error(`status ${status}: ${JSON.stringify(data)}`)
    purchId = data.id
  })

  await check('PENDIENTE → PAGADA (action: advance)', async () => {
    const { status } = await api(`/api/purchases/${purchId}/status`, {
      method: 'PUT', body: JSON.stringify({ action: 'advance' }),
    })
    if (status !== 200) throw new Error(`status ${status}`)
  })

  await check('PAGADA → EN_CAMINO', async () => {
    const { status } = await api(`/api/purchases/${purchId}/status`, {
      method: 'PUT', body: JSON.stringify({ action: 'advance' }),
    })
    if (status !== 200) throw new Error(`status ${status}`)
  })

  await check('EN_CAMINO → /receive partial (3 of 5, loads inventory)', async () => {
    const before = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    const { status, data } = await api(`/api/purchases/${purchId}/receive`, {
      method: 'POST',
      body: JSON.stringify({ partial: true, items: [{ product_id: product.id, received_qty: 3 }] }),
    })
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(data)}`)
    const after = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (after !== before + 3) throw new Error(`stock should rise by 3: ${before} → ${after}`)
  })

  await check('PARCIAL → finalize (no double-load)', async () => {
    const before = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    const { status, data } = await api(`/api/purchases/${purchId}/status`, {
      method: 'PUT', body: JSON.stringify({ action: 'finalize' }),
    })
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(data)}`)
    const after = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (after !== before) throw new Error(`stock should NOT change at finalize from PARCIAL: ${before} → ${after}`)
  })

  await check('finalize set is_incomplete (received 3 of 5 ordered)', async () => {
    const { data: orders } = await api('/api/purchases')
    const po = orders.find(o => o.id === purchId)
    if (!po.is_incomplete) throw new Error('is_incomplete should be TRUE')
    if (!po.notes?.includes('DIFERENCIAS')) throw new Error(`notes missing DIFERENCIAS: ${po.notes}`)
  })

  await check('FINALIZADA → reopen reverts inventory', async () => {
    const before = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    const { status } = await api(`/api/purchases/${purchId}/status`, {
      method: 'PUT', body: JSON.stringify({ action: 'reopen' }),
    })
    if (status !== 200) throw new Error(`status ${status}`)
    const after = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (after !== before - 3) throw new Error(`stock should drop by 3 on reopen: ${before} → ${after}`)
  })

  await check('DELETE purchase (cleanup)', async () => {
    const { status } = await api(`/api/purchases/${purchId}`, { method: 'DELETE' })
    if (status !== 200) throw new Error(`status ${status}`)
  })

  // ── INVENTORY ADJUST ────────────────────────────────────────────────────
  console.log('\n▼ INVENTORY')
  await check('POST /inventory/[id]/adjust IN +1', async () => {
    const before = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    const { status, data } = await api(`/api/inventory/${product.id}/adjust`, {
      method: 'POST', body: JSON.stringify({ movement_type: 'IN', quantity: 1, notes: 'e2e' }),
    })
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(data)}`)
    const after = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (after !== before + 1) throw new Error(`stock didn't increase: ${before} → ${after}`)
  })

  await check('POST /inventory/[id]/adjust OUT -1', async () => {
    const before = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    const { status, data } = await api(`/api/inventory/${product.id}/adjust`, {
      method: 'POST', body: JSON.stringify({ movement_type: 'OUT', quantity: 1, notes: 'e2e' }),
    })
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(data)}`)
    const after = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (after !== before - 1) throw new Error(`stock didn't decrease: ${before} → ${after}`)
  })

  await check('OUT validates stock (rejects when insufficient)', async () => {
    const cur = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    const { status, data } = await api(`/api/inventory/${product.id}/adjust`, {
      method: 'POST', body: JSON.stringify({ movement_type: 'OUT', quantity: cur + 100, notes: 'over' }),
    })
    if (status !== 400) throw new Error(`expected 400, got ${status}: ${JSON.stringify(data)}`)
    if (!String(data?.error || '').toLowerCase().includes('insuficiente')) throw new Error(`bad error msg: ${data?.error}`)
  })

  // ── FINAL STOCK VERIFICATION ─────────────────────────────────────────────
  console.log('\n▼ FINAL CHECK')
  await check('Stock returns to initial value after all tests', async () => {
    const final = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (final !== initialStock) throw new Error(`drift: started at ${initialStock}, ended at ${final}`)
  })

  // ── REPORTS ──────────────────────────────────────────────────────────────
  console.log('\n▼ REPORTS')
  const today = new Date().toISOString().slice(0, 10)
  const monthAgo = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10) })()
  for (const ep of [
    `/api/reports/sales?date_from=${monthAgo}&date_to=${today}`,
    `/api/reports/purchases?date_from=${monthAgo}&date_to=${today}`,
    `/api/reports/top-products?date_from=${monthAgo}&date_to=${today}&top=5`,
    `/api/reports/inventory`,
    `/api/reports/stock-analysis`,
    `/api/reports/in-transit`,
    `/api/reports/chart-data?period=month`,
    `/api/reports/chart-data?period=quarter`,
    `/api/reports/chart-data?period=year`,
    `/api/reports/chart-data?period=today`,
  ]) {
    await check(`GET ${ep}`, async () => {
      const { status, data } = await api(ep)
      if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(data)?.slice(0,100)}`)
    })
  }

  // ── RESULTS ──────────────────────────────────────────────────────────────
  console.log(`\n────────────────────────────────────────`)
  console.log(`PASSED: ${passed.length}`)
  console.log(`FAILED: ${failed.length}`)
  if (failed.length > 0) {
    console.log('\nFailures:')
    for (const f of failed) console.log(`  ${f.label}\n    → ${f.error}`)
  }
  process.exit(failed.length > 0 ? 1 : 0)
})().catch(e => { console.error('SUITE CRASH:', e.stack); process.exit(1) })
