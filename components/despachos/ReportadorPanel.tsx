'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'

interface Cuenta { nombre: string; filtro: string; pagina: string }
interface Config { cuentas: Cuenta[]; plantillas: string[]; bloque: string }
interface Orden {
  id: number; origen: 'WEB' | 'AUTO' | 'EQUIPO'
  estado: 'PENDIENTE' | 'EN_CURSO' | 'TERMINADA' | 'CANCELADA' | 'VENCIDA' | 'INTERRUMPIDA'
  created_at: string; tomada_at: string | null; terminada_at: string | null
  detener: boolean; resumen: Record<string, number> | null; pedida_por: string | null
}
interface Equipo {
  id: number; nombre: string | null; vinculado_at: string | null; last_seen_at: string | null
  version: string | null; codigo: string | null; codigo_expira: string | null
  en_linea: boolean; auto_reportar: boolean; actividad: string | null; orden: Orden | null
}
interface Estado {
  equipos: Equipo[]; config: Config; pendientes: number; problemas: string[]; avisos: string[]; limite: number
  porVenta: boolean; conectadas: string[]; sugeridas: Pick<Config, 'plantillas' | 'bloque'>
}

const activa = (o: Orden | null) => !!o && (o.estado === 'PENDIENTE' || o.estado === 'EN_CURSO')

const fechaHora = (s: string) => new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

// Igual que lib/reportador.ts paraTealca(): en los envíos Tealca ZOOM pasa a TEALCA.
const paraTealca = (t: string) =>
  t.replace(/zoom/gi, m => (m === m.toUpperCase() ? 'TEALCA' : m[0] === m[0].toUpperCase() ? 'Tealca' : 'tealca'))

// Igual que lib/reportador.ts rellenar() y mensajeEnvio(): {transportista} → ZOOM, y en Tealca ZOOM → TEALCA.
const rellenar = (t: string, bloque: string, pagina: string, guia: string) =>
  (t + bloque).split('{pagina}').join(pagina).split('{guia}').join(guia)
const conTransportista = (t: string) => t.split('{transportista}').join('ZOOM')
const mensajeEnvio = (t: string, bloque: string, pagina: string, guia: string, carrier: 'ZOOM' | 'TEALCA') => {
  const m = rellenar(conTransportista(t), conTransportista(bloque), pagina, guia)
  return carrier === 'TEALCA' ? paraTealca(m) : m
}
// Igual que lib/reportador.ts paginaML(): página oficial de la cuenta (sin cuentas escritas a mano).
const paginaML = (nick: string) => `https://www.mercadolibre.com.ve/pagina/${nick.toLowerCase()}`
// Variables que el sistema necesita en cada plantilla: no se pueden borrar, solo mover.
const VARIABLES = ['{guia}', '{transportista}'] as const
// Guías de ejemplo para la vista previa.
const GUIA_ZOOM = '1711920037', GUIA_TEALCA = '41234567'

/** Cómo le llega el mensaje al comprador, por ZOOM y por TEALCA. */
function VistaPrevia({ plantilla, bloque, pagina }: { plantilla: string; bloque: string; pagina: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(['ZOOM', 'TEALCA'] as const).map(c => (
        <div key={c}>
          <p className="text-[11px] font-medium text-neutral-500 mb-0.5">Envío por {c}</p>
          <pre className="text-xs bg-white border border-neutral-200 rounded p-2 whitespace-pre-wrap font-sans">
            {mensajeEnvio(plantilla, bloque, pagina, c === 'ZOOM' ? GUIA_ZOOM : GUIA_TEALCA, c)}
          </pre>
        </div>
      ))}
    </div>
  )
}

