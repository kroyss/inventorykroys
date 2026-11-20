// Pagos MercadoEnvíos (el "vigilante"). Un perfil de Chrome por cuenta de MercadoEnvíos. Desde la 1.3.0
// se conecta con el código corto de Pagos ME (opciones.js); antes, con la clave larga a mano.
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
// 1.3.7 (19-11): si el portal deja de responder a mitad de una traída, la extensión quedaba «trabajando» para siempre
// (Chrome abierto, latido al día, pero sin tomar pedidos nuevos). Ahora cada paso anota avance; si pasan
// SIN_AVANCE_MS sin ninguno, la traída se da por fallida (el sistema la reintenta) y queda libre. No es un tope
// total: con conexión lenta pero avanzando (subiendo órdenes una a una) sigue el tiempo que haga falta.
// 1.3.8: 4 → 8 min. La lectura de órdenes (dentro de la página) no puede anotar avance y ahora tiene su propio tope de
// LECTURA_MAX_MS con reintentos por página: el vigía es solo el último recurso.
const SIN_AVANCE_MS = 8 * 60 * 1000
/** 1.3.8 (19-11, el portal tardaba 5–30 s por página con cuentas grandes y a veces no contestaba nunca): topes que se
 *  pasan a las funciones que corren DENTRO de la página (no ven estas constantes). */
const PAGINA_MS = 45 * 1000          // una consulta al portal que no contesta en esto se corta y se reintenta
const INTENTOS_PAGINA = 3            // por consulta
const LECTURA_MAX_MS = 5 * 60 * 1000 // lectura de órdenes: pasado esto se sube lo leído (las más nuevas primero)
/** 1.3.9 (19-11, la línea de la PC de SolucionesMC bajaba ~10 KB/s y cada orden del portal pesa ~17 KB: 1 página de 50
 *  tardaba 76–113 s). Páginas de 20 pedidas una por una desde aquí: se mide cada una, se avisa el avance al sistema
 *  y la espera se ajusta a lo que viene tardando (3× el promedio, entre ESPERA_MIN_MS y ESPERA_MAX_MS). */
const LIMITE_PAGINA = 20
const ESPERA_MIN_MS = 30 * 1000
const ESPERA_MAX_MS = 120 * 1000
const INTENTOS_ADAPT = 2
const LECTURA_TOPE_MS = 8 * 60 * 1000  // lectura por páginas: pasado esto se sube lo leído (las más nuevas)
let ultimoAvance = 0
let turno = 0
const avance = () => { ultimoAvance = Date.now() }

