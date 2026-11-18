'use client'
// ⚙ Conexión de Pagos ME (18-11): la línea de estado + el panel que se despliega ahí mismo (agregar cuenta, programa,
// extensión, conectar o desconectar la PC). El MISMO en Pagos ME y en Ventas → Por confirmar.
import { useState } from 'react'
import EstadoVigilante, { type DatosVigilante } from './EstadoVigilante'

/** Programa para la PC (tools/vigilante-pagos-me/instalador → public/descargas). */
// Con la versión en el enlace (23-10): Cloudflare guarda los .exe hasta 4 h; así cada versión nueva se baja al momento.
export const DESCARGA_PROGRAMA = '/descargas/InstalarPagosME.exe?v=1.3.7'

export default function VigilanteConConexion({ d, isAdmin, desdeML, onCambio, abiertoInicial = false }: {
  d: DatosVigilante & { vigilante: { clave?: boolean } }
  /** Puede configurar (permiso pagos_me_config): sin él, solo la línea de estado. */
  isAdmin: boolean
  desdeML: boolean
  onCambio: () => void
  abiertoInicial?: boolean
}) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [agregar, setAgregar] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<{ codigo: string; vence_at: string } | null>(null)
  const [clave, setClave] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  const conectar = async () => {
    setMsg(null)
    const r = await fetch('/api/pagos-me/conexion', { method: 'POST' })
    const x = await r.json().catch(() => ({}))
    if (r.ok) setCodigo(x); else setMsg({ ok: false, t: x.error ?? 'Error' })
  }
  const desconectar = async () => {
    if (!confirm('Se desconectan TODAS las PCs: dejan de traer pagos hasta que las conectes de nuevo con un código. ¿Seguir?')) return
    const r = await fetch('/api/pagos-me/conexion', { method: 'DELETE' })
    if (r.ok) { setMsg({ ok: true, t: 'PCs desconectadas.' }); setCodigo(null); onCambio() } else setMsg({ ok: false, t: 'No se pudo desconectar' })
  }
  const generarClave = async () => {
    if (d.vigilante.clave && !confirm('Se genera una clave nueva y la anterior deja de funcionar. ¿Seguir?')) return
    const r = await fetch('/api/pagos-me/clave', { method: 'POST' })
    const x = await r.json().catch(() => ({}))
    if (r.ok) { setClave(x.clave); onCambio() } else setMsg({ ok: false, t: x.error ?? 'Error' })
  }
  const perfiles = d.vigilante.latidos.filter(l => l.perfil !== 'DESPERTADOR')

  return (
    <EstadoVigilante d={d} conexion={isAdmin ? { abierto, onToggle: () => setAbierto(v => !v) } : null}
      onAgregar={isAdmin ? n => { setAbierto(true); setAgregar(n); conectar() } : undefined}
      extra={<>
        {isAdmin && abierto && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-neutral-100 pt-2">
            {perfiles.length > 0 && (
              <button onClick={() => { setAgregar(''); conectar() }} className="font-medium text-emerald-700 underline">+ Agregar otra cuenta de MercadoEnvíos</button>
            )}
            <a href={DESCARGA_PROGRAMA} className="underline text-neutral-500 hover:text-neutral-800">Descargar programa</a>
            <a href="/extension" target="_blank" className="underline text-neutral-500 hover:text-neutral-800">Extensión de Chrome</a>
            <button onClick={conectar} className="underline text-neutral-500 hover:text-neutral-800">Conectar una PC</button>
            {!desdeML && (
              <button onClick={generarClave} className="underline text-neutral-400 hover:text-neutral-800" title="Para la instalación a mano (avanzado)">
                {d.vigilante.clave ? 'Clave larga' : 'Generar clave'}
              </button>
            )}
            {d.vigilante.clave && (
              <button onClick={desconectar} className="underline text-neutral-400 hover:text-red-700">Desconectar PCs</button>
            )}
          </div>
        )}
        {msg && <p className={`mt-2 ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.t}</p>}
        {agregar !== null && (
          <AgregarCuenta cuenta={agregar} codigo={codigo} onOtroCodigo={conectar}
            desconectada={!!agregar && (d.cuentasML ?? []).some(c => c.nickname === agregar && c.estado !== 'activa')}
            onCerrar={() => { setAgregar(null); setCodigo(null) }} />
        )}
        {codigo && agregar === null && <CodigoConexion codigo={codigo.codigo} vence={codigo.vence_at} onCerrar={() => setCodigo(null)} />}
        {clave && (
          <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-900">
            Clave del vigilante (se muestra solo esta vez; cópiala en la extensión de cada perfil):
            <code className="ml-2 select-all font-mono bg-white px-1.5 py-0.5 rounded border">{clave}</code>
            <button onClick={() => navigator.clipboard.writeText(clave)} className="ml-2 underline">Copiar</button>
          </div>
        )}
      </>} />
  )
}

/** Segunda (o tercera…) cuenta de MercadoEnvíos (29-10): cada cuenta va en su propio perfil de Chrome con el Asistente.
 *  El programa de la PC encuentra solo el perfil nuevo: no se reinstala nada. El código ya viene generado. */
function AgregarCuenta({ cuenta, codigo, desconectada, onOtroCodigo, onCerrar }: {
  cuenta: string; codigo: { codigo: string; vence_at: string } | null; desconectada: boolean
  onOtroCodigo: () => void; onCerrar: () => void
}) {
  const nombre = cuenta || 'la otra cuenta'
  const paso = 'flex gap-3 items-start'
  const num = 'shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center'
  const sub = 'block text-xs text-neutral-500 mt-0.5'
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 space-y-3 text-sm text-neutral-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-neutral-900">Agregar {cuenta ? <b>{cuenta}</b> : 'otra cuenta de MercadoEnvíos'}</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            Cada cuenta va en <b>su propio perfil de Chrome</b>, con su sesión de MercadoEnvíos. El programa de la PC encuentra solo el
            perfil nuevo: no hay que reinstalar nada.
          </p>
        </div>
        <button onClick={onCerrar} className="text-emerald-700 text-xs shrink-0">Cerrar ✕</button>
      </div>
      <ol className="space-y-2.5">
        <li className={paso}><span className={num}>1</span>
          <span>La cuenta tiene que estar conectada en <a href="/cuentas-ml" className="font-medium text-emerald-700 underline">Cuentas ML</a>.
            {desconectada
              ? <span className="block text-xs font-medium text-red-700 mt-0.5">⚠ {cuenta} está desconectada: conéctala primero, si no sus guías no entran.</span>
              : <span className={sub}>Si no aparece ahí, conéctala primero.</span>}</span></li>
        <li className={paso}><span className={num}>2</span>
          <span>En la PC de las guías, abre Chrome y crea <b>otro perfil</b>: toca tu foto (arriba a la derecha) → <b>Agregar</b> →{' '}
            <b>Continuar sin cuenta</b> → ponle de nombre {cuenta ? <b>{cuenta}</b> : 'el de la cuenta'}.
            <span className={sub}>Se abre una ventana nueva: ese es el perfil de {nombre}. Los pasos 3 y 4 van en esa ventana.</span></span></li>
        <li className={paso}><span className={num}>3</span>
          <span>En esa ventana, entra a <b>MercadoEnvíos con la cuenta de {nombre}</b> y deja la sesión iniciada. Después agrega el
            Asistente desde <a href="/extension" target="_blank" className="font-medium text-emerald-700 underline">app.elcomerciantedigital.com/extension</a>{' '}
            → <b>Añadir a Chrome</b>.</span></li>
        <li className={paso}><span className={num}>4</span>
          <span>Toca la <b>pieza de rompecabezas</b> (arriba a la derecha) → abre <b>Asistente de envíos</b> → pega este código → <b>Conectar</b>.
            Debe decir <b>«Conectado al sistema»</b>.
            {codigo ? (
              <span className="mt-1.5 flex flex-wrap items-center gap-3">
                <code className="select-all rounded bg-white px-2 py-1 font-mono text-xl font-semibold tracking-widest ring-1 ring-emerald-200">{codigo.codigo}</code>
                <button onClick={() => navigator.clipboard.writeText(codigo.codigo)} className="btn-secondary text-xs">Copiar</button>
                <span className="text-xs text-neutral-500">
                  Vale hasta las {new Date(codigo.vence_at).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit' })}.{' '}
                  <button onClick={onOtroCodigo} className="underline">Otro código</button>
                </span>
              </span>
            ) : <span className={sub}>Generando el código…</span>}</span></li>
        <li className={paso}><span className={num}>5</span>
          <span>Listo: toca <b>Traer pagos y guías</b>. Se abre un Chrome por cuenta, trae lo suyo y se cierra. Arriba, {nombre} pasa a
            «conectado».
            <span className={sub}>No cierres sesión de MercadoEnvíos en ningún perfil. Si se vence, al traer queda abierta esa ventana para
              que vuelvas a entrar.</span></span></li>
      </ol>
    </div>
  )
}

/** El código para conectar la PC: grande, para copiarlo o dictarlo. */
export function CodigoConexion({ codigo, vence, onCerrar }: { codigo: string; vence: string; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const hasta = new Date(vence).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit' })
  return (
    <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-900 flex flex-wrap items-center gap-3">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-emerald-700">Código de conexión</div>
        <code className="select-all font-mono text-2xl font-semibold tracking-widest">{codigo}</code>
      </div>
      <button onClick={() => { navigator.clipboard.writeText(codigo); setCopiado(true) }} className="btn-secondary text-xs">
        {copiado ? 'Copiado ✓' : 'Copiar'}
      </button>
      <p className="text-xs text-emerald-800 flex-1 min-w-[200px]">
        Escríbelo en el programa al instalarlo y en el Asistente de envíos de cada cuenta de Chrome. Vale hasta las {hasta}{hasta.endsWith('.') ? '' : '.'}
        Las PCs que ya estaban conectadas siguen funcionando.
      </p>
      <button onClick={onCerrar} className="text-emerald-700 text-xs">Cerrar ✕</button>
    </div>
  )
}