/** Mensajes y cuentas del Reportador + programa de escritorio (respaldo de la API). */
export default function ReportadorPanel({ isAdmin }: { isAdmin: boolean }) {
  const confirm = useConfirm()
  const [estado, setEstado]   = useState<Estado | null>(null)
  const [editando, setEditando] = useState<Config | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(() => fetch('/api/despachos/reportador').then(async r => {
    if (r.ok) setEstado(await r.json())
  }), [])
  // Se refresca solo: rápido mientras un equipo reporta (para ver el avance), lento en espera.
  const enMarcha = !!estado?.equipos.some(e => activa(e.orden))
  useEffect(() => {
    cargar()
    const t = setInterval(() => { if (!document.hidden) cargar() }, enMarcha ? 5000 : 20000)
    return () => clearInterval(t)
  }, [cargar, enMarcha])

  const reportar = async (e: Equipo) => {
    setError(null)
    const r = await fetch(`/api/despachos/reportador/equipos/${e.id}/orden`, { method: 'POST' })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) { setError(body.error ?? 'Error'); cargar(); return }
    if (!body.en_linea) {
      setError(`"${e.nombre ?? 'El equipo'}" no está conectado ahora: el reporte empieza cuando se encienda y abra el Reportador (la orden vence en 12 h).`)
    }
    cargar()
  }

  const detener = async (e: Equipo) => {
    if (e.orden?.estado === 'EN_CURSO' && !await confirm({
      title: 'Detener reporte',
      message: 'Se detiene después del mensaje en curso. Lo que no se alcanzó a enviar queda pendiente para el próximo reporte.',
      confirmText: 'Detener',
    })) return
    await fetch(`/api/despachos/reportador/equipos/${e.id}/orden`, { method: 'DELETE' })
    cargar()
  }

  const setAuto = async (e: Equipo, auto: boolean) => {
    await fetch(`/api/despachos/reportador/equipos/${e.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto_reportar: auto }),
    })
    cargar()
  }

  const vincular = async () => {
    setError(null)
    const r = await fetch('/api/despachos/reportador/equipos', { method: 'POST' })
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'Error'); return }
    cargar()
  }

  const desvincular = async (e: Equipo) => {
    if (!await confirm({
      title: 'Desvincular equipo',
      message: `¿Desvincular "${e.nombre ?? 'equipo'}"? Dejará de poder reportar hasta que lo vuelvas a vincular.`,
      confirmText: 'Desvincular', danger: true,
    })) return
    await fetch(`/api/despachos/reportador/equipos/${e.id}`, { method: 'DELETE' })
    cargar()
  }

  const guardar = async (config: Config | null = editando) => {
    if (!config) return
    setGuardando(true); setError(null)
    const r = await fetch('/api/despachos/reportador', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
    })
    setGuardando(false)
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'Error'); return }
    setEditando(null)
    cargar()
  }

  if (!estado) return null
  const { equipos, config, pendientes, problemas, avisos, limite, porVenta, conectadas, sugeridas } = estado
  // Todavía sin mensajes: se le proponen unos listos para que los revise antes del primer reporte.
  const sinMensajes = config.plantillas.length === 0
  const vinculados = equipos.filter(e => e.vinculado_at)
  const codigos    = equipos.filter(e => !e.vinculado_at && e.codigo)

  const enUso = vinculados.some(e => activa(e.orden) || e.auto_reportar) || codigos.length > 0

  return (
    <>
      {/* Mensajes y cuentas: los usan la API y el programa de escritorio. */}
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-800">Mensaje al comprador</h2>
            <p className="text-xs text-neutral-500">
              {config.plantillas.length} plantilla(s) que se eligen al azar ·{' '}
              {porVenta
                ? <>cada mensaje sale desde la cuenta de MercadoLibre de su venta{conectadas.length ? ` (${conectadas.join(', ')})` : ''}.</>
                : <>cuentas: {config.cuentas.map(c => c.nombre).join(', ')}.</>}
              {' '}Lo usan el reporte por API y el programa de escritorio.
            </p>
          </div>
          {isAdmin && !editando && !sinMensajes && (
            <button onClick={() => setEditando(structuredClone(config))} className="btn-secondary text-xs">Editar mensajes</button>
          )}
        </div>
        {sinMensajes && !editando && (
          <div className="mx-4 mb-4 rounded-lg border border-sky-200 bg-sky-50 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-sky-900">Antes de tu primer reporte: revisa el mensaje que recibirá tu comprador</p>
              <p className="text-xs text-sky-800 mt-0.5">
                Te dejamos estos mensajes listos. Se elige uno al azar para cada comprador y el sistema pone su guía y el transportista
                (ZOOM o TEALCA) solo. Puedes usarlos así o cambiarlos.
              </p>
            </div>
            <ul className="text-xs text-neutral-700 space-y-1 list-disc pl-5">
              {sugeridas.plantillas.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
            <div>
              <p className="text-xs font-medium text-sky-900 mb-1">Así le llega a tu comprador:</p>
              <VistaPrevia plantilla={sugeridas.plantillas[0]} bloque={sugeridas.bloque} pagina={paginaML(conectadas[0] ?? 'tutienda')} />
            </div>
            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => guardar({ ...config, ...sugeridas })} disabled={guardando} className="btn-primary text-sm">
                  {guardando ? 'Guardando…' : 'Usar estos mensajes'}
                </button>
                <button onClick={() => setEditando({ ...structuredClone(config), ...structuredClone(sugeridas) })} className="btn-secondary text-sm">
                  Cambiarlos
                </button>
              </div>
            ) : (
              <p className="text-xs text-sky-800">Pídele al administrador de tu empresa que los revise y los guarde.</p>
            )}
          </div>
        )}
        {avisos.length > 0 && !editando && (
          <div className="mx-4 mb-3 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-sm">
            {avisos.map((a, i) => <p key={i}>{a}</p>)}
          </div>
        )}
        {problemas.length > 0 && !editando && !sinMensajes && (
          <div className="mx-4 mb-3 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-sm">
            Configuración incompleta: {problemas.join(' · ')}
          </div>
        )}
        {editando && (
          <EditorConfig config={editando} limite={limite} onChange={setEditando} conectadas={conectadas}
            onGuardar={() => guardar()} onCancelar={() => { setEditando(null); setError(null) }} guardando={guardando} />
        )}
      </section>

      {/* Programa de escritorio: queda de respaldo por si la API falla algún día. */}
      <details open={enUso} className="bg-white rounded-xl border border-neutral-200 shadow-sm group">
        <summary className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 cursor-pointer list-none">
          <div>
            <h2 className="text-sm font-semibold text-neutral-800">
              <span className="inline-block text-neutral-400 mr-1 transition-transform group-open:rotate-90">›</span>
              Programa de escritorio <span className="font-normal text-neutral-500">(respaldo)</span>
            </h2>
            <p className="text-xs text-neutral-500 ml-4">
              Úsalo solo si el reporte por API falla. {vinculados.length} equipo(s) vinculado(s)
              {vinculados.some(e => e.en_linea) ? ' · uno en línea' : ''}.
            </p>
          </div>
        </summary>
        <div className="border-t border-neutral-100">
          {isAdmin && (
            <div className="flex justify-end px-4 pt-3">
              <button onClick={vincular} className="btn-secondary text-xs">+ Vincular equipo</button>
            </div>
          )}
          <div className="px-4 py-3 space-y-2 text-sm">
            {codigos.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 bg-neutral-50 border border-neutral-200 rounded px-3 py-2">
                <span>Código para vincular:</span>
                <span className="font-mono text-lg font-bold tracking-widest">{c.codigo}</span>
                <span className="text-xs text-sky-700">
                  Escríbelo en el Reportador del equipo. Vence {c.codigo_expira ? `a las ${new Date(c.codigo_expira).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit' })}` : 'pronto'}.
                </span>
              </div>
            ))}
            {vinculados.length === 0
              ? <p className="text-neutral-400">Ningún equipo vinculado.</p>
              : vinculados.map(e => (
                  <FilaEquipo key={e.id} e={e} isAdmin={isAdmin} pendientes={pendientes} configOk={problemas.length === 0}
                    onReportar={() => reportar(e)} onDetener={() => detener(e)}
                    onAuto={v => setAuto(e, v)} onDesvincular={() => desvincular(e)} />
                ))}
          </div>
        </div>
      </details>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
    </>
  )
}

