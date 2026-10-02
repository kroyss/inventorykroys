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
export default function ReportadorApi() {
  const confirm = useConfirm()
  const [estado, setEstado] = useState<Estado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pidiendo, setPidiendo] = useState(false)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/despachos/reportador/api', { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (r.ok) { setEstado(d); setError(null) } else setError(d.error ?? 'No se pudo cargar')
  }, [])
  useEffect(() => { cargar() }, [cargar])

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
    setPidiendo(true); setError(null)
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
  const c = estado.corrida
  const hechos = c?.procesados ?? []
  const cuenta = (r: Procesado['resultado']) => hechos.filter(h => h.resultado === r).length
  const ocupado = corriendo || pidiendo

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
          <button onClick={() => correr(true)} disabled={ocupado || estado.total === 0} className="btn-secondary text-sm">
            {corriendo && c?.simular ? 'Revisando…' : 'Vista previa'}
          </button>
          {!estado.soloSimula && (
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
      <p className="text-xs text-neutral-500">
        Cuentas conectadas a la API: {conectadas.length ? <b className="text-neutral-800">{conectadas.join(', ')}</b> : 'ninguna'}
        {' · '}las ventas de otras cuentas quedan para el programa de escritorio (abajo, de respaldo).{' '}
        <Link href="/preguntas" className="underline underline-offset-2 hover:text-neutral-800">Conectar cuentas</Link>
      </p>

      {estado.soloSimula && (
        <p className="text-xs bg-sky-50 border border-sky-200 text-sky-800 rounded-lg px-3 py-2">
          En esta copia de pruebas solo hay vista previa: los despachos son una copia de producción y los compradores son reales, así que no se envía nada.
        </p>
      )}
      {estado.problemas.length > 0 && (
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
          ) : (
            <p className={`text-sm ${c.estado === 'terminada' ? 'text-neutral-700' : 'text-amber-800'}`}>
              {c.simular ? 'Vista previa' : 'Reporte'}{' '}
              {c.estado === 'terminada' ? 'terminado' : c.estado === 'detenida' ? 'detenido' : c.estado === 'interrumpida' ? 'interrumpido' : 'con error'}
              {c.finished_at && <> a las {hora(c.finished_at)}</>}: <b className="num">{hechos.length}</b> procesado(s)
              {c.error && <span className="block text-xs text-red-600 mt-0.5">{c.error}</span>}
            </p>
          )}

          {hechos.length > 0 && <>
            <p className="text-sm text-neutral-700">
              {(['ENVIADO', 'SIMULADO', 'YA_ENVIADO', 'SIN_CONEXION', 'SIN_CHAT', 'RECHAZADO', 'ERROR'] as const)
                .filter(r => cuenta(r) > 0).map(r => `${ETIQUETA[r].t}: ${cuenta(r)}`).join(' · ')}
            </p>
            <div className="max-h-96 overflow-y-auto divide-y divide-neutral-100 text-sm">
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
            </div>
          </>}
        </div>
      )}
    </section>
  )
}