// 1.3.9: cada 30 s (lo mínimo que deja Chrome) en vez de cada minuto: la traída arranca antes.
const CADA_MIN = 0.5
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('latido', { periodInMinutes: CADA_MIN }))
// Abierto por el despertador: no espera la alarma, pregunta ya.
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('latido', { periodInMinutes: CADA_MIN }); latido() })
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'latido') latido() })
chrome.runtime.onMessage.addListener((m, _s, responder) => {
  if (m?.tipo === 'verificar') { verificarCuenta().then(responder); return true }
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
  // 1.4.1: x-version: el sistema sabe qué sabe hacer esta extensión (lectura por avisos solo a la 1.4.1+).
  const headers = { 'Content-Type': 'application/json', 'x-vigilante-clave': cfg.clave, 'x-perfil': cfg.perfil,
    'x-version': chrome.runtime.getManifest().version }
  if (cfg.basica) headers.Authorization = 'Basic ' + btoa(cfg.basica)   // clave de nginx en staging
  const r = await fetch(`${cfg.servidor}/api/pagos-me/vigilante/${ruta}`, {
    method: 'POST', headers, body: JSON.stringify(body ?? {}),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    if (d.verificacion) await chrome.storage.local.set({ verificacion: { ...d.verificacion, at: new Date().toLocaleString('es-VE') } })
    throw new Error(d.error || `HTTP ${r.status}`)
  }
  return d
}

async function latido() {
  const cfg = await config()
  if (!cfg.perfil || !cfg.servidor || !cfg.clave) return { texto: 'Falta configurar perfil, sistema y clave.' }
  try {
    const d = await api(cfg, 'latido')
    // 1.4.0: `corte` + `revisar` (lectura corta segura). El `desde` de la 1.3.9 ya no se usa.
    // 1.4.1: `avisos` = { desde, hasta } → lee los avisos del portal en vez de la lista; `barrido` = lectura de la lista
    // (corta, o completa sin corte) y además anota hasta qué aviso hay leído para la próxima.
    const plan = d.avisos?.desde ? { avisos: d.avisos, revisar: d.revisar ?? [] }
      : d.corte || d.barrido ? { corte: d.corte ?? null, revisar: d.revisar ?? [], barrido: !!d.barrido } : null
    if (d.pedido && !trabajando) procesarConVigia(cfg, d.pedido, !!d.pesos, plan)
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

/** Corre la traída con un vigía de avance: si se cuelga, la suelta y reporta el error (el turno viejo, si algún día
 *  termina, ya no toca nada). */
async function procesarConVigia(cfg, pedido, pesos, plan = null) {
  const mio = ++turno
  trabajando = true
  avance()
  let vigia
  const colgada = new Promise(resolve => {
    vigia = setInterval(() => { if (Date.now() - ultimoAvance > SIN_AVANCE_MS) resolve('colgada') }, 10000)
  })
  const r = await Promise.race([procesar(cfg, pedido, pesos, mio, plan).then(() => 'ok'), colgada])
  clearInterval(vigia)
  if (r === 'colgada' && turno === mio) {
    turno++   // el procesar colgado queda huérfano
    await api(cfg, 'fin', { pedido, ok: false, error: 'El portal de MercadoEnvíos no respondió (8 min sin avance)' }).catch(() => {})
    await anotar('El portal de MercadoEnvíos no respondió: se soltó la traída y queda libre para la siguiente.')
    for (const t of await tabsDelDespertador()) cerrarVentana(t)
    trabajando = false
  }
}

async function procesar(cfg, pedido, pesos = false, mio = turno, plan = null) {
  const t0 = Date.now()
  const vigente = () => turno === mio
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

    avance()
    const aviso = avisador(cfg, pedido)
    // 1.4.1: con `avisos`, lee la campanita del portal (~15 KB) y pide solo esas órdenes; si no alcanza a llegar a la
    // traída anterior o el portal no da avisos, lee la lista completa (lento pero seguro). Con `barrido`, antes de la
    // lista anota el aviso más nuevo: desde ahí sigue la próxima por avisos.
    let avisosHasta = null
    const leer = async () => {
      if (plan?.avisos) {
        const r = await leerPorAvisos(tabId, plan, aviso, vigente, cfg)
        if (!r?.volver) return r
        if (r.hasta) avisosHasta = r.hasta
        await anotar('Los avisos del portal no alcanzaron: leyendo la lista completa…')
        return leerPorPaginas(tabId, null, aviso, vigente)
      }
      if (plan?.barrido && !avisosHasta) {
        const r = await ejecutar(tabId, leerAvisos, [Date.now(), PAGINA_MS, INTENTOS_PAGINA, 1, false]).catch(() => null)
        if (r?.ok && r.hasta) avisosHasta = r.hasta
      }
      return leerPorPaginas(tabId, plan, aviso, vigente)
    }
    let leido = await leer()
    avance()
    // Sesión vencida (MercadoEnvíos la cierra a diario): se entra solo con "Ingresar con mi cuenta
    // de Mercado Libre", que pasa directo si este Chrome tiene la sesión de ML. Nunca escribe claves:
    // si ML pide clave o código, queda como sin sesión y la ventana abierta para hacerlo a mano.
    if (leido?.error === 'sin_sesion' && await reingresar(tabId)) {
      leido = await leer()
    }
    if (!vigente()) return
    if (!leido?.ok) throw new Error(leido?.error || 'No se pudo leer el portal')
    vistas = leido.ordenes.length

    // 1.3.4: el sistema verifica que la cuenta del portal sea de una cuenta de ML conectada; si es otra,
    // responde 409 'cuenta_no_conectada' y no se sube nada.
    const { faltan, verificacion } = await api(cfg, 'faltan', {
      cuenta: leido.cuenta || null,
      ordenes: leido.ordenes.map(o => ({ venta: o.venta, guia: !!o.guia_url, comprobante: !!o.comprobante_url, orden: o.orden_me ?? null })),
    })
    if (verificacion) await chrome.storage.local.set({ verificacion: { ...verificacion, at: new Date().toLocaleString('es-VE') } })
    const porVenta = new Map(leido.ordenes.map(o => [o.venta, o]))
    const medida = medidor()
    let i = 0
    for (const venta of faltan) {
      const o = porVenta.get(venta)
      if (!o) continue
      if (!vigente()) return
      avance()
      aviso('bajando', i, faltan.length, medida.faltan(faltan.length - i))
      const ta = Date.now()
      const archivos = await ejecutar(tabId, bajarArchivos, [o.guia_url, o.comprobante_url, medida.espera()])
      medida.anotar(Date.now() - ta)
      i++
      await api(cfg, 'orden', {
        cuenta: leido.cuenta || cfg.perfil,
        orden_me: o.orden_me ?? null,
        orden: o.orden,
        guia_b64: archivos?.guia_b64 ?? null,
        comprobante_b64: archivos?.comprobante_b64 ?? null,
        comprobante_ext: archivos?.comprobante_ext ?? null,
      })
      nuevas++
      avance()
    }
    // Pesos de las publicaciones (1.3.2, Promociones): la primera traída del día o al pedirlos. Si falla,
    // la traída de pagos igual se da por buena.
    if (pesos && vigente()) {
      avance()
      aviso('pesos', 0, null, null, true)
      try {
        const prod = await ejecutar(tabId, leerProductos, [PAGINA_MS])
        if (prod?.ok) await api(cfg, 'productos', { cuenta: leido.cuenta || cfg.perfil, completo: prod.completo, items: prod.items })
      } catch (e) { await anotar(`No se pudieron leer los pesos: ${e.message}`) }
    }
    // 1.3.7: notas del portal. Si falla (p. ej. el sistema todavía no tiene la ruta), la traída igual se da por buena.
    if (vigente() && leido.notas?.length) {
      avance()
      await api(cfg, 'notas', { cuenta: leido.cuenta || cfg.perfil, ordenes: leido.notas }).catch(() => {})
    }
    if (!vigente()) return
    await api(cfg, 'fin', { pedido, ok: true, cuenta: leido.cuenta || cfg.perfil, vistas, nuevas, saltadas: (leido.saltadas ?? []).slice(0, 500),
      modo: leido.parcial ? 'parcial' : leido.modo, segundos: Math.round((Date.now() - t0) / 1000),
      avisos_hasta: leido.parcial ? null : (leido.avisos_hasta ?? avisosHasta) })
    const nSalt = leido.saltadas?.length ?? 0
    await anotar(`Listo${leido.modo === 'avisos' ? ' (avisos de pago desde la última traída y las pendientes)' : leido.modo === 'corta' ? ' (lo nuevo desde la última traída y las pendientes)' : ''}: ${vistas} órdenes pagadas vistas, ${nuevas} subidas.${nSalt ? ` ${nSalt} sin pago o sin guía todavía.` : ''}`
      + (leido.parcial ? ' El portal estaba lento: se leyeron solo las más recientes.' : ''))
  } catch (e) {
    if (!vigente()) return
    const error = String(e.message || e).slice(0, 280)
    sinSesion = error === 'sin_sesion'
    await api(cfg, 'fin', { pedido, ok: false, vistas, nuevas, error }).catch(() => {})
    await anotar(error === 'sin_sesion'
      ? 'La sesión de MercadoEnvíos de este perfil se cerró: inicia sesión en el portal.'
      : error === 'cuenta_no_conectada'
        ? 'La cuenta de MercadoEnvíos abierta en este Chrome no es de ninguna cuenta conectada en el sistema: no se trajo nada.'
        : `Error: ${error}`)
  } finally {
    if (creada && tabId != null) chrome.tabs.remove(tabId).catch(() => {})
    if (vigente()) {
      // Sin sesión la ventana queda abierta: quien entre a la PC inicia sesión ahí mismo.
      if (despertada && !sinSesion) cerrarVentana(despertada)
      trabajando = false
    }
  }
}

/** ¿Qué cuenta de MercadoEnvíos está abierta en este Chrome y a qué cuenta del sistema corresponde? (1.3.4)
 *  Lee el portal en una pestaña de fondo (o la que ya esté abierta) y le pregunta al sistema. */
async function verificarCuenta() {
  const cfg = await config()
  if (!cfg.clave || !cfg.perfil) return { estado: 'sin_conectar' }
  let [tab] = await chrome.tabs.query({ url: `${PORTAL}/*` })
  let creada = false
  try {
    if (!tab) {
      tab = await chrome.tabs.create({ url: `${PORTAL}/vendedor/orden`, active: false })
      creada = true
      await esperarCarga(tab.id)
    }
    // 1.3.9: para saber qué cuenta es alcanza con la primera página (antes leía los 7 días: minutos con línea lenta).
    const leido = await ejecutar(tab.id, leerOrdenes, [DIAS, ESPERA_MAX_MS, INTENTOS_ADAPT, 0, { off: 0, paginas: 1, limite: LIMITE_PAGINA }])
    if (!leido?.ok) return { estado: leido?.error === 'sin_sesion' ? 'sin_sesion' : 'error', error: leido?.error }
    const v = await api(cfg, 'verificar', { cuenta: leido.cuenta || null, ventas: leido.ordenes.map(o => o.venta) })
    const res = { ...v, at: new Date().toLocaleString('es-VE') }
    await chrome.storage.local.set({ verificacion: res })
    return res
  } catch (e) {
    return { estado: 'error', error: String(e.message || e) }
  } finally {
    if (creada && tab) chrome.tabs.remove(tab.id).catch(() => {})
  }
}

// El portal puede reescribir la dirección y perder la marca: se anota la pestaña apenas aparece.
const anotarMarca = async (tabId, url) => {
  if (!(url || '').includes(MARCA)) return
  const { marcadas = [] } = await chrome.storage.session.get('marcadas')
  if (!marcadas.includes(tabId)) await chrome.storage.session.set({ marcadas: [...marcadas, tabId] })
  // 1.3.7: ya anotada, se le quita la marca a la dirección (es solo para la extensión; el portal no la necesita).
  chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED',
    func: m => { if (location.hash === m) history.replaceState(history.state, '', location.pathname + location.search) }, args: [MARCA],
  }).catch(() => {})
}
chrome.tabs.onCreated.addListener(t => anotarMarca(t.id, t.pendingUrl || t.url))
chrome.tabs.onUpdated.addListener((id, info, t) => {
  anotarMarca(id, info.url || t.pendingUrl || t.url)
  // 1.3.9: borrarla apenas aparece fallaba a veces (la página todavía no existía); se borra también al terminar de cargar.
  if (info.status === 'complete' && (t.url || '').includes(MARCA)) {
    chrome.scripting.executeScript({ target: { tabId: id }, world: 'ISOLATED',
      func: m => { if (location.hash === m) history.replaceState(history.state, '', location.pathname + location.search) }, args: [MARCA],
    }).catch(() => {})
  }
})

/** Entra de nuevo al portal con la cuenta de ML de este perfil. true = volvió al portal con sesión. */
async function reingresar(tabId) {
  await anotar('Sesión de MercadoEnvíos vencida: entrando con la cuenta de Mercado Libre…')
  await chrome.tabs.update(tabId, { url: `${PORTAL}/ingresar` })
  await esperarCarga(tabId)
  const [{ result: tocado }] = await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN',
    func: () => {
      const a = document.querySelector('a.mercadolibre-btn')
        || [...document.querySelectorAll('a,button')].find(e => /cuenta de\s*mercado\s*libre/i.test(e.textContent || ''))
      if (!a) return false
      a.click()
      return true
    },
  })
  if (!tocado) return false
  // Pasa por ML y vuelve al portal (a /comprador/dashboard). Hasta 40 s.
  // 1.3.7 (19-11): a veces el ingreso se abre en OTRA pestaña o ventana y quedaba abierta de más. Si vuelve al portal
  // por ahí, se cierra esa y se sigue en la nuestra; si sale bien, también se cierran las de ML que abrió el ingreso.
  const antes = new Set((await chrome.tabs.query({})).map(t => t.id))
  const nuevas = async () => (await chrome.tabs.query({})).filter(t => !antes.has(t.id) && t.id !== tabId)
  let ok = false
  for (let i = 0; i < 40 && !ok; i++) {
    await new Promise(r => setTimeout(r, 1000))
    avance()
    const t = await chrome.tabs.get(tabId).catch(() => null)
    if (!t) return false
    const enPortal = x => (x.url || '').startsWith(PORTAL) && !/\/ingresar/.test(x.url || '') && x.status === 'complete'
    if (enPortal(t)) ok = true
    else {
      const otra = (await nuevas()).find(enPortal)
      if (otra) {
        await chrome.tabs.update(tabId, { url: `${PORTAL}/vendedor/orden` })
        await esperarCarga(tabId)
        ok = true
      }
    }
  }
  if (!ok) return false   // ML pidió clave o código: queda para hacerlo a mano (las ventanas quedan para eso)
  await new Promise(r => setTimeout(r, 1500))
  for (const x of await nuevas()) {
    // Solo las que abrió nuestra pestaña (nunca una que la persona haya abierto en ese rato).
    if (x.openerTabId === tabId && /mercadoenvios\.com\.ve|mercadolibre\.com/i.test(x.url || x.pendingUrl || '')) chrome.tabs.remove(x.id).catch(() => {})
  }
  return true
}

