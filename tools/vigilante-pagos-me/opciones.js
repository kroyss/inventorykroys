const campos = ['perfil', 'servidor', 'clave', 'basica']
const $ = id => document.getElementById(id)
const PRODUCCION = 'https://app.elcomerciantedigital.com'

async function mostrarEstado() {
  const { ultimo, clave } = await chrome.storage.local.get(['ultimo', 'clave'])
  $('estado').textContent = ultimo ? `${ultimo.hora}: ${ultimo.texto}`
    : clave ? 'Conectado. Espera el primer "Traer pagos y guías".' : 'Todavía no está conectado.'
}

chrome.storage.local.get(campos).then(v => {
  for (const c of campos) if (v[c]) $(c).value = v[c]
  mostrarEstado()
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
    $('estado').textContent = `✓ Conectado. ${r2?.texto ?? ''}\nYa puedes cerrar esta ventana.`
    $('codigo').value = ''
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
