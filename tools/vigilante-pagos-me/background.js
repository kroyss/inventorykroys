// Vigilante Pagos MercadoEnvíos (uso interno). Un perfil de Chrome por cuenta (PIKEKE, SOLUCION-MC).
//
// Cada minuto le pregunta SOLO al sistema si alguien tocó "Traer pagos y guías" (latido). Únicamente
// entonces abre el portal de MercadoEnvíos (con la sesión de este perfil), lee las órdenes pagadas de
// los últimos 7 días y sube al sistema las que faltan: datos del pago, comprobante y guía.
// Solo LEE el portal: no confirma, no paga, no cambia nada.
//
// Con el despertador (despertador.ps1) Chrome queda CERRADO: el script lo abre en el portal con
// "#vigilante" al haber un pedido; la extensión trabaja apenas arranca y cierra esa ventana al terminar
// (salvo sin sesión: queda abierta para iniciarla ahí).

const DIAS = 7
const PORTAL = 'https://www.mercadoenvios.com.ve'
const MARCA = '#vigilante'   // la pone el despertador en la dirección que abre

let trabajando = false

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('latido', { periodInMinutes: 1 }))
// Abierto por el despertador: no espera la alarma (1 min), pregunta ya.
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('latido', { periodInMinutes: 1 }); latido() })
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'latido') latido() })
chrome.runtime.onMessage.addListener((m, _s, responder) => {
  if (m?.tipo === 'latido') { latido().then(responder); return true }
})

async function config() {
  return chrome.storage.local.get(['perfil', 'servidor', 'clave', 'basica'])
}

async function anotar(texto) {
  const hora = new Date().toLocaleString('es-VE')
  await chrome.storage.local.set({ ultimo: { hora, texto } })
}

async function api(cfg, ruta, body) {
  const headers = { 'Content-Type': 'application/json', 'x-vigilante-clave': cfg.clave, 'x-perfil': cfg.perfil }
  if (cfg.basica) headers.Authorization = 'Basic ' + btoa(cfg.basica)   // clave de nginx en staging
  const r = await fetch(`${cfg.servidor}/api/pagos-me/vigilante/${ruta}`, {
    method: 'POST', headers, body: JSON.stringify(body ?? {}),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
  return d
}

async function latido() {
  const cfg = await config()
  if (!cfg.perfil || !cfg.servidor || !cfg.clave) return { texto: 'Falta configurar perfil, sistema y clave.' }
  try {
    const d = await api(cfg, 'latido')
    if (d.pedido && !trabajando) procesar(cfg, d.pedido)
    // Abierto por el despertador pero ya no hay nada que hacer aquí (otro lo hizo, venció): se cierra.
    if (!d.pedido && !trabajando) for (const t of await tabsDelDespertador()) cerrarVentana(t)
    const texto = d.pedido ? `Conectado: trayendo pagos y guías (pedido ${d.pedido})…` : 'Conectado ✓ (esperando pedidos)'
    if (!trabajando) await anotar(texto)
    return { texto }
  } catch (e) {
    await anotar(`Error al conectar con el sistema: ${e.message}`)
    return { texto: `Error: ${e.message}` }
  }
}

async function procesar(cfg, pedido) {
  trabajando = true
  let tabId = null
  let creada = false
  let vistas = 0
  let nuevas = 0
  let despertada = null
  let sinSesion = false
  try {
    // La pestaña que abrió el despertador; si no, una del portal; si no, una nueva en segundo plano.
    const [delDespertador] = await tabsDelDespertador()
    const [abierta] = delDespertador ? [delDespertador] : await chrome.tabs.query({ url: `${PORTAL}/*` })
    if (delDespertador) despertada = delDespertador
    if (abierta) {
      tabId = abierta.id
      if (abierta.status !== 'complete') await esperarCarga(tabId)
    } else {
      const t = await chrome.tabs.create({ url: `${PORTAL}/vendedor/orden`, active: false })
      tabId = t.id
      creada = true
      await esperarCarga(tabId)
    }

    const [{ result: leido }] = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN', func: leerOrdenes, args: [DIAS],
    })
    if (!leido?.ok) throw new Error(leido?.error || 'No se pudo leer el portal')
    vistas = leido.ordenes.length

    const { faltan } = await api(cfg, 'faltan', {
      ordenes: leido.ordenes.map(o => ({ venta: o.venta, guia: !!o.guia_url, comprobante: !!o.comprobante_url })),
    })
    const porVenta = new Map(leido.ordenes.map(o => [o.venta, o]))
    for (const venta of faltan) {
      const o = porVenta.get(venta)
      if (!o) continue
      const [{ result: archivos }] = await chrome.scripting.executeScript({
        target: { tabId }, world: 'MAIN', func: bajarArchivos, args: [o.guia_url, o.comprobante_url],
      })
      await api(cfg, 'orden', {
        cuenta: leido.cuenta || cfg.perfil,
        orden: o.orden,
        guia_b64: archivos?.guia_b64 ?? null,
        comprobante_b64: archivos?.comprobante_b64 ?? null,
        comprobante_ext: archivos?.comprobante_ext ?? null,
      })
      nuevas++
    }
    await api(cfg, 'fin', { pedido, ok: true, cuenta: leido.cuenta || cfg.perfil, vistas, nuevas })
    await anotar(`Listo: ${vistas} órdenes pagadas vistas, ${nuevas} subidas.`)
  } catch (e) {
    const error = String(e.message || e).slice(0, 280)
    sinSesion = error === 'sin_sesion'
    await api(cfg, 'fin', { pedido, ok: false, vistas, nuevas, error }).catch(() => {})
    await anotar(error === 'sin_sesion'
      ? 'La sesión de MercadoEnvíos de este perfil se cerró: inicia sesión en el portal.'
      : `Error: ${error}`)
  } finally {
    if (creada && tabId != null) chrome.tabs.remove(tabId).catch(() => {})
    // Sin sesión la ventana queda abierta: quien entre a la PC inicia sesión ahí mismo.
    if (despertada && !sinSesion) cerrarVentana(despertada)
    trabajando = false
  }
}