async function tabsDelDespertador() {
  const tabs = await chrome.tabs.query({})
  const { marcadas = [] } = await chrome.storage.session.get('marcadas')
  return tabs.filter(t => marcadas.includes(t.id) || (t.url || t.pendingUrl || '').includes(MARCA))
}

// Cierra la ventana que abrió el despertador; si era la única, Chrome se cierra en este perfil.
function cerrarVentana(tab) {
  chrome.windows.remove(tab.windowId).catch(() => {})
}

const ARGS_LEER = [DIAS, PAGINA_MS, INTENTOS_PAGINA, LECTURA_MAX_MS]

/** 1.3.9: mide lo que tarda cada paso (página o archivo) y de ahí sale cuánto esperar el siguiente y cuánto falta. */
function medidor() {
  const t = []
  const prom = () => t.length ? t.reduce((a, b) => a + b, 0) / t.length : null
  return {
    anotar: ms => { t.push(ms); if (t.length > 6) t.shift() },
    // El primero, sin con qué comparar, espera el máximo. Después 3× el promedio, entre el piso y el techo.
    espera: () => { const p = prom(); return p == null ? ESPERA_MAX_MS : Math.min(ESPERA_MAX_MS, Math.max(ESPERA_MIN_MS, Math.round(3 * p))) },
    faltan: pasos => { const p = prom(); return p == null || pasos == null ? null : Math.round(p * Math.max(0, pasos) / 1000) },
  }
}

