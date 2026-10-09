const campos = ['perfil', 'servidor', 'clave', 'basica']
const $ = id => document.getElementById(id)

async function mostrarEstado() {
  const { ultimo } = await chrome.storage.local.get('ultimo')
  $('estado').textContent = ultimo ? `${ultimo.hora}: ${ultimo.texto}` : 'Todavía no se conectó.'
}

chrome.storage.local.get(campos).then(v => {
  for (const c of campos) if (v[c]) $(c).value = v[c]
  mostrarEstado()
})

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