// El portal puede reescribir la dirección y perder la marca: se anota la pestaña apenas aparece.
const anotarMarca = async (tabId, url) => {
  if (!(url || '').includes(MARCA)) return
  const { marcadas = [] } = await chrome.storage.session.get('marcadas')
  if (!marcadas.includes(tabId)) await chrome.storage.session.set({ marcadas: [...marcadas, tabId] })
}
chrome.tabs.onCreated.addListener(t => anotarMarca(t.id, t.pendingUrl || t.url))
chrome.tabs.onUpdated.addListener((id, info, t) => anotarMarca(id, info.url || t.pendingUrl || t.url))

async function tabsDelDespertador() {
  const tabs = await chrome.tabs.query({})
  const { marcadas = [] } = await chrome.storage.session.get('marcadas')
  return tabs.filter(t => marcadas.includes(t.id) || (t.url || t.pendingUrl || '').includes(MARCA))
}

// Cierra la ventana que abrió el despertador; si era la única, Chrome se cierra en este perfil.
function cerrarVentana(tab) {
  chrome.windows.remove(tab.windowId).catch(() => {})
}

function esperarCarga(tabId) {
  return new Promise(resolve => {
    const listo = () => { chrome.tabs.onUpdated.removeListener(oir); setTimeout(resolve, 2000) }
    const oir = (id, info) => { if (id === tabId && info.status === 'complete') listo() }
    chrome.tabs.onUpdated.addListener(oir)
    setTimeout(listo, 30000)
  })
}

// ── Se ejecutan DENTRO de la página del portal (misma sesión, mismo origen) ──
// Tienen que ser autosuficientes: no ven nada de este archivo.