/** 1.3.9: le cuenta al sistema cómo va (el aviso «leyendo 40 de ~120 · faltan ~30 s»). Como mucho cada 3 s; si falla
 *  (sistema viejo sin la ruta), no pasa nada. */
function avisador(cfg, pedido) {
  let ultimo = 0
  let fase = null
  return (f, hechas, total, faltan_s, forzar = false, modo = null) => {
    if (!forzar && f === fase && Date.now() - ultimo < 3000) return
    ultimo = Date.now()
    fase = f
    api(cfg, 'avance', { pedido, fase: f, hechas, total: total ?? null, faltan_s: faltan_s ?? null, modo }).catch(() => {})
  }
}

/** 1.3.9: lee la lista de órdenes de a una página (de LIMITE_PAGINA). Con `desde` (fecha de corte que da el sistema),
 *  ordena por última modificación y para al pasar esa fecha: casi siempre 1 página. Sin `desde`, los 7 días. */
async function leerPorPaginas(tabId, plan, aviso, vigente) {
  // 1.4.0: `plan` = { corte (fecha de CREACIÓN desde la que leer la lista), revisar (números de las pendientes) }.
  const corte = plan?.corte ? Date.parse(plan.corte) : null
  const revisar = corte && Array.isArray(plan?.revisar) ? plan.revisar.map(String) : []
  const vistosIds = new Set()
  const modo = corte ? 'corta' : 'completa'
  const inicioVentana = corte ?? Date.now() - DIAS * 864e5
  const medida = medidor()
  const t0 = Date.now()
  const ordenes = [], notas = [], saltadas = []
  const vistasO = new Set(), vistasN = new Set(), vistasS = new Set()
  let cuenta = null
  let parcial = false
  let leidas = 0
  aviso('leyendo', 0, null, null, true, modo)
  for (let off = 0; off < 2000; off += LIMITE_PAGINA) {
    if (!vigente()) break
    if (off > 0 && Date.now() - t0 > LECTURA_TOPE_MS) { parcial = true; break }
    const tp = Date.now()
    let r
    try {
      r = await ejecutar(tabId, leerOrdenes, [DIAS, medida.espera(), INTENTOS_ADAPT, 0,
        { off, paginas: 1, limite: LIMITE_PAGINA, orden: 'date_created', corte, conCuenta: off === 0 }])
    } catch (e) {
      if (off === 0) throw e
      parcial = true
      break
    }
    if (!r?.ok) {
      if (off === 0 || r?.error === 'sin_sesion') return r
      parcial = true
      break
    }
    medida.anotar(Date.now() - tp)
    avance()
    if (off === 0) cuenta = r.cuenta
    for (const id of r.vistos ?? []) vistosIds.add(id)
    // Al leer por última modificación una orden puede cambiar mientras tanto y aparecer dos veces: se cuenta una.
    for (const o of r.ordenes) if (!vistasO.has(o.venta)) { vistasO.add(o.venta); ordenes.push(o) }
    for (const x of r.notas) if (!vistasN.has(x.orden)) { vistasN.add(x.orden); notas.push(x) }
    for (const x of r.saltadas) if (!vistasS.has(x.orden)) { vistasS.add(x.orden); saltadas.push(x) }
    leidas += r.n
    if (r.fin) break
    // Total estimado: lo leído en proporción al tramo de tiempo ya recorrido (de la más nueva hacia atrás).
    const ahora = Date.now()
    const frac = r.ultima ? (ahora - r.ultima) / Math.max(1, ahora - inicioVentana) : 0
    const total = frac > 0.05 ? Math.max(leidas + LIMITE_PAGINA, Math.round(leidas / Math.min(1, frac))) : null
    aviso('leyendo', leidas, total, total ? medida.faltan(Math.ceil((total - leidas) / LIMITE_PAGINA)) : null, false, modo)
  }
  // 1.4.0: las que la traída anterior dejó esperando pago o guía, de a una por su número (las nuevas ya vinieron en la
  // lista). Así el pago de una orden de hace 6 días entra aunque el portal no le cambie la fecha.
  const pendientes = parcial ? [] : revisar.filter(id => !vistosIds.has(id))
  if (pendientes.length) {
    const tanda = 5
    const med = medidor()
    for (let i = 0; i < pendientes.length; i += tanda) {
      if (!vigente()) break
      const ids = pendientes.slice(i, i + tanda)
      aviso('revisando', i, pendientes.length, med.faltan(Math.ceil((pendientes.length - i) / tanda)), false, modo)
      const tp = Date.now()
      let r
      try {
        r = await ejecutar(tabId, leerOrdenes, [DIAS, med.espera(), INTENTOS_ADAPT, 0, { ids, conCuenta: false }])
      } catch (e) { r = { ok: false, error: e.message } }
      if (r?.error === 'sin_sesion') return r
      if (!r?.ok) {
        // Si falla una tanda, esas quedan anotadas como no leídas: se revisan en la próxima.
        for (const id of ids) saltadas.push({ orden: id, venta: /^\d{10,20}$/.test(id) ? id : null, motivo: 'no_leida', estado: null, fecha: null })
        continue
      }
      med.anotar(Date.now() - tp)
      avance()
      for (const o of r.ordenes) if (!vistasO.has(o.venta)) { vistasO.add(o.venta); ordenes.push(o) }
      for (const x of r.notas) if (!vistasN.has(x.orden)) { vistasN.add(x.orden); notas.push(x) }
      for (const x of r.saltadas) if (!vistasS.has(x.orden)) { vistasS.add(x.orden); saltadas.push(x) }
    }
  } else if (parcial && revisar.length) {
    // Lectura cortada a mitad: las pendientes siguen pendientes (se revisan en la próxima).
    for (const id of revisar) if (!vistosIds.has(id) && !vistasS.has(id)) saltadas.push({ orden: id, venta: /^\d{10,20}$/.test(id) ? id : null, motivo: 'no_leida', estado: null, fecha: null })
  }
  return { ok: true, cuenta, ordenes, notas, saltadas, parcial, modo }
}

