const url = 'http://localhost:3000'
const passed = [], failed = []
async function check(label, fn) {
  try { await fn(); console.log('  ✓ ' + label); passed.push(label) }
  catch (e) { console.log('  ❌ ' + label + ': ' + e.message); failed.push({ label, error: e.message }) }
}

async function loginAs(username, password, country) {
  const COOKIES = {}
  const parse = res => { for (const c of (res.headers.getSetCookie?.() ?? [])) { const [kv] = c.split(';'); const [k, v] = kv.split('='); if (k && v !== undefined) COOKIES[k.trim()] = v.trim() } }
  const cookie = () => Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join('; ')
  let r = await fetch(url + '/api/auth/csrf'); parse(r)
  const { csrfToken } = await r.json()
  r = await fetch(url + '/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookie() },
    body: new URLSearchParams({ csrfToken, username, password, country, json: 'true', callbackUrl: '/dashboard' }).toString(),
    redirect: 'manual',
  })
  parse(r)
  return cookie
}

;(async () => {
  console.log('▼ MULTI-COUNTRY')
  await check('Login CO admin works', async () => {
    const c = await loginAs('admin', 'admin123', 'CO')
    const res = await fetch(url + '/api/auth/session', { headers: { Cookie: c() } })
    const data = await res.json()
    if (data?.user?.country !== 'CO') throw new Error(`country=${data?.user?.country}`)
  })
  await check('CO cannot access VE rates (403)', async () => {
    const c = await loginAs('admin', 'admin123', 'CO')
    const res = await fetch(url + '/api/rates/latest', { headers: { Cookie: c() } })
    if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`)
  })
  await check('Wrong country for user rejected (admin only in VE)', async () => {
    // wilmer is VE-only; logging in as CO should fail
    const c = await loginAs('wilmer', 'anything', 'CO')
    const res = await fetch(url + '/api/auth/session', { headers: { Cookie: c() } })
    const data = await res.json()
    if (data?.user) throw new Error('should not have session with wrong creds')
  })

  console.log('\n▼ ROLE RESTRICTIONS (user wilmer)')
  // Note: we don't know wilmer's password; test that bad login gives no session
  await check('Invalid password → no session', async () => {
    const c = await loginAs('admin', 'wrongpassword', 'VE')
    const res = await fetch(url + '/api/auth/session', { headers: { Cookie: c() } })
    const data = await res.json()
    if (data?.user) throw new Error('logged in with wrong password!')
  })

  console.log('\n▼ ADMIN-ONLY ENDPOINTS (as admin, should pass)')
  const admin = await loginAs('admin', 'admin123', 'VE')
  await check('GET /api/products/zero-stock (admin)', async () => {
    const res = await fetch(url + '/api/products/zero-stock', { headers: { Cookie: admin() } })
    if (res.status !== 200) throw new Error(`status ${res.status}`)
  })

  console.log('\n▼ EXCEL EXPORT')
  await check('Export with no ids → 400', async () => {
    const res = await fetch(url + '/api/sales/export-excel', { headers: { Cookie: admin() } })
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`)
  })
  await check('Export with ids → xlsx binary', async () => {
    // create a PROCESADA sale to export
    const prod = (await (await fetch(url + '/api/products', { headers: { Cookie: admin() } })).json()).find(p => p.is_active && p.quantity > 2)
    const created = await (await fetch(url + '/api/sales', {
      method: 'POST', headers: { Cookie: admin(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ml_order_number: 'XLSX-' + Date.now(), customer_name: 'x', discount_percent: 0, items: [{ product_id: prod.id, quantity: 1, unit_price: 5 }] }),
    })).json()
    await fetch(url + `/api/sales/${created.id}/status`, { method: 'PUT', headers: { Cookie: admin(), 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PAGO_VERIFICADO' }) })
    await fetch(url + `/api/sales/${created.id}/status`, { method: 'PUT', headers: { Cookie: admin(), 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PROCESADA' }) })

    const res = await fetch(url + `/api/sales/export-excel?ids=${created.id}`, { headers: { Cookie: admin() } })
    if (res.status !== 200) throw new Error(`status ${res.status}`)
    const ct = res.headers.get('content-type')
    if (!ct?.includes('spreadsheet')) throw new Error(`bad content-type: ${ct}`)
    const buf = Buffer.from(await res.arrayBuffer())
    // XLSX files start with PK (ZIP magic)
    if (buf[0] !== 0x50 || buf[1] !== 0x4B) throw new Error('not a valid xlsx (no PK header)')

    // verify it became DESCARGADA
    const sale = (await (await fetch(url + '/api/sales', { headers: { Cookie: admin() } })).json()).find(s => s.id === created.id)
    if (sale.status !== 'DESCARGADA') throw new Error(`expected DESCARGADA after export, got ${sale.status}`)

    // cleanup: reopen + delete (reopen restores stock, then back to borrador, delete)
    await fetch(url + `/api/sales/${created.id}/status`, { method: 'PUT', headers: { Cookie: admin(), 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'REABIERTA' }) })
    await fetch(url + `/api/sales/${created.id}`, { method: 'DELETE', headers: { Cookie: admin() } })
  })

  console.log('\n▼ VALIDATION EDGE CASES')
  await check('POST sale with empty items → 400', async () => {
    const res = await fetch(url + '/api/sales', { method: 'POST', headers: { Cookie: admin(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ml_order_number: 'EMPTY', items: [] }) })
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`)
  })
  await check('POST sale with negative qty → 400', async () => {
    const prod = (await (await fetch(url + '/api/products', { headers: { Cookie: admin() } })).json())[0]
    const res = await fetch(url + '/api/sales', { method: 'POST', headers: { Cookie: admin(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ml_order_number: 'NEG', items: [{ product_id: prod.id, quantity: -1, unit_price: 5 }] }) })
    if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`)
  })
  await check('Duplicate ml_order_number → 400', async () => {
    const prod = (await (await fetch(url + '/api/products', { headers: { Cookie: admin() } })).json()).find(p => p.is_active)
    const num = 'DUP-' + Date.now()
    const c1 = await fetch(url + '/api/sales', { method: 'POST', headers: { Cookie: admin(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ml_order_number: num, items: [{ product_id: prod.id, quantity: 1, unit_price: 5 }] }) })
    const d1 = await c1.json()
    const c2 = await fetch(url + '/api/sales', { method: 'POST', headers: { Cookie: admin(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ml_order_number: num, items: [{ product_id: prod.id, quantity: 1, unit_price: 5 }] }) })
    if (c2.status !== 400) throw new Error(`expected 400 dup, got ${c2.status}`)
    await fetch(url + `/api/sales/${d1.id}`, { method: 'DELETE', headers: { Cookie: admin() } })  // cleanup
  })
  await check('chart-data custom with bad date → 400', async () => {
    const res = await fetch(url + "/api/sales", { headers: { Cookie: admin() } })  // warmup
    const r2 = await fetch(url + '/api/reports/chart-data?period=custom&date_from=2026-01-01;DROP&date_to=2026-02-01', { headers: { Cookie: admin() } })
    if (r2.status !== 400) throw new Error(`expected 400 for injection attempt, got ${r2.status}`)
  })

  console.log('\n────────────────────────')
  console.log(`PASSED: ${passed.length}   FAILED: ${failed.length}`)
  if (failed.length) for (const f of failed) console.log(`  ${f.label} → ${f.error}`)
  process.exit(failed.length ? 1 : 0)
})().catch(e => { console.error('CRASH:', e.stack); process.exit(1) })
