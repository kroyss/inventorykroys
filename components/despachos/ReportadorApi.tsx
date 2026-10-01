'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useConfirm } from '@/components/ui/ConfirmProvider'

interface Estado {
  porCuenta: Record<string, number>; enEquipo: number; total: number; problemas: string[]
  conexiones: { nickname: string; estado: string }[]; soloSimula: boolean; mlListo: boolean
}
interface Procesado {
  venta: string; guia: string; carrier: string; cuenta: string | null
  resultado: 'ENVIADO' | 'YA_ENVIADO' | 'SIN_CHAT' | 'RECHAZADO' | 'ERROR' | 'SIN_CONEXION' | 'SIMULADO'
  detalle: string | null; mensaje: string | null
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

/** Reportador por API: el servidor le escribe la guía a cada comprador, sin el programa. */
export default function ReportadorApi() {
  const confirm = useConfirm()
  const [estado, setEstado] = useState<Estado | null>(null)
  const [corriendo, setCorriendo] = useState<null | 'simular' | 'enviar'>(null)
  const [hechos, setHechos] = useState<Procesado[]>([])
  const [error, setError] = useState<string | null>(null)
  const parar = useRef(false)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/despachos/reportador/api')
    const d = await r.json().catch(() => ({}))
    if (r.ok) setEstado(d); else setError(d.error ?? 'No se pudo cargar')
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const correr = async (simular: boolean) => {
    if (!simular) {
      const ok = await confirm({
        title: 'Reportar por API',
        message: `Se le escribirá su guía a ${estado?.total ?? 0} comprador(es) desde MercadoLibre, con tus plantillas. Antes de cada envío se revisa la conversación para no repetirle la guía a nadie.`,
        confirmText: 'Reportar ahora',
      })
      if (!ok) return
    }
    setCorriendo(simular ? 'simular' : 'enviar'); setHechos([]); setError(null); parar.current = false
    const vistas: string[] = []
    try {
      for (let vuelta = 0; vuelta < 300 && !parar.current; vuelta++) {
        const r = await fetch('/api/despachos/reportador/api', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ simular, excluir: vistas }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setError(d.error ?? 'Se cortó el reporte'); break }
        const lote = d.procesados as Procesado[]
        if (lote.length === 0) break
        lote.forEach(p => vistas.push(p.venta))
        setHechos(h => [...h, ...lote])
      }
    } finally {
      setCorriendo(null)
      cargar()
    }
  }

  if (!estado) return null
  const conectadas = estado.conexiones.filter(c => c.estado === 'activa').map(c => c.nickname)
  const cuenta = (r: Procesado['resultado']) => hechos.filter(h => h.resultado === r).length

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            Reportar por API
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            El sistema le escribe la guía a cada comprador directamente por MercadoLibre, con las mismas plantillas. No hace falta la PC prendida.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => correr(true)} disabled={!!corriendo || estado.total === 0} className="btn-secondary text-sm">
            {corriendo === 'simular' ? 'Revisando…' : 'Vista previa'}
          </button>
          {!estado.soloSimula && (
            <button onClick={() => correr(false)} disabled={!!corriendo || estado.total === 0 || estado.problemas.length > 0 || conectadas.length === 0}
              className="btn-primary text-sm">
              {corriendo === 'enviar' ? 'Reportando…' : `Reportar ${estado.total} por API`}
            </button>
          )}
          {corriendo && <button onClick={() => { parar.current = true }} className="btn-ghost text-sm text-red-600">Detener</button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className="text-neutral-500">Pendientes: <b className="text-neutral-900 num">{estado.total}</b></span>
        {Object.entries(estado.porCuenta).map(([c, n]) => (
          <span key={c} className="text-neutral-500">{c}: <b className="text-neutral-900 num">{n}</b></span>
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

      {hechos.length > 0 && (
        <div className="border-t border-neutral-100 pt-3 space-y-2">
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
        </div>
      )}
    </section>
  )
}