/** 1.4.1 (20-11-2026): traída por AVISOS. El portal guarda un aviso por cada orden nueva y cada pago («Tienes un nuevo
 *  pago», con el número de orden): 50 avisos pesan ~15 KB, cuando una página de 20 órdenes pesa ~370 KB (cada orden trae
 *  la ficha entera del producto y el portal no comprime). Se leen los avisos publicados desde la traída anterior (por
 *  fecha, no por «leído»: marcarlos leídos en el portal no cambia nada, y la extensión nunca los marca), el sistema dice
 *  cuáles faltan, y se piden solo esas por su número, 5 a la vez, junto con las pendientes que da el latido (pago sin
 *  guía, no leídas). Si los avisos no alcanzan hasta la traída anterior (más de MAX_PAGINAS_AVISOS páginas) o el portal
 *  no los da, `volver` → la extensión lee la lista completa (lento pero seguro). */
const MAX_PAGINAS_AVISOS = 30   // la primera vez se leen 7 días (~600–750 avisos por cuenta)
async function leerPorAvisos(tabId, plan, aviso, vigente, cfg) {
  const desde = Date.parse(plan.avisos.desde)
  if (!Number.isFinite(desde)) return { volver: true }
  aviso('leyendo', 0, null, null, true, 'avisos')
  let r
  try { r = await ejecutar(tabId, leerAvisos, [desde, PAGINA_MS, INTENTOS_PAGINA, MAX_PAGINAS_AVISOS, true]) }
  catch { return { volver: true } }
  if (!r?.ok) return r?.error === 'sin_sesion' ? r : { volver: true }
  // No alcanzó hasta la traída anterior: lista completa, y la próxima sigue desde el aviso más nuevo de ahora.
  if (!r.completo) return { volver: true, hasta: r.hasta ?? null }
  avance()
  let pedir = []
  try {
    const res = await api(cfg, 'avisos', { cuenta: r.cuenta || null, desde: plan.avisos.desde, avisos: r.avisos })
    // El vigía del sistema vio ventas de ML sin ningún aviso en el portal: los avisos no funcionan → lista de siempre.
    if (res.avisos_fallan) return { volver: true, hasta: null }
    pedir = res.pedir ?? []
  }
  catch (e) {
    // La cuenta del portal no es de ninguna cuenta conectada, o el sistema no respondió: no se baja nada a ciegas.
    if (/cuenta_no_conectada/.test(e.message)) throw e
    return { volver: true }
  }
  const ids = [...new Set([...pedir.map(String), ...(plan.revisar ?? []).map(String)])]
  const ordenes = [], notas = [], saltadas = []
  const vO = new Set(), vN = new Set(), vS = new Set()
  const tanda = 5
  const med = medidor()
  for (let i = 0; i < ids.length; i += tanda) {
    if (!vigente()) break
    const lote = ids.slice(i, i + tanda)
    aviso('revisando', i, ids.length, med.faltan(Math.ceil((ids.length - i) / tanda)), false, 'avisos')
    const tp = Date.now()
    let x
    try { x = await ejecutar(tabId, leerOrdenes, [DIAS, med.espera(), INTENTOS_ADAPT, 0, { ids: lote, conCuenta: false }]) }
    catch (e) { x = { ok: false, error: e.message } }
    if (x?.error === 'sin_sesion') return x
    if (!x?.ok) {
      // No se pudieron leer: quedan anotadas y se revisan en la próxima.
      for (const id of lote) saltadas.push({ orden: id, venta: /^\d{10,20}$/.test(id) ? id : null, motivo: 'no_leida', estado: null, fecha: null })
      continue
    }
    med.anotar(Date.now() - tp)
    avance()
    for (const o of x.ordenes) if (!vO.has(o.venta)) { vO.add(o.venta); ordenes.push(o) }
    for (const n of x.notas) if (!vN.has(n.orden)) { vN.add(n.orden); notas.push(n) }
    for (const n of x.saltadas) if (!vS.has(n.orden)) { vS.add(n.orden); saltadas.push(n) }
  }
  return { ok: true, cuenta: r.cuenta, ordenes, notas, saltadas, parcial: false, modo: 'avisos',
    avisos_hasta: r.hasta ?? plan.avisos.hasta ?? null }
}