async function leerOrdenes(dias) {
  const json = async url => {
    const r = await fetch(url, { credentials: 'include' })
    if (r.status === 401 || r.status === 403) throw new Error('sin_sesion')
    if (!r.ok) throw new Error(`El portal respondió ${r.status}`)
    return r.json()
  }
  const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  const nombre = x => (x == null ? null : typeof x === 'object' ? (x.name ?? x.nombre ?? null) : String(x))
  const corto = (s, n) => (s == null ? null : String(s).slice(0, n))
  const METODOS = ['mobile_payment', 'transfer', 'zelle', 'binance', 'local_dollar_transfer',
    'international_transfer', 'paypal', 'pipol_pay', 'reserve', 'pay_button']
  try {
    const desde = Date.now() - dias * 864e5
    let cuenta = null
    try {
      const me = await json('/api/v1/seller/me/')
      const d = me?.data ?? me
      cuenta = corto(d?.name ?? d?.profile?.name ?? null, 80)
    } catch (e) { if (e.message === 'sin_sesion') throw e }

    const ordenes = []
    for (let off = 0; off < 1000; off += 50) {
      const res = await json(`/api/v1/seller/orders/?limit=50&offset=${off}&order_by=date_created&direction=desc`)
      const rs = res?.data?.results ?? []
      if (rs.length === 0) break
      for (const o of rs) {
        if (new Date(o.date_created).getTime() < desde) continue
        const p = o.payment || {}
        const mk = p.method && p[p.method] ? p.method : METODOS.find(k => p[k] && typeof p[k] === 'object')
        const m = mk ? p[mk] : null
        const comprobante = m?.voucher_url || null
        const guia = p.urlguide || null
        if (!comprobante && !guia) continue            // incompletas: sin pago ni guía todavía
        const venta = (guia && (guia.match(/\/(\d{10,})\//) || [])[1]) || (/^\d{10,}$/.test(String(o._id)) ? String(o._id) : null)
        if (!venta) continue
        // Método y opción de envío pueden venir como id: se traducen con la agencia.
        const ag = p.shipping_agency
        let met = p.shipping_method
        let opt = p.shipping_option
        if (met != null && typeof met !== 'object' && ag?.methods) {
          const mm = ag.methods.find(x => String(x._id) === String(met))
          met = mm?.name ?? met
          if (opt != null && typeof opt !== 'object' && mm?.options) opt = mm.options.find(x => String(x._id) === String(opt))?.name ?? opt
        }
        const receptor = m?.seller_mobile_payment?.bank ?? m?.seller_transfer?.bank ?? m?.seller_bank ?? m?.receiver_bank ?? null
        ordenes.push({
          venta, guia_url: guia, comprobante_url: comprobante,
          orden: {
            venta,
            estado_me: corto(o.status, 30),
            fecha_orden: corto(o.date_created, 40),
            total_orden: num(o.total_amount),
            total_orden_usd: num(o.total_amount_dollar),
            metodo_pago: corto(mk, 40),
            banco_emisor: corto(nombre(m?.bank), 80),
            banco_receptor: corto(nombre(receptor), 80),
            referencia: corto(m?.reference_code ?? m?.reference ?? p.reference ?? null, 60),
            fecha_pago: p.date ? corto(p.date, 10) : null,
            monto_pagado: num(p.paid_amount),
            envio_metodo: corto(nombre(met), 60),
            envio_opcion: corto(nombre(opt), 60),
            carrier: corto(ag?.name ?? null, 30),
            guia: p.guide ? corto(p.guide, 40) : null,
          },
        })
      }
      if (new Date(rs[rs.length - 1].date_created).getTime() < desde) break
    }
    return { ok: true, cuenta, ordenes }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function bajarArchivos(guiaUrl, comprobanteUrl) {
  const b64 = async url => {
    const r = await fetch(url, { credentials: 'include' })
    if (!r.ok) return null
    const blob = await r.blob()
    if (blob.size > 5 * 1024 * 1024) return null
    const data = await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(blob) })
    return String(data).split(',')[1] ?? null
  }
  const ext = (comprobanteUrl || '').split('?')[0].split('.').pop().toLowerCase()
  return {
    guia_b64: guiaUrl ? await b64(guiaUrl) : null,
    comprobante_b64: comprobanteUrl ? await b64(comprobanteUrl) : null,
    comprobante_ext: ['jpeg', 'jpg', 'png', 'webp', 'pdf'].includes(ext) ? ext : 'jpeg',
  }
}
