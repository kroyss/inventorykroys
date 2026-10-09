'use client'
// Plataforma → Resumen: lo que hay que mirar hoy. Pocos números arriba, "Requiere atención" como
// protagonista y el avance de cada cliente por etapas (entró → conectó ML → vio videos → usa).
// Lee los mismos datos que Aprendizaje y Fundadores (no hay consultas nuevas).
import { useEffect, useState } from 'react'

interface Uso {
  id: number; nombre: string; estado: string; fundador: boolean; prueba_hasta: string | null
  cuentas: string | null; conectada_at: string | null; ultima_actividad: string | null; ingreso: string | null; en_linea: boolean
  preguntas_7d: number; mensajes_7d: number; etiquetas_7d: number; reportadas_7d: number; calificadas_7d: number; stock_7d: number
}
interface Alumno { empresas: string; completados: number; en_linea: boolean; viendo: { numero: number; pct: number | null } | null }
interface EnLinea { id: number; nombre: string; empresas: string | null; ultima_actividad: string }
interface Video { activo: boolean; serie: string }
interface Datos { uso: Uso[]; alumnos: Alumno[]; enLinea: EnLinea[]; videos: Video[] }
type Vista = 'empresas' | 'fundadores' | 'aprendizaje'

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
  const totalVideos = datos.videos.filter(v => v.activo && v.serie === 'automatizaciones').length
  const videosDe = (nombre: string) => Math.max(0, ...datos.alumnos.filter(a => a.empresas.split(', ').includes(nombre)).map(a => a.completados))

  // ── Requiere atención (más urgente primero) ──
  const avisos: Aviso[] = []
  for (const u of datos.uso) {
    const restan = u.prueba_hasta ? dias(hoy, u.prueba_hasta) : null
    if (u.estado === 'prueba' && restan != null && restan < 0) {
      avisos.push({ nivel: 2, texto: `${u.nombre}: la prueba venció el ${ddmm(u.prueba_hasta!)}. ¿Sigue o se cierra?`, ir: 'empresas', boton: 'Ver empresa' })
    } else if (u.estado === 'prueba' && restan != null && restan <= 3) {
      avisos.push({ nivel: 2, texto: `${u.nombre}: la prueba vence ${restan === 0 ? 'hoy' : `en ${restan} día${restan === 1 ? '' : 's'}`} (${ddmm(u.prueba_hasta!)}).`, ir: 'empresas', boton: 'Ver empresa' })
    }
    if (!u.conectada_at) {
      avisos.push({ nivel: 1, texto: `${u.nombre}: todavía no conectó MercadoLibre${u.ingreso ? ` (entró ${hace(u.ingreso)})` : ' y nunca entró al sistema'}.`, ir: 'aprendizaje', boton: 'Ver avance' })
    } else if (usos7(u) === 0) {
      avisos.push({ nivel: 1, texto: `${u.nombre}: conectó MercadoLibre pero no usó las herramientas en 7 días (último uso: ${hace(u.ultima_actividad)}).`, ir: 'aprendizaje', boton: 'Ver uso' })
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
        <Numero titulo="En línea ahora" valor={datos.enLinea.length} detalle={datos.enLinea.length ? datos.enLinea.map(e => e.nombre.split(' ')[0]).join(', ') : 'nadie'} vivo={datos.enLinea.length > 0} />
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

      {/* Avance de cada cliente por etapas */}
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm">
        <div className="px-4 py-3 border-b border-neutral-100 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Avance de los clientes</h2>
          <span className="text-xs text-neutral-400">Entró → Conectó ML → Vio los videos → Usa las herramientas</span>
        </div>
        {datos.uso.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-400 text-center">Todavía no hay clientes.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {datos.uso.map(u => {
              const vistos = videosDe(u.nombre)
              const usa = usos7(u) > 0
              const etapas = [
                { ok: !!u.ingreso, t: 'Entró' },
                { ok: !!u.conectada_at, t: 'Conectó ML' },
                { ok: totalVideos > 0 && vistos >= totalVideos, parcial: vistos > 0, t: totalVideos ? `Videos ${vistos}/${totalVideos}` : 'Videos' },
                { ok: usa, t: 'Usa' },
              ]
              const falta = etapas.find(e => !e.ok)
              const restan = u.estado === 'prueba' && u.prueba_hasta ? dias(hoy, u.prueba_hasta) : null
              return (
                <li key={u.id} className="px-4 py-3 grid gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,1fr)] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {u.en_linea && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="En línea ahora" />}
                      <span className="font-medium text-neutral-900 truncate">{u.nombre}</span>
                      {u.fundador && <span className="text-[10px] px-1.5 py-0.5 rounded bg-lime-100 text-lime-800">Fundador</span>}
                    </div>
                    <div className="text-xs text-neutral-400">
                      {restan == null ? u.estado : restan < 0 ? 'prueba vencida' : `prueba: quedan ${restan} día${restan === 1 ? '' : 's'}`}
                      {' · '}entró {hace(u.ingreso)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {etapas.map((e, i) => (
                      <div key={i} className="flex-1 min-w-0">
                        <div className={`h-1.5 rounded-full ${e.ok ? 'bg-lime-500' : e.parcial ? 'bg-lime-200' : 'bg-neutral-200'}`} />
                        <div className={`mt-1 text-[10px] truncate ${e.ok ? 'text-neutral-700' : 'text-neutral-400'}`}>{e.t}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-neutral-500 sm:text-right">
                    {falta
                      ? <>Falta: <b className="text-neutral-700">{falta.t.replace(/ \d+\/\d+$/, '')}</b></>
                      : <span className="text-green-700">Usando el sistema ✓</span>}
                    {usa && (
                      <div className="text-neutral-400">
                        7 días: {[
                          u.preguntas_7d && `${u.preguntas_7d} preg.`, u.mensajes_7d && `${u.mensajes_7d} msj.`,
                          u.etiquetas_7d && `${u.etiquetas_7d} etiq.`, u.reportadas_7d && `${u.reportadas_7d} guías`,
                          u.calificadas_7d && `${u.calificadas_7d} calif.`,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
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
