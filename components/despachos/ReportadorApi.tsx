'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useConfirm } from '@/components/ui/ConfirmProvider'

interface Procesado {
  venta: string; guia: string; carrier: string; cuenta: string | null
  resultado: 'ENVIADO' | 'YA_ENVIADO' | 'SIN_CHAT' | 'RECHAZADO' | 'ERROR' | 'SIN_CONEXION' | 'SIMULADO'
  detalle: string | null; mensaje: string | null
}
interface Corrida {
  id: number; simular: boolean; estado: 'corriendo' | 'terminada' | 'detenida' | 'interrumpida' | 'error'
  total: number; procesados: Procesado[]; error: string | null
  started_at: string; latido_at: string; finished_at: string | null
}
interface Estado {
  porCuenta: Record<string, number>; enEquipo: number; total: number; problemas: string[]
  conexiones: { nickname: string; estado: string }[]; soloSimula: boolean; mlListo: boolean
  corrida: Corrida | null
}

const ETIQUETA: Record<Procesado['resultado'], { t: string; c: string }> = {
  ENVIADO:      { t: 'Enviado',          c: 'text-emerald-700' },
  YA_ENVIADO:   { t: 'Ya lo tenía',      c: 'text-emerald-700' },
  SIMULADO:     { t: 'Se enviaría',      c: 'text-sky-700' },
  SIN_CONEXION: { t: 'Cuenta sin API',   c: 'text-amber-700' },
  SIN_CHAT:     { t: 'Sin chat',         c: 'text-amber-700' },
  RECHAZADO:    { t: 'Rechazado por ML', c: 'text-red-600' },
  ERROR:        { t: 'Error',            c: 'text-red-600' },
}
const hora = (s: string) => new Date(s).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })

/** Reportador por API: el servidor le escribe la guía a cada comprador, sin el programa. La corrida
 *  sigue EN EL SERVIDOR aunque se cierre esta pantalla (lib/reportadorCorrida.ts); aquí se ve el avance. */