const RESUMEN_TXT: [string, string][] = [
  ['ENVIADO', 'enviado(s)'], ['SIN_CHAT', 'sin chat'], ['RECHAZADO', 'rechazado(s)'], ['ERROR', 'con error'],
]
const ORIGEN_TXT = { WEB: 'desde la web', AUTO: 'al cerrar la jornada', EQUIPO: 'desde el equipo' }
const FINAL_TXT = {
  CANCELADA:    'cancelado antes de empezar',
  VENCIDA:      'el equipo no lo tomó en 12 h',
  INTERRUMPIDA: 'se cortó (el programa se cerró): lo no enviado sigue pendiente',
}

function FilaEquipo({ e, isAdmin, pendientes, configOk, onReportar, onDetener, onAuto, onDesvincular }: {
  e: Equipo; isAdmin: boolean; pendientes: number; configOk: boolean
  onReportar: () => void; onDetener: () => void; onAuto: (v: boolean) => void; onDesvincular: () => void
}) {
  const o = e.orden
  let linea: React.ReactNode = null
  if (o?.estado === 'PENDIENTE') {
    linea = <span className="text-sky-700">
      Esperando que el equipo lo tome ({ORIGEN_TXT[o.origen]}{o.pedida_por ? ` por ${o.pedida_por}` : ''}, {fechaHora(o.created_at)})
      {!e.en_linea && ' · el equipo está desconectado'}
    </span>
  } else if (o?.estado === 'EN_CURSO') {
    linea = <span className="text-sky-700 font-medium">
      ⏳ Reportando{e.actividad ? `: ${e.actividad}` : '…'}{o.detener ? ' · deteniendo…' : ''}
    </span>
  } else if (o?.terminada_at) {
    const r = o.resumen ?? {}
    const partes = RESUMEN_TXT.filter(([k]) => r[k]).map(([k, t]) => `${r[k]} ${t}`)
    const txt = o.estado === 'TERMINADA'
      ? (partes.length ? partes.join(' · ') : 'no había nada que reportar')
      : FINAL_TXT[o.estado as keyof typeof FINAL_TXT]
    const mal = o.estado !== 'TERMINADA' || !!(r.ERROR || r.RECHAZADO)
    linea = <span className={mal ? 'text-amber-700' : 'text-neutral-600'}>
      Último reporte {fechaHora(o.terminada_at)} ({ORIGEN_TXT[o.origen]}): {txt}
    </span>
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-2 py-1.5 border-t border-neutral-100 first:border-t-0">
      <div className="min-w-0">
        <div>
          <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${e.en_linea ? 'bg-green-500' : 'bg-neutral-300'}`} />
          <span className="font-medium">{e.nombre ?? `Equipo #${e.id}`}</span>
          <span className="text-xs text-neutral-500 ml-2">
            {e.en_linea ? 'en línea' : e.last_seen_at ? `desconectado · última conexión ${fechaHora(e.last_seen_at)}` : 'sin conexión'}
            {e.version ? ` · v${e.version}` : ''}
          </span>
        </div>
        {linea && <div className="text-xs mt-0.5 ml-4">{linea}</div>}
        {isAdmin && (
          <label className="text-xs text-neutral-500 ml-4 mt-0.5 flex items-center gap-1.5 cursor-pointer w-fit">
            <input type="checkbox" checked={e.auto_reportar} onChange={ev => onAuto(ev.target.checked)} />
            Reportar solo al cerrar la jornada
          </label>
        )}
      </div>
      <div className="flex items-center gap-2">
        {activa(o)
          ? <button onClick={onDetener} disabled={!!o?.detener} className="btn-secondary text-xs">
              {o?.estado === 'PENDIENTE' ? 'Cancelar' : o?.detener ? 'Deteniendo…' : '■ Detener'}
            </button>
          : <button onClick={onReportar} disabled={!pendientes || !configOk} className="btn-primary text-xs"
              title={!configOk ? 'Corrige la configuración de mensajes' : !pendientes ? 'No hay envíos pendientes' : undefined}>
              ▶ Reportar{pendientes ? ` (${pendientes})` : ''}
            </button>}
        {isAdmin && <button onClick={onDesvincular} className="text-xs text-neutral-400 hover:text-red-600">Desvincular</button>}
      </div>
    </div>
  )
}

