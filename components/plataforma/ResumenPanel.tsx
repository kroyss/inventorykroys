'use client'
// Plataforma → Hoy: lo que hay que mirar hoy. Pocos números arriba, "Requiere atención" como protagonista
// y los 5 clientes más activos de la semana (17-10; el avance por etapas repetía lo de Clientes).
// Lee los mismos datos que Aprendizaje y Fundadores (no hay consultas nuevas).
import { useEffect, useState } from 'react'

interface Uso {
  id: number; nombre: string; estado: string; fundador: boolean; prueba_hasta: string | null
  cuentas: string | null; conectada_at: string | null; ultima_actividad: string | null; ingreso: string | null; en_linea: boolean
  preguntas_7d: number; mensajes_7d: number; etiquetas_7d: number; reportadas_7d: number; calificadas_7d: number; stock_7d: number
}
interface Alumno { empresas: string; completados: number; en_linea: boolean; viendo: { numero: number; pct: number | null } | null }
interface EnLinea { id: number; nombre: string; empresas: string | null; ultima_actividad: string; usando: boolean }
interface Video { activo: boolean; serie: string }
interface Datos { uso: Uso[]; alumnos: Alumno[]; enLinea: EnLinea[]; videos: Video[] }
type Vista = 'clientes' | 'fundadores' | 'contenido'

