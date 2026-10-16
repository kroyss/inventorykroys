const campos = ['perfil', 'servidor', 'clave', 'basica']
const $ = id => document.getElementById(id)
const PRODUCCION = 'https://app.elcomerciantedigital.com'

// Qué cuenta de MercadoEnvíos está abierta aquí y a cuál del sistema corresponde (1.3.4).
function mostrarCuenta(v) {
  const el = $('cuenta')
  if (!v) { el.className = ''; el.textContent = ''; return }
  const esc = t => String(t ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const otra = '<br><button id="reverificar">Verificar de nuevo</button>'
  if (v.estado === 'ok') {
    el.className = 'ok'
    el.innerHTML = `✓ <b>Cuenta de MercadoEnvíos:</b> ${esc(v.cuenta) || '—'}<br>En el sistema: <b>${esc(v.nickname)}</b>${otra}`
  } else if (v.estado === 'distinta') {
    el.className = 'mal'
    el.innerHTML = `⚠ <b>Esta cuenta de MercadoEnvíos (${esc(v.cuenta) || 'sin nombre'}) no está conectada en el sistema.</b><br>`
      + `No se va a traer nada de ella. En este Chrome, entra a mercadoenvios.com.ve con la cuenta correcta.${otra}`
  } else if (v.estado === 'sin_sesion') {
    el.className = 'mal'
    el.innerHTML = `⚠ <b>No hay sesión de MercadoEnvíos en este Chrome.</b><br>Entra a mercadoenvios.com.ve con tu cuenta y vuelve a verificar.${otra}`
  } else if (v.estado === 'sin_datos') {
    el.className = 'info'
    el.innerHTML = `Cuenta de MercadoEnvíos: <b>${esc(v.cuenta) || '—'}</b><br>Todavía no hay ventas recientes para confirmar a qué cuenta del sistema corresponde; se confirma con la primera.${otra}`
  } else if (v.estado === 'verificando') {
    el.className = 'info'; el.textContent = 'Revisando qué cuenta de MercadoEnvíos está abierta en este Chrome…'
  } else {
    el.className = 'info'; el.innerHTML = `No se pudo revisar la cuenta${v.error ? `: ${esc(v.error)}` : ''}.${otra}`
  }
  const b = document.getElementById('reverificar')
  if (b) b.onclick = verificar
}

async function verificar() {
  mostrarCuenta({ estado: 'verificando' })
  mostrarCuenta(await chrome.runtime.sendMessage({ tipo: 'verificar' }))
}

async function mostrarEstado() {
  const { ultimo, clave } = await chrome.storage.local.get(['ultimo', 'clave'])
  $('estado').textContent = ultimo ? `${ultimo.hora}: ${ultimo.texto}`
    : clave ? 'Conectado. Espera el primer "Traer pagos y guías".' : 'Todavía no está conectado.'
}

// Ya conectada (1.3.5): "✓ Conectado" arriba y el código escondido en "Conectar con otro código".
function modoConectado(si) {
  $('conectado').hidden = !si
  $('formulario').hidden = si
}
$('otroCodigo').onclick = e => { e.preventDefault(); modoConectado(false); $('codigo').focus() }

chrome.storage.local.get([...campos, 'verificacion']).then(v => {
  for (const c of campos) if (v[c]) $(c).value = v[c]
  mostrarEstado()
  modoConectado(!!v.clave)
  // Conectada: muestra la última verificación y la renueva en el momento.
  if (v.clave) { mostrarCuenta(v.verificacion ?? { estado: 'verificando' }); verificar() }
})

// Conectar con el código corto de Pagos ME (1.3.0): el sistema devuelve la clave de este perfil.
$('conectar').onclick = async () => {
  const codigo = $('codigo').value.trim()
  if (!codigo) { $('estado').textContent = 'Escribe el código que te dio el sistema.'; return }
  $('estado').textContent = 'Conectando…'
  const servidor = $('servidor').value || PRODUCCION
  const basica = $('basica').value.trim()
  const headers = { 'Content-Type': 'application/json' }
  if (basica) headers.Authorization = 'Basic ' + btoa(basica)
  try {
    const r = await fetch(`${servidor}/api/pagos-me/vigilante/vincular`, {
      method: 'POST', headers, body: JSON.stringify({ codigo }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || !d.clave) throw new Error(d.error || `El sistema respondió ${r.status}`)
    const { perfil } = await chrome.storage.local.get('perfil')
    // El perfil es solo un nombre interno: en pantalla se ve la cuenta de MercadoEnvíos.
    const nuevo = perfil || `CUENTA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    await chrome.storage.local.set({ clave: d.clave, servidor, perfil: nuevo, basica })
    $('clave').value = d.clave; $('perfil').value = nuevo
    const r2 = await chrome.runtime.sendMessage({ tipo: 'latido' })
    $('estado').textContent = `✓ Conectado. ${r2?.texto ?? ''}`
    $('codigo').value = ''
    modoConectado(true)
    await verificar()
  } catch (e) {
    $('estado').textContent = `No se pudo conectar: ${e.message}`
  }
}

$('guardar').onclick = async () => {
  const v = Object.fromEntries(campos.map(c => [c, $(c).value.trim()]))
  v.perfil = v.perfil.toUpperCase()
  await chrome.storage.local.set(v)
  $('estado').textContent = 'Guardado. El vigilante se conecta en menos de 1 minuto.'
}

$('probar').onclick = async () => {
  $('estado').textContent = 'Probando…'
  const r = await chrome.runtime.sendMessage({ tipo: 'latido' })
  $('estado').textContent = r?.texto ?? 'Sin respuesta'
}