function EditorConfig({ config, limite, conectadas, onChange, onGuardar, onCancelar, guardando }: {
  config: Config; limite: number; conectadas: string[]; onChange: (c: Config) => void
  onGuardar: () => void; onCancelar: () => void; guardando: boolean
}) {
  const setCuenta = (i: number, k: keyof Cuenta, v: string) =>
    onChange({ ...config, cuentas: config.cuentas.map((c, j) => (j === i ? { ...c, [k]: v } : c)) })
  const [aviso, setAviso] = useState<{ i: number; texto: string } | null>(null)
  const areas = useRef<(HTMLTextAreaElement | null)[]>([])
  // {guia} y {transportista} no se pueden borrar (el comprador se quedaría sin guía o con el transportista
  // equivocado): si un cambio los quita, no se aplica.
  const setPlantilla = (i: number, v: string) => {
    const borrada = VARIABLES.find(x => config.plantillas[i].includes(x) && !v.includes(x))
    if (borrada) {
      setAviso({ i, texto: `${borrada} no se puede borrar: el sistema lo necesita. Para cambiarlo de lugar, pon el cursor donde lo quieres y toca «Mover ${borrada} aquí».` })
      return
    }
    setAviso(a => (a?.i === i ? null : a))
    onChange({ ...config, plantillas: config.plantillas.map((p, j) => (j === i ? v : p)) })
  }
  // Mueve (o agrega) la variable a donde está el cursor, sin que llegue a faltar en ningún momento.
  const moverAqui = (i: number, variable: string) => {
    const t = config.plantillas[i]
    const el = areas.current[i]
    let pos = el ? el.selectionStart : t.length
    // Cursor dentro de la variable misma: cuenta como al inicio de ella.
    for (let k = t.indexOf(variable); k >= 0; k = t.indexOf(variable, k + 1)) if (pos > k && pos < k + variable.length) pos = k
    const sin = t.split(variable).join('')
    const antes = t.slice(0, pos).split(variable).join('')
    const nuevo = (antes + variable + sin.slice(antes.length)).replace(/ {2,}/g, ' ')
    setAviso(null)
    onChange({ ...config, plantillas: config.plantillas.map((p, j) => (j === i ? nuevo : p)) })
  }
  const paginaEjemplo = config.cuentas.length ? config.cuentas[0].pagina : paginaML(conectadas[0] ?? 'tutienda')
  const paginaLarga = config.cuentas.length
    ? config.cuentas.reduce((a, c) => (c.pagina.length > a.length ? c.pagina : a), '')
    : paginaML('x'.repeat(24))
  const input = 'border border-neutral-300 rounded px-2 py-1 text-sm w-full'

  const cuentasEditor = (
        <div className="space-y-2">
          {config.cuentas.map((c, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr_auto] gap-2 items-center">
              <input className={input} placeholder="Nombre (p.ej. MITIENDA)" value={c.nombre} onChange={e => setCuenta(i, 'nombre', e.target.value)} />
              <input className={input} placeholder="Remitente empieza con" value={c.filtro} onChange={e => setCuenta(i, 'filtro', e.target.value)} />
              <input className={input} placeholder="Página de la tienda (opcional)" value={c.pagina} onChange={e => setCuenta(i, 'pagina', e.target.value)} />
              <button onClick={() => onChange({ ...config, cuentas: config.cuentas.filter((_, j) => j !== i) })}
                className="text-xs text-neutral-400 hover:text-red-600">Quitar</button>
            </div>
          ))}
          {config.cuentas.length < 5 && (
            <button onClick={() => onChange({ ...config, cuentas: [...config.cuentas, { nombre: '', filtro: '', pagina: '' }] })}
              className="text-xs text-neutral-600 underline">+ Agregar cuenta</button>
          )}
        </div>
  )

  return (
    <div className="border-t border-neutral-100 px-4 py-4 space-y-4 bg-neutral-50/50">
      {config.cuentas.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold text-neutral-600 mb-1">Cuentas por remitente</h3>
          <p className="text-xs text-neutral-500 mb-2">
            Cada envío va a la cuenta cuyo <b>remitente</b> (en la etiqueta) empieza con el texto indicado. Si quitas todas, cada envío
            sale desde la cuenta de MercadoLibre de su venta{conectadas.length ? ` (${conectadas.join(', ')})` : ''}.
          </p>
          {cuentasEditor}
        </div>
      ) : (
        <details className="text-xs">
          <summary className="cursor-pointer text-neutral-500">
            Cuentas: cada envío sale desde la cuenta de MercadoLibre de su venta{conectadas.length ? ` (${conectadas.join(', ')})` : ''}. <u>Avanzado</u>
          </summary>
          <p className="text-neutral-500 my-2">
            Solo si usas el programa de escritorio con cuentas que <b>no</b> están conectadas al sistema: la cuenta se reconoce por el
            comienzo del remitente de la etiqueta. Si no es tu caso, déjalo vacío.
          </p>
          {cuentasEditor}
        </details>
      )}

      <div>
        <h3 className="text-xs font-semibold text-neutral-600 mb-1">Plantillas del mensaje</h3>
        <p className="text-xs text-neutral-500 mb-2">
          Se elige una al azar por comprador. <code>{'{guia}'}</code> se cambia por la guía y <code>{'{transportista}'}</code> por
          ZOOM o TEALCA según el envío (no escribas el transportista a mano: un mensaje que dice TEALCA también le llegaría así a los
          de ZOOM). Estas dos variables no se pueden borrar, solo cambiar de lugar.{' '}
          <code>{'{pagina}'}</code> (opcional) se cambia por {config.cuentas.length
            ? 'la página de la cuenta'
            : <>la página oficial de la cuenta de la venta ({paginaML(conectadas[0] ?? 'tutienda')})</>}.
          {' '}MercadoLibre corta en {limite} caracteres sin avisar.
        </p>
        <div className="space-y-2">
          {config.plantillas.map((p, i) => {
            const largo = Math.max(mensajeEnvio(p, config.bloque, paginaLarga, '9'.repeat(12), 'ZOOM').length,
                                   mensajeEnvio(p, config.bloque, paginaLarga, '9'.repeat(12), 'TEALCA').length)
            return (
              <div key={i}>
              {/tealca/i.test(p) && (
                <p className="text-[11px] text-amber-700 mb-0.5">
                  Dice TEALCA: los compradores de ZOOM también leerían TEALCA. Cámbialo por {'{transportista}'}.
                </p>
              )}
              {!p.includes('{guia}') && <p className="text-[11px] text-red-700 mb-0.5">Le falta {'{guia}'}: el comprador no recibiría su guía.</p>}
              {!p.includes('{transportista}') && !/zoom/i.test(p) && (
                <p className="text-[11px] text-red-700 mb-0.5">Le falta {'{transportista}'}: el comprador no sabría si es ZOOM o TEALCA.</p>
              )}
              <div className="flex gap-2 items-start">
                <textarea ref={el => { areas.current[i] = el }} className={`${input} min-h-[2.5rem]`} rows={2} value={p}
                  onChange={e => setPlantilla(i, e.target.value)} onDrop={e => e.preventDefault()} />
                <span className={`text-xs whitespace-nowrap pt-1 ${largo > limite ? 'text-red-700 font-semibold' : 'text-neutral-500'}`}>
                  {largo}/{limite}
                </span>
                <button onClick={() => onChange({ ...config, plantillas: config.plantillas.filter((_, j) => j !== i) })}
                  className="text-xs text-neutral-400 hover:text-red-600 pt-1">Quitar</button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {VARIABLES.map(x => (
                  <button key={x} type="button" onMouseDown={e => e.preventDefault()} onClick={() => moverAqui(i, x)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100">
                    {p.includes(x) ? `Mover ${x} aquí` : `Poner ${x} aquí`}
                  </button>
                ))}
              </div>
              {aviso?.i === i && <p className="text-[11px] text-amber-700 mt-1">{aviso.texto}</p>}
              </div>
            )
          })}
          {config.plantillas.length < 10 && (
            <button onClick={() => onChange({ ...config, plantillas: [...config.plantillas, 'Buen día, su pedido fue despachado. Guía {transportista}: {guia}'] })}
              className="text-xs text-neutral-600 underline">+ Agregar plantilla</button>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-neutral-600 mb-1">Texto final (se agrega a todas las plantillas)</h3>
        <p className="text-xs text-neutral-500 mb-1">
          Opcional. Por ejemplo: «¡Gracias por comprar en MI TIENDA! Síguenos en nuestra cuenta oficial: {'{pagina}'}» (empieza con un espacio).
        </p>
        <textarea className={input} rows={5} value={config.bloque} onChange={e => onChange({ ...config, bloque: e.target.value })} />
        <p className="text-xs text-neutral-500 mt-1">
          Ojo: MercadoLibre rechaza links de Facebook (incluso acortados). t.me y youtube.com sí pasan.
        </p>
      </div>

      {config.plantillas[0] && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-600 mb-1">Vista previa (plantilla 1)</h3>
          <VistaPrevia plantilla={config.plantillas[0]} bloque={config.bloque} pagina={paginaEjemplo} />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="btn-secondary text-sm">Cancelar</button>
        <button onClick={onGuardar} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  )
}
