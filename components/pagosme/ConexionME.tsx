'use client'
// ⚙ Conexión de Pagos ME (18-11): la línea de estado + el panel que se despliega ahí mismo (agregar cuenta, programa,
// extensión, conectar o desconectar la PC). El MISMO en Pagos ME y en Ventas → Por confirmar.
import { useState } from 'react'
import EstadoVigilante, { type DatosVigilante } from './EstadoVigilante'

/** Programa para la PC (tools/vigilante-pagos-me/instalador → public/descargas). */
// Con la versión en el enlace (23-10): Cloudflare guarda los .exe hasta 4 h; así cada versión nueva se baja al momento.
export const DESCARGA_PROGRAMA = '/descargas/InstalarPagosME.exe?v=1.3.8'

export default function VigilanteConConexion({ d, isAdmin, desdeML, onCambio, abiertoInicial = false }: {
  d: DatosVigilante & { vigilante: { clave?: boolean }; avanzado?: boolean }
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
  // 19-11: después de «Desconectar PCs» el panel queda mostrando cómo volver a conectar (antes solo decía «PCs desconectadas»).
  const [reconectar, setReconectar] = useState(false)

  const conectar = async () => {
    setMsg(null)
    const r = await fetch('/api/pagos-me/conexion', { method: 'POST' })
    const x = await r.json().catch(() => ({}))
    if (r.ok) setCodigo(x); else setMsg({ ok: false, t: x.error ?? 'Error' })
  }
  const desconectar = async () => {
    if (!confirm('Se desconectan TODAS las PCs y dejan de traer pagos y guías.\n\nPara volver a conectarlas: «Conectar una PC» te da un código; '
      + 'en cada PC instalas de nuevo el programa con ese código y lo escribes en el Asistente de envíos de cada perfil de Chrome.\n\n¿Seguir?')) return
    const r = await fetch('/api/pagos-me/conexion', { method: 'DELETE' })
    if (r.ok) { setMsg(null); setCodigo(null); setReconectar(true); onCambio(); conectar() } else setMsg({ ok: false, t: 'No se pudo desconectar' })
  }
  const generarClave = async () => {
    if (d.vigilante.clave && !confirm('Se genera una clave nueva y la anterior deja de funcionar. ¿Seguir?')) return
    const r = await fetch('/api/pagos-me/clave', { method: 'POST' })
    const x = await r.json().catch(() => ({}))
    if (r.ok) { setClave(x.clave); onCambio() } else setMsg({ ok: false, t: x.error ?? 'Error' })
  }
  const perfiles = d.vigilante.latidos.filter(l => l.perfil !== 'DESPERTADOR')
  // Sin ninguna PC dando señal (nunca se conectó, o se desconectaron): los pasos para conectar, con el botón a la vista.
  const sinPC = d.vigilante.latidos.length === 0
  // Al desconectar, o con el panel abierto y ninguna PC (la bienvenida de Pagos ME tiene la suya).
  const guia = isAdmin && agregar === null && (reconectar || (sinPC && abierto))

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
            {/* 19-11: la clave larga (instalación a mano, de antes de los códigos) solo para el dueño de la plataforma: a un
                cliente no le sirve y generarla desconecta todas sus PCs. */}
            {!desdeML && d.avanzado && (
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
        {guia && (
          <ConectarPC desconectadas={reconectar} codigo={codigo} onCodigo={conectar} onCerrar={() => { setReconectar(false); setCodigo(null) }} />
        )}
        {agregar !== null && (
          <AgregarCuenta cuenta={agregar} codigo={codigo} onOtroCodigo={conectar}
            desconectada={!!agregar && (d.cuentasML ?? []).some(c => c.nickname === agregar && c.estado !== 'activa')}
            onCerrar={() => { setAgregar(null); setCodigo(null) }} />
        )}
        {codigo && agregar === null && !guia && <CodigoConexion codigo={codigo.codigo} vence={codigo.vence_at} onCerrar={() => setCodigo(null)} />}
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

/** 19-11 (el dueño: «si alguien desconecta no tendría cómo conectar»): los pasos para conectar la PC, con el código
 *  ahí mismo. Sale al desconectar y cuando la empresa no tiene ninguna PC dando señal. */
function ConectarPC({ desconectadas, codigo, onCodigo, onCerrar }: {
  desconectadas: boolean; codigo: { codigo: string; vence_at: string } | null; onCodigo: () => void; onCerrar: () => void
}) {
  const paso = 'flex gap-3 items-start'
  const num = 'shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center'
  const sub = 'block text-xs text-neutral-500 mt-0.5'
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 space-y-3 text-sm text-neutral-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-neutral-900">{desconectadas ? 'PCs desconectadas · así las conectas de nuevo' : 'Conectar la PC de las guías'}</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {desconectadas ? 'Ninguna PC trae pagos ni guías hasta que la conectes con un código nuevo.'
              : 'El programa y el Asistente de envíos de Chrome se conectan con un mismo código.'}
          </p>
        </div>
        {desconectadas && <button onClick={onCerrar} className="text-emerald-700 text-xs shrink-0">Cerrar ✕</button>}
      </div>
      <ol className="space-y-2.5">
        <li className={paso}><span className={num}>1</span>
          <span>Tu código de conexión:
            {codigo ? (
              <span className="mt-1.5 flex flex-wrap items-center gap-3">
                <code className="select-all rounded bg-white px-2 py-1 font-mono text-xl font-semibold tracking-widest ring-1 ring-emerald-200">{codigo.codigo}</code>
                <button onClick={() => navigator.clipboard.writeText(codigo.codigo)} className="btn-secondary text-xs">Copiar</button>
                <span className="text-xs text-neutral-500">
                  Vale hasta las {new Date(codigo.vence_at).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit' })}.{' '}
                  <button onClick={onCodigo} className="underline">Otro código</button>
                </span>
              </span>
            ) : <span className="mt-1.5 block"><button onClick={onCodigo} className="btn-primary text-xs">Conectar una PC</button></span>}</span></li>
        <li className={paso}><span className={num}>2</span>
          <span>En la PC de las guías, <a href={DESCARGA_PROGRAMA} className="font-medium text-emerald-700 underline">descarga el programa</a> y
            ábrelo. Cuando pida el código, escribe el de arriba.
            <span className={sub}>{desconectadas ? 'Aunque ya estuviera instalado, hay que instalarlo de nuevo: el que tenía quedó con la conexión vieja.'
              : 'Si ya estaba instalado, instálalo encima: no se pierde nada.'}</span></span></li>
        <li className={paso}><span className={num}>3</span>
          <span>En <b>cada perfil de Chrome</b> (uno por cuenta de MercadoEnvíos): toca la <b>pieza de rompecabezas</b> → <b>Asistente de envíos</b> →
            escribe el mismo código → <b>Conectar</b>. Debe decir <b>«Conectado al sistema»</b>.
            <span className={sub}>¿No tiene el Asistente? Agrégalo desde <a href="/extension" target="_blank" className="underline">app.elcomerciantedigital.com/extension</a>.
              El código vale para todos los perfiles mientras no venza; si venció, pide otro.</span></span></li>
        <li className={paso}><span className={num}>4</span>
          <span>Listo: toca <b>Traer pagos y guías</b>. Arriba cada cuenta pasa a «conectado».</span></li>
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