/** 1.3.8: corre una función dentro de la página. Si la página se recargó a mitad («Frame with ID 0 was removed», el
 *  portal se recarga solo cuando sus datos tardan), espera que cargue y prueba una vez más. */
async function ejecutar(tabId, func, args = []) {
  for (let i = 0; ; i++) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args })
      return result
    } catch (e) {
      const msg = String(e?.message || e)
      if (i >= 1 || !/frame|document|navigat|context/i.test(msg)) throw e
      avance()
      await anotar('La página de MercadoEnvíos se recargó a mitad de la lectura: reintentando…')
      await esperarCarga(tabId)
    }
  }
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

// 1.3.9: `op` lee un tramo y vuelve (la extensión pide página por página para medir, avisar el avance y ajustar la
// espera): { off, paginas, limite, orden: 'date_created'|'last_updated', corte (ms; con last_updated: lo modificado
// desde ahí), conCuenta }. Sin `op`, como la 1.3.8 (todo de una vez, 50 por página).
async function leerOrdenes(dias, paginaMs = 45000, intentos = 3, maxMs = 300000, op = null) {
  const inicio = Date.now()
  const limite = op?.limite ?? 50
  const ordenPor = op?.orden === 'last_updated' ? 'last_updated' : 'date_created'
  // 1.4.0: el corte vale con cualquier orden (la 1.4.0 lo usa por fecha de CREACIÓN: MercadoEnvíos no siempre cambia
  // last_updated al llegar un pago). Con `op.ids` se piden esas órdenes de a una (/orders/{id}/) en vez de la lista.
  const corte = op?.corte ? op.corte : null
  const soloIds = Array.isArray(op?.ids) ? op.ids : null
  const fechaDe = o => new Date(ordenPor === 'last_updated' ? (o.last_updated ?? o.date_created) : o.date_created).getTime()
  const espera = ms => new Promise(r => setTimeout(r, ms))
  // 1.3.8: cada consulta con tope de tiempo y reintentos (el portal a veces tarda 5–30 s o da 502/503/504 «Gateway
  // Timeout»). Sin sesión no se reintenta.
  const json = async url => {
    let ultimo = null
    for (let i = 0; i < intentos; i++) {
      if (i) await espera(3000 * i)
      const c = new AbortController()
      const t = setTimeout(() => c.abort(), paginaMs)
      try {
        const r = await fetch(url, { credentials: 'include', signal: c.signal })
        if (r.status === 401 || r.status === 403) throw new Error('sin_sesion')
        if (r.status >= 500 || r.status === 429) { ultimo = `El portal respondió ${r.status}`; continue }
        if (!r.ok) throw new Error(`El portal respondió ${r.status}`)
        return await r.json()
      } catch (e) {
        if (e.message === 'sin_sesion' || /^El portal respondió/.test(e.message)) throw e
        ultimo = e.name === 'AbortError' ? `El portal de MercadoEnvíos no respondió en ${Math.round(paginaMs / 1000)} s` : e.message
      } finally { clearTimeout(t) }
    }
    throw new Error(`${ultimo} (${intentos} intentos)`)
  }
  const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  const nombre = x => (x == null ? null : typeof x === 'object' ? (x.name ?? x.nombre ?? null) : String(x))
  const corto = (s, n) => (s == null ? null : String(s).slice(0, n))
  const METODOS = ['mobile_payment', 'transfer', 'zelle', 'binance', 'local_dollar_transfer',
    'international_transfer', 'paypal', 'pipol_pay', 'reserve', 'pay_button']
  try {
    const desde = Date.now() - dias * 864e5
    let cuenta = null
    if (op?.conCuenta !== false) try {
      const me = await json('/api/v1/seller/me/')
      const d = me?.data ?? me
      cuenta = corto(d?.name ?? d?.profile?.name ?? null, 80)
    } catch (e) { if (e.message === 'sin_sesion') throw e }

    const ordenes = []
    // 1.3.7: nota del vendedor de CADA orden de la ventana (también incompletas) y las que no se traen, con el motivo.
    const notas = []
    const saltadas = []
    // Campos con «bank» del pago (ruta → nombre del banco). Nunca números: se salta lo que tenga 6+ dígitos seguidos.
    const bancosDe = obj => {
      const out = []
      const ver = (x, ruta, prof) => {
        if (!x || typeof x !== 'object' || prof > 4 || out.length >= 20) return
        for (const [k, v] of Object.entries(x)) {
          const r = ruta ? `${ruta}.${k}` : k
          if (/bank|banco/i.test(k)) {
            const val = typeof v === 'string' ? v : v && typeof v === 'object' ? (v.name ?? v.nombre ?? null) : null
            if (typeof val === 'string' && val.trim() && val.length <= 80 && !/\d{6,}/.test(val)) out.push({ ruta: r.slice(0, 120), valor: val.trim() })
          }
          if (v && typeof v === 'object' && !Array.isArray(v)) ver(v, r, prof + 1)
        }
      }
      ver(obj, '', 0)
      return out
    }
    let parcial = false
    let fin = false
    let n = 0
    let ultima = null
    const off0 = op?.off ?? 0
    const offMax = soloIds ? off0 + 1 : op ? off0 + (op.paginas ?? 1) * limite : 1000
    const vistos = []
    const noLeidas = []
    for (let off = off0; off < offMax; off += limite) {
      // 1.3.8: con el portal lento, pasado maxMs se sube lo ya leído (son las más nuevas); el resto, en la próxima.
      if (off > off0 && maxMs && Date.now() - inicio > maxMs) { parcial = true; break }
      let rs
      if (soloIds) {
        rs = []
        // 1.4.1: las de la tanda a la vez (antes de a una, en fila).
        await Promise.all(soloIds.map(async id => {
          try {
            const r = await json(`/api/v1/seller/orders/${encodeURIComponent(id)}/`)
            const d = r?.data ?? r
            if (d && d._id != null) rs.push(d); else noLeidas.push(String(id))
          } catch (e) {
            if (e.message === 'sin_sesion') throw e
            noLeidas.push(String(id))
          }
        }))
        fin = true
      } else {
        let res
        try {
          res = await json(`/api/v1/seller/orders/?limit=${limite}&offset=${off}&order_by=${ordenPor}&direction=desc`)
        } catch (e) {
          // La primera página es obligatoria; si falla una de las siguientes, se sube lo leído.
          if (off === off0 || e.message === 'sin_sesion') throw e
          parcial = true
          break
        }
        rs = res?.data?.results ?? []
      }
      if (rs.length === 0) { fin = true; break }
      n += rs.length
      ultima = fechaDe(rs[rs.length - 1])
      for (const o of rs) {
        if (new Date(o.date_created).getTime() < desde) continue
        if (corte && !soloIds && fechaDe(o) < corte) continue
        // 1.4.1: «vista» solo la que se procesó de verdad. La 1.4.0 marcaba también las de la última página más viejas
        // que el corte (que se saltan sin anotar) y por eso no las pedía aparte: se perdían (venta 2000019671715396).
        vistos.push(String(o._id))
        const p = o.payment || {}
        const mk = p.method && p[p.method] ? p.method : METODOS.find(k => p[k] && typeof p[k] === 'object')
        const m = mk ? p[mk] : null
        const comprobante = m?.voucher_url || null
        const guia = p.urlguide || null
        const venta = (guia && (guia.match(/\/(\d{10,})\//) || [])[1]) || (/^\d{10,}$/.test(String(o._id)) ? String(o._id) : null)
        const nota = o.note == null ? '' : String(typeof o.note === 'object' ? (o.note.text ?? o.note.note ?? '') : o.note).trim()
        notas.push({ orden: corto(o._id, 60), venta, nota: nota ? nota.slice(0, 1000) : null })
        const saltar = motivo => saltadas.push({ orden: corto(o._id, 60), venta, motivo, estado: corto(o.status, 30), fecha: corto(o.date_created, 40) })
        if (!comprobante && !guia) { saltar('sin_pago_ni_guia'); continue }   // incompletas: sin pago ni guía todavía
        if (!venta) { saltar('sin_numero_venta'); continue }
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
          venta, guia_url: guia, comprobante_url: comprobante, orden_me: corto(o._id, 60),
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
            bancos: m ? bancosDe(m) : [],
          },
        })
      }
      if (soloIds) break
      if ((corte && ultima < corte) || (ordenPor === 'date_created' && ultima < desde)) { fin = true; break }
      if (rs.length < limite) { fin = true; break }
    }
    // No se pudieron leer: quedan anotadas para revisarlas en la próxima traída (si no, se perderían de vista).
    for (const id of noLeidas) saltadas.push({ orden: corto(id, 60), venta: /^\d{10,20}$/.test(id) ? id : null, motivo: 'no_leida', estado: null, fecha: null })
    return { ok: true, cuenta, ordenes, notas, saltadas, parcial, fin, n, ultima, vistos }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// 1.4.1: avisos del portal (la campanita) publicados desde `desdeMs`, del más nuevo al más viejo. Solo los que llevan a
// una orden. `completo` = llegó hasta `desdeMs` (o se acabaron). `hasta` = fecha del aviso más nuevo (de ahí sigue la
// próxima). Solo LEE: no los marca como leídos.
async function leerAvisos(desdeMs, paginaMs = 45000, intentos = 3, maxPaginas = 20, conCuenta = true) {
  const espera = ms => new Promise(r => setTimeout(r, ms))
  const json = async url => {
    let ultimo = null
    for (let i = 0; i < intentos; i++) {
      if (i) await espera(3000 * i)
      const c = new AbortController()
      const t = setTimeout(() => c.abort(), paginaMs)
      try {
        const r = await fetch(url, { credentials: 'include', signal: c.signal })
        if (r.status === 401 || r.status === 403) throw new Error('sin_sesion')
        if (r.status >= 500 || r.status === 429) { ultimo = `El portal respondió ${r.status}`; continue }
        if (!r.ok) throw new Error(`El portal respondió ${r.status}`)
        return await r.json()
      } catch (e) {
        if (e.message === 'sin_sesion' || /^El portal respondió/.test(e.message)) throw e
        ultimo = e.name === 'AbortError' ? `El portal de MercadoEnvíos no respondió en ${Math.round(paginaMs / 1000)} s` : e.message
      } finally { clearTimeout(t) }
    }
    throw new Error(`${ultimo} (${intentos} intentos)`)
  }
  try {
    let cuenta = null
    if (conCuenta) try {
      const me = await json('/api/v1/seller/me/')
      const d = me?.data ?? me
      const n = d?.name ?? d?.profile?.name ?? null
      cuenta = n == null ? null : String(n).slice(0, 80)
    } catch (e) { if (e.message === 'sin_sesion') throw e }
    const avisos = []
    let hasta = null
    let completo = false
    for (let pag = 1; pag <= maxPaginas && !completo; pag++) {
      const r = await json(`/api/v1/seller/notifications/?page_size=50&page=${pag}&ordering=-published_date`)
      const d = r?.data ?? r
      const rs = Array.isArray(d?.results) ? d.results : []
      if (!rs.length) { completo = true; break }
      for (const x of rs) {
        const t = Date.parse(x?.published_date)
        if (hasta == null && Number.isFinite(t)) hasta = String(x.published_date).slice(0, 40)
        if (Number.isFinite(t) && t < desdeMs) { completo = true; break }
        const m = String(x?.link?.href ?? '').match(/\/orden\/(\d{6,20})/)
        if (!m) continue
        const tit = String(x?.title ?? '').toLowerCase()
        const tipo = /pago/.test(tit) ? 'pago' : /orden/.test(tit) ? 'orden' : 'otro'
        avisos.push({ orden: m[1], tipo, fecha: Number.isFinite(t) ? String(x.published_date).slice(0, 40) : null })
      }
      if (rs.length < 50) completo = true
    }
    return { ok: true, cuenta, avisos: avisos.slice(0, 2000), hasta, completo }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// Publicaciones activas del portal con su peso y transportistas (pantalla Productos del portal).
async function leerProductos(paginaMs = 45000) {
  try {
    const items = []
    let total = 0
    const inicio = Date.now()
    for (let off = 0; off < 5000; off += 50) {
      // 1.3.8: tope por página y total (3 min): los pesos son opcionales, no deben trabar la traída.
      if (Date.now() - inicio > 180000) break
      const c = new AbortController()
      const t = setTimeout(() => c.abort(), paginaMs)
      let r
      try { r = await fetch(`/api/v1/seller/products/search/?limit=50&offset=${off}&order_by=date_created&direction=desc&status=active`, { credentials: 'include', signal: c.signal }) }
      catch (e) { throw new Error(e.name === 'AbortError' ? 'El portal no respondió' : e.message) }
      finally { clearTimeout(t) }
      if (!r.ok) throw new Error(`El portal respondió ${r.status}`)
      const d = (await r.json())?.data ?? {}
      const rs = d.items ?? []
      total = Number(d.paging?.total ?? 0)
      for (const p of rs) {
        if (!/^MLV\d+$/.test(String(p._id))) continue
        items.push({
          publicacion: String(p._id),
          titulo: p.title ? String(p.title).slice(0, 300) : null,
          peso: Number.isFinite(Number(p.weight)) ? Number(p.weight) : null,
          estado: p.status ? String(p.status).slice(0, 30) : null,
          agencias: (p.shipping_agencies || []).map(a => String(a.name ?? a._id).slice(0, 40)).slice(0, 10),
        })
      }
      if (rs.length < 50 || items.length >= total) break
    }
    return { ok: true, items, completo: total > 0 && items.length >= total }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function bajarArchivos(guiaUrl, comprobanteUrl, tope = 45000) {
  // 1.3.8: con tope de tiempo y un reintento; si no baja, la orden se sube igual sin ese archivo (como antes con !ok).
  const traer = async url => {
    for (let i = 0; i < 2; i++) {
      const c = new AbortController()
      const t = setTimeout(() => c.abort(), tope)
      try { const r = await fetch(url, { credentials: 'include', signal: c.signal }); if (r.ok) return r; if (r.status < 500) return null }
      catch { /* sin respuesta: reintenta */ }
      finally { clearTimeout(t) }
    }
    return null
  }
  const b64 = async url => {
    const r = await traer(url)
    if (!r) return null
    const blob = await r.blob()
    if (blob.size > 5 * 1024 * 1024) return null
    const data = await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(blob) })
    return String(data).split(',')[1] ?? null
  }
  const ext = (comprobanteUrl || '').split('?')[0].split('.').pop().toLowerCase()
  // 1.4.1: guía y comprobante a la vez.
  const [guia_b64, comprobante_b64] = await Promise.all([guiaUrl ? b64(guiaUrl) : null, comprobanteUrl ? b64(comprobanteUrl) : null])
  return {
    guia_b64,
    comprobante_b64,
    comprobante_ext: ['jpeg', 'jpg', 'png', 'webp', 'pdf'].includes(ext) ? ext : 'jpeg',
  }
}