export default function ReportadorApi({ conEscritorio = false }: { conEscritorio?: boolean }) {
  const confirm = useConfirm()
  const [estado, setEstado] = useState<Estado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pidiendo, setPidiendo] = useState(false)
  const [verDetalle, setVerDetalle] = useState(false)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/despachos/reportador/api', { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (r.ok) { setEstado(d); setError(null) } else setError(d.error ?? 'No se pudo cargar')
  }, [])
  useEffect(() => { cargar() }, [cargar])
  // Lo pendiente cambia sin tocar esta sección (apartar una guía, guías nuevas): se relee cada 30 s y al volver a la pestaña.
  useEffect(() => {
    const t = setInterval(cargar, 30_000)
    const alVolver = () => { if (document.visibilityState === 'visible') cargar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver) }
  }, [cargar])

  // Mientras corre, se consulta el avance cada 2,5 s.
  const corriendo = estado?.corrida?.estado === 'corriendo'
  useEffect(() => {
    if (!corriendo) return
    const t = setInterval(cargar, 2500)
    return () => clearInterval(t)
  }, [corriendo, cargar])

  const correr = async (simular: boolean) => {
    if (!simular) {
      const ok = await confirm({
        title: 'Reportar por API',
        message: `Se le escribirá su guía a ${estado?.total ?? 0} comprador(es) desde MercadoLibre, con tus plantillas. Antes de cada envío se revisa la conversación para no repetirle la guía a nadie. Puedes cerrar esta pantalla: sigue en el servidor.`,
        confirmText: 'Reportar ahora',
      })
      if (!ok) return
    }
    setPidiendo(true); setError(null); setVerDetalle(false)
    try {
      const r = await fetch('/api/despachos/reportador/api', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ simular }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setError(d.error ?? 'No se pudo empezar')
    } finally {
      setPidiendo(false)
      cargar()
    }
  }
  const detener = async () => {
    await fetch('/api/despachos/reportador/api/detener', { method: 'POST' })
    cargar()
  }

  if (!estado) return error ? <p className="text-sm text-red-600">{error}</p> : null
  const conectadas = estado.conexiones.filter(c => c.estado === 'activa').map(c => c.nickname)
  // Todavía sin mensajes: se revisan abajo (Mensaje al comprador) antes del primer reporte.
  const sinMensajes = estado.problemas.some(p => p.startsWith('Falta al menos una plantilla'))
  const c = estado.corrida
  const hechos = c?.procesados ?? []
  const cuenta = (r: Procesado['resultado']) => hechos.filter(h => h.resultado === r).length
  const ocupado = corriendo || pidiendo
  // Vista previa vieja (28-10, Gerardo): después de hacerla se apartaron guías o entraron nuevas y decía "Se enviaría 11"
  // con 10 pendientes. Si lo pendiente ya no coincide, no se muestra el resultado viejo: se pide repetirla.
  const previaVieja = !!c?.simular && c.estado !== 'corriendo' && c.total !== estado.total

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            Reportar por API
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            El sistema le escribe la guía a cada comprador directamente por MercadoLibre, con las mismas plantillas.
            Trabaja en el servidor: puedes cerrar la pantalla o bloquear el teléfono.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => correr(true)} disabled={ocupado || estado.total === 0 || sinMensajes} className="btn-secondary text-sm">
            {corriendo && c?.simular ? 'Revisando…' : 'Vista previa'}
          </button>
          {/* 29-10: sin mensaje guardado el botón gris no decía por qué y el aviso no se leía: el botón lleva al mensaje. */}
          {!estado.soloSimula && sinMensajes && (
            <button onClick={() => document.getElementById('mensaje-comprador')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="btn-primary text-sm">Primero revisa el mensaje ↓</button>
          )}
          {!estado.soloSimula && !sinMensajes && (
            <button onClick={() => correr(false)} disabled={ocupado || estado.total === 0 || estado.problemas.length > 0 || conectadas.length === 0}
              className="btn-primary text-sm">
              {corriendo && !c?.simular ? 'Reportando…' : `Reportar ${estado.total} por API`}
            </button>
          )}
          {corriendo && <button onClick={detener} className="btn-ghost text-sm text-red-600">Detener</button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className="text-neutral-500">Pendientes: <b className="text-neutral-900 num">{estado.total}</b></span>
        {Object.entries(estado.porCuenta).map(([k, n]) => (
          <span key={k} className="text-neutral-500">{k}: <b className="text-neutral-900 num">{n}</b></span>
        ))}
        {estado.enEquipo > 0 && <span className="text-neutral-500">tomados por un equipo: <b className="num">{estado.enEquipo}</b></span>}
      </div>
      {/* Sin pendientes (22-10, Panda Parts): el botón apagado no decía por qué. Solo entra lo que pasó por Despachos. */}
      {estado.total === 0 && !corriendo && (
        <p className="text-xs bg-neutral-50 border border-neutral-200 text-neutral-700 rounded-lg px-3 py-2">
          <b>No hay guías para reportar.</b> Se reportan las que imprimes en <Link href="/despachos" className="underline underline-offset-2 hover:text-neutral-900">Despachos</Link>,
          después de <b>cerrar la jornada</b> y sacar el manifiesto. Las de Tealca entran cuando les escribes la guía final.
          Si imprimes las guías directo desde MercadoLibre, el sistema no se entera.
        </p>
      )}
      <p className="text-xs text-neutral-500">
        Cuentas conectadas a la API: {conectadas.length ? <b className="text-neutral-800">{conectadas.join(', ')}</b> : 'ninguna'}
        {conEscritorio && <>{' · '}las ventas de otras cuentas quedan para el programa de escritorio (abajo, de respaldo).</>}{' '}
        <Link href="/cuentas-ml" className="underline underline-offset-2 hover:text-neutral-800">Conectar cuentas</Link>
      </p>

      {estado.soloSimula && (
        <p className="text-xs bg-sky-50 border border-sky-200 text-sky-800 rounded-lg px-3 py-2">
          En esta copia de pruebas solo hay vista previa: los despachos son una copia de producción y los compradores son reales, así que no se envía nada.
        </p>
      )}
      {sinMensajes ? (
        <p className="text-sm bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-3 py-2">
          <b>Falta un paso para reportar:</b> revisa el mensaje que recibirá tu comprador, más abajo en <b>Mensaje al comprador</b>,
          y toca <b>«Usar este mensaje»</b> (te dejamos uno listo). Después se habilita el botón de reportar.
        </p>
      ) : estado.problemas.length > 0 && (
        <p className="text-xs text-red-600">Configuración de mensajes incompleta: {estado.problemas.join(' · ')}</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {c && (
        <div className="border-t border-neutral-100 pt-3 space-y-2">
          {/* Estado de la corrida */}
          {c.estado === 'corriendo' ? (
            <div className="space-y-1.5">
              <p className="text-sm text-neutral-800">
                <span className="inline-block w-2 h-2 rounded-full bg-lime-500 animate-pulse mr-2 align-middle" />
                {c.simular ? 'Revisando' : 'Reportando'} en el servidor: <b className="num">{hechos.length}</b> de <b className="num">{c.total}</b>
                <span className="text-neutral-400"> · desde las {hora(c.started_at)}</span>
              </p>
              <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                <div className="h-full bg-lime-500 transition-[width] duration-500"
                  style={{ width: `${c.total ? Math.min(100, hechos.length / c.total * 100) : 0}%` }} />
              </div>
              <p className="text-xs text-neutral-400">Puedes salir de esta pantalla: sigue solo y aquí ves el resultado al volver.</p>
            </div>
          ) : previaVieja ? (
            <p className="text-sm text-amber-800">
              La vista previa de las {hora(c.finished_at ?? c.started_at)} revisó <b className="num">{c.total}</b> guía(s) y ahora hay{' '}
              <b className="num">{estado.total}</b> por reportar (se apartaron o entraron guías). Toca <b>Vista previa</b> para verla al día.
            </p>
          ) : (
            <p className={`text-sm ${c.estado === 'terminada' ? 'text-neutral-700' : 'text-amber-800'}`}>
              {c.simular ? 'Vista previa' : 'Reporte'}{' '}
              {c.estado === 'terminada' ? 'terminado' : c.estado === 'detenida' ? 'detenido' : c.estado === 'interrumpida' ? 'interrumpido' : 'con error'}
              {c.finished_at && <> a las {hora(c.finished_at)}</>}: <b className="num">{hechos.length}</b> procesado(s)
              {c.error && <span className="block text-xs text-red-600 mt-0.5">{c.error}</span>}
            </p>
          )}

          {hechos.length > 0 && !previaVieja && <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-700">
              <span>
                {(['ENVIADO', 'SIMULADO', 'YA_ENVIADO', 'SIN_CONEXION', 'SIN_CHAT', 'RECHAZADO', 'ERROR'] as const)
                  .filter(r => cuenta(r) > 0).map(r => `${ETIQUETA[r].t}: ${cuenta(r)}`).join(' · ')}
              </span>
              <button onClick={() => setVerDetalle(v => !v)}
                className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-800">
                {verDetalle ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
            </div>
            {verDetalle && <div className="max-h-96 overflow-y-auto divide-y divide-neutral-100 text-sm">
              {hechos.map((h, i) => (
                <div key={i} className="py-2">
                  <div className="flex flex-wrap items-center gap-x-3 text-xs">
                    <span className={`font-semibold ${ETIQUETA[h.resultado].c}`}>{ETIQUETA[h.resultado].t}</span>
                    <span className="font-mono text-neutral-500">{h.venta}</span>
                    <span className="text-neutral-500">{h.carrier} {h.guia}</span>
                    {h.cuenta && <span className="text-neutral-400">{h.cuenta}</span>}
                    {h.detalle && <span className="text-neutral-400">{h.detalle}</span>}
                  </div>
                  {h.mensaje && <p className="text-xs text-neutral-600 mt-1 whitespace-pre-line bg-neutral-50 rounded px-2 py-1">{h.mensaje}</p>}
                </div>
              ))}
            </div>}
          </>}
        </div>
      )}
    </section>
  )
}