const DIA = 864e5
const hoyCaracas = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / DIA)
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const hace = (f: string | null) => {
  if (!f) return 'nunca'
  const m = Math.round((Date.now() - new Date(f).getTime()) / 60000)
  if (m < 60) return m <= 1 ? 'ahora' : `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}
const usos7 = (u: Uso) => u.preguntas_7d + u.mensajes_7d + u.etiquetas_7d + u.reportadas_7d + u.calificadas_7d + u.stock_7d

interface Aviso { nivel: 0 | 1 | 2; texto: string; ir: Vista; boton: string }

export default function ResumenPanel({ onIr }: { onIr: (v: Vista) => void }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [porRevisar, setPorRevisar] = useState(0)

  useEffect(() => {
    let vivo = true
    const cargar = () => Promise.all([
      fetch('/api/plataforma/aprendizaje').then(r => (r.ok ? r.json() : null)),
      fetch('/api/plataforma/fundadores').then(r => (r.ok ? r.json() : null)),
    ]).then(([a, f]) => {
      if (!vivo) return
      if (a) setDatos(a)
      if (f?.solicitudes) setPorRevisar(f.solicitudes.filter((s: { estado: string }) => s.estado === 'calificado').length)
    }).catch(() => {})
    cargar()
    const t = setInterval(cargar, 60_000)   // "en línea ahora" al día sin recargar
    return () => { vivo = false; clearInterval(t) }
  }, [])

  if (!datos) return <p className="text-sm text-neutral-400 py-8 text-center">Cargando…</p>

  const hoy = hoyCaracas()

  // ── Requiere atención (más urgente primero) ──
  const avisos: Aviso[] = []
  for (const u of datos.uso) {
    const restan = u.prueba_hasta ? dias(hoy, u.prueba_hasta) : null
    if (u.estado === 'prueba' && restan != null && restan < 0) {
      avisos.push({ nivel: 2, texto: `${u.nombre}: la prueba venció el ${ddmm(u.prueba_hasta!)}. ¿Sigue o se cierra?`, ir: 'clientes', boton: 'Ver cliente' })
    } else if (u.estado === 'prueba' && restan != null && restan <= 3) {
      avisos.push({ nivel: 2, texto: `${u.nombre}: la prueba vence ${restan === 0 ? 'hoy' : `en ${restan} día${restan === 1 ? '' : 's'}`} (${ddmm(u.prueba_hasta!)}).`, ir: 'clientes', boton: 'Ver cliente' })
    }
    if (!u.conectada_at) {
      avisos.push({ nivel: 1, texto: `${u.nombre}: todavía no conectó MercadoLibre${u.ingreso ? ` (entró ${hace(u.ingreso)})` : ' y nunca entró al sistema'}.`, ir: 'clientes', boton: 'Ver cliente' })
    } else if (usos7(u) === 0) {
      avisos.push({ nivel: 1, texto: `${u.nombre}: conectó MercadoLibre pero no usó las herramientas en 7 días (último uso: ${hace(u.ultima_actividad)}).`, ir: 'clientes', boton: 'Ver uso' })
    }
  }
  if (porRevisar > 0) {
    avisos.push({ nivel: 1, texto: `${porRevisar} postulación${porRevisar === 1 ? '' : 'es'} de Fundadores por revisar.`, ir: 'fundadores', boton: 'Revisar' })
  }
  avisos.sort((a, b) => b.nivel - a.nivel)

  const enPrueba = datos.uso.filter(u => u.estado === 'prueba' && (!u.prueba_hasta || u.prueba_hasta >= hoy)).length
  const conectados = datos.uso.filter(u => u.conectada_at).length
  const activos7 = datos.uso.filter(u => usos7(u) > 0).length

  return (
    <div className="space-y-5">
      {/* Pocos números: lo justo para ubicarse */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero titulo="Clientes" valor={datos.uso.length} detalle={`${enPrueba} en prueba`} />
        <Numero titulo="Conectados a ML" valor={conectados} detalle={`de ${datos.uso.length}`} />
        <Numero titulo="Usaron el sistema (7 días)" valor={activos7} detalle={`de ${conectados} conectados`} />
        {(() => {
          // Solo los que están usando de verdad; los de pestaña abierta van aparte (migración 092).
          const usando = datos.enLinea.filter(e => e.usando)
          const abiertos = datos.enLinea.length - usando.length
          return <Numero titulo="En línea ahora" valor={usando.length} vivo={usando.length > 0}
            detalle={(usando.length ? usando.map(e => e.nombre.split(' ')[0]).join(', ') : 'nadie usando') + (abiertos ? ` · ${abiertos} con la pestaña abierta` : '')} />
        })()}
      </div>

      {/* Requiere atención */}
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm">
        <h2 className="px-4 py-3 border-b border-neutral-100 text-sm font-semibold text-neutral-900">Requiere atención</h2>
        {avisos.length === 0 ? (
          <p className="px-4 py-6 text-sm text-green-700 text-center">Todo al día ✓</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {avisos.map((a, i) => (
              <li key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full shrink-0 ${a.nivel === 2 ? 'bg-red-500' : 'bg-amber-400'}`} />
                <span className="flex-1 text-neutral-700">{a.texto}</span>
                <button onClick={() => onIr(a.ir)} className="text-xs text-sky-700 hover:underline whitespace-nowrap">{a.boton} →</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Los más activos de la semana (17-10): el detalle completo, en Clientes. */}
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm">
        <div className="px-4 py-3 border-b border-neutral-100 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Los más activos de la semana</h2>
          <button onClick={() => onIr('clientes')} className="text-xs text-sky-700 hover:underline">Ver todos en Clientes →</button>
        </div>
        {(() => {
          const top = [...datos.uso].filter(u => usos7(u) > 0).sort((a, b) => usos7(b) - usos7(a)).slice(0, 5)
          if (!top.length) return <p className="px-4 py-6 text-sm text-neutral-400 text-center">Nadie usó las herramientas en los últimos 7 días.</p>
          const max = usos7(top[0])
          return (
            <ol className="divide-y divide-neutral-100">
              {top.map((u, i) => (
                <li key={u.id} className="px-4 py-2.5 grid gap-1.5 sm:grid-cols-[1.5rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)] sm:items-center text-sm">
                  <span className="text-neutral-400 tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex items-center gap-2">
                    {u.en_linea && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="En línea ahora" />}
                    <span className="font-medium text-neutral-900 truncate">{u.nombre}</span>
                    {u.fundador && <span className="text-[10px] px-1.5 py-0.5 rounded bg-lime-100 text-lime-800">Fundador</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 rounded-full bg-neutral-100 overflow-hidden"><span className="block h-full bg-lime-500" style={{ width: `${Math.round(usos7(u) / max * 100)}%` }} /></span>
                    <b className="tabular-nums text-xs">{usos7(u)}</b>
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    {[u.preguntas_7d && `${u.preguntas_7d} preguntas`, u.mensajes_7d && `${u.mensajes_7d} mensajes`,
                      u.etiquetas_7d && `${u.etiquetas_7d} etiquetas`, u.reportadas_7d && `${u.reportadas_7d} guías reportadas`,
                      u.calificadas_7d && `${u.calificadas_7d} calificaciones`, u.stock_7d && `${u.stock_7d} stock`].filter(Boolean).join(' · ')}
                    {' · '}último uso {hace(u.ultima_actividad)}
                  </span>
                </li>
              ))}
            </ol>
          )
        })()}
      </section>
    </div>
  )
}

function Numero({ titulo, valor, detalle, vivo }: { titulo: string; valor: number; detalle: string; vivo?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm px-4 py-3">
      <div className="text-xs text-neutral-500 flex items-center gap-1.5">
        {vivo && <span className="w-2 h-2 rounded-full bg-green-500" />}{titulo}
      </div>
      <div className="text-2xl font-semibold text-neutral-900 num">{valor}</div>
      <div className="text-xs text-neutral-400 truncate">{detalle}</div>
    </div>
  )
}
