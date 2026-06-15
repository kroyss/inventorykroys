const COOKIES = {}
const url = 'http://localhost:3000'
function parseCookies(res) {
  const sc = res.headers.getSetCookie?.() ?? []
  for (const c of sc) {
    const [kv] = c.split(';')
    const [k, v] = kv.split('=')
    if (k && v !== undefined) COOKIES[k.trim()] = v.trim()
  }
}
function cookie() { return Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join('; ') }
async function api(p, init = {}) {
  const res = await fetch(url + p, { ...init, headers: { 'Cookie': cookie(), 'Content-Type': 'application/json', ...(init.headers || {}) } })
  const txt = await res.text()
  let data; try { data = txt ? JSON.parse(txt) : null } catch { data = txt }
  return { status: res.status, data }
}
const passed = [], failed = []
async function check(label, fn) {
  try { await fn(); console.log('  ✓ ' + label); passed.push(label) }
  catch (e) { console.log('  ❌ ' + label + ': ' + e.message); failed.push({ label, error: e.message }) }
}

;(async () => {
  let r = await fetch(url + '/api/auth/csrf'); parseCookies(r)
  const { csrfToken } = await r.json()
  r = await fetch(url + '/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookie() },
    body: new URLSearchParams({ csrfToken, username: 'admin', password: 'admin123', country: 'VE', json: 'true', callbackUrl: '/dashboard' }).toString(),
    redirect: 'manual',
  })
  parseCookies(r)

  const product = (await api('/api/products')).data.find(p => p.is_active && p.quantity > 5)
  const initialStock = product.quantity
  let impSup = (await api('/api/imports/suppliers')).data[0]
  let importSupplierId = impSup?.id
  if (!importSupplierId) {
    const c = await api('/api/suppliers', { method: 'POST', body: JSON.stringify({ name: 'TEST IMP ' + Date.now() }) })
    importSupplierId = c.data.id
  }
  console.log(`Using product ${product.code} stock=${initialStock} | import supplier id=${importSupplierId}`)

  console.log('\n▼ IMPORTS — full 12-state flow')
  let impId
  await check('POST /api/imports', async () => {
    const { status, data } = await api('/api/imports', {
      method: 'POST',
      body: JSON.stringify({
        supplier_id: importSupplierId, origin_country: 'CN', notes: 'e2e',
        items: [{ product_id: product.id, quantity: 5, unit_cost_usd: 10 }],
      }),
    })
    if (status !== 201) throw new Error(`status ${status}: ${JSON.stringify(data)}`)
    impId = data.id
  })
  await check('Payment 50% → status=PAGO_PARCIAL', async () => {
    const { status } = await api(`/api/imports/${impId}/payment`, { method: 'PUT', body: JSON.stringify({ payment_step: '50', amount: 25 }) })
    if (status !== 200) throw new Error(`status ${status}`)
    const o = (await api('/api/imports')).data.find(x => x.id === impId)
    if (!o.paid_50_done) throw new Error('paid_50_done not set')
    if (o.status !== 'PAGO_PARCIAL') throw new Error(`expected PAGO_PARCIAL, got ${o.status}`)
  })
  await check('Payment 100% → status=PAGADA', async () => {
    const { status } = await api(`/api/imports/${impId}/payment`, { method: 'PUT', body: JSON.stringify({ payment_step: '100', amount: 25 }) })
    if (status !== 200) throw new Error(`status ${status}`)
    const o = (await api('/api/imports')).data.find(x => x.id === impId)
    if (o.status !== 'PAGADA') throw new Error(`expected PAGADA, got ${o.status}`)
  })
  await check('PAGADA → EN_TRANSITO with tracking', async () => {
    const { status } = await api(`/api/imports/${impId}/status`, { method: 'PUT', body: JSON.stringify({ status: 'EN_TRANSITO', tracking_number: 'TRK-E2E-001' }) })
    if (status !== 200) throw new Error(`status ${status}`)
  })
  await check('EN_TRANSITO → ADUANA', async () => {
    const { status } = await api(`/api/imports/${impId}/status`, { method: 'PUT', body: JSON.stringify({ status: 'ADUANA' }) })
    if (status !== 200) throw new Error(`status ${status}`)
  })
  await check('ADUANA → EN_IMPORTADOR_PAGAR', async () => {
    const { status } = await api(`/api/imports/${impId}/status`, { method: 'PUT', body: JSON.stringify({ status: 'EN_IMPORTADOR_PAGAR' }) })
    if (status !== 200) throw new Error(`status ${status}`)
  })
  await check('EN_CAMINO rejects without shipping_cost+box_count', async () => {
    const r1 = await api(`/api/imports/${impId}/status`, { method: 'PUT', body: JSON.stringify({ status: 'EN_CAMINO' }) })
    if (r1.status === 200) throw new Error(`should have rejected, got 200`)
  })
  await check('EN_CAMINO with shipping_cost+box_count', async () => {
    const { status } = await api(`/api/imports/${impId}/status`, { method: 'PUT', body: JSON.stringify({ status: 'EN_CAMINO', shipping_cost: 50, box_count: 1 }) })
    if (status !== 200) throw new Error(`status ${status}`)
  })
  await check('Receive partial loads inventory (+5)', async () => {
    const before = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    const { status } = await api(`/api/imports/${impId}/receive`, { method: 'POST', body: JSON.stringify({ partial: true, items: [{ product_id: product.id, received_qty: 5 }] }) })
    if (status !== 200) throw new Error(`status ${status}`)
    const after = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (after !== before + 5) throw new Error(`stock expected +5: ${before} → ${after}`)
  })
  await check('Finalize from PARCIAL does NOT double-load', async () => {
    const before = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    const { status } = await api(`/api/imports/${impId}/status/finalize`, { method: 'PUT', body: JSON.stringify({ status: 'FINALIZADA' }) })
    if (status !== 200) throw new Error(`status ${status}`)
    const after = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (after !== before) throw new Error(`expected no change: ${before} → ${after}`)
  })
  await check('Reopen reverts inventory (-5)', async () => {
    const before = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    const { status } = await api(`/api/imports/${impId}/status`, { method: 'PUT', body: JSON.stringify({ status: 'REABIERTA' }) })
    if (status !== 200) throw new Error(`status ${status}`)
    const after = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (after !== before - 5) throw new Error(`expected -5: ${before} → ${after}`)
  })
  await check('Notes update only', async () => {
    const { status } = await api(`/api/imports/${impId}/notes`, { method: 'PUT', body: JSON.stringify({ notes: 'updated note' }) })
    if (status !== 200) throw new Error(`status ${status}`)
  })
  await check('DELETE import (cleanup)', async () => {
    const { status } = await api(`/api/imports/${impId}`, { method: 'DELETE' })
    if (status !== 200) throw new Error(`status ${status}`)
  })
  await check('Stock back to initial', async () => {
    const final = (await api('/api/inventory')).data.find(i => i.product_id === product.id).quantity
    if (final !== initialStock) throw new Error(`drift: ${initialStock} → ${final}`)
  })

  console.log('\n▼ RATES (VE only)')
  await check('GET /rates/latest', async () => {
    const { status, data } = await api('/api/rates/latest')
    if (status !== 200) throw new Error(`status ${status}`)
    if (typeof data.official_rate !== 'number') throw new Error('official_rate not number')
  })
  await check('GET /rates/history', async () => {
    const { status, data } = await api('/api/rates/history?limit=5')
    if (status !== 200) throw new Error(`status ${status}`)
    if (!Array.isArray(data)) throw new Error('not array')
  })

  console.log('\n────────────────────────')
  console.log(`PASSED: ${passed.length}   FAILED: ${failed.length}`)
  if (failed.length) for (const f of failed) console.log(`  ${f.label} → ${f.error}`)
  process.exit(failed.length ? 1 : 0)
})().catch(e => { console.error('CRASH:', e.stack); process.exit(1) })
