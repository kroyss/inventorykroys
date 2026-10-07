'use client'
import { useEffect, useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'

type Serie = 'automatizaciones' | 'inventario'
interface Video { id: number; orden: number; titulo: string; descripcion: string | null; youtube_id: string; activo: boolean; serie: Serie; duracion_seg: number | null }
interface Alumno {
  id: number; full_name: string | null; username: string; empresas: string; ultima: string | null
  completados: number; completados_inv: number; inventario: boolean
  ingreso: string | null; en_linea: boolean; viendo: { serie: Serie; numero: number; pct: number | null } | null
}
interface EnLinea { id: number; nombre: string; username: string; ultima_actividad: string; empresas: string | null }
const PUNTO_VERDE = <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5 align-middle" title="En línea ahora" />
const haceMin = (f: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(f).getTime()) / 60000)); return m === 0 ? 'ahora' : `hace ${m} min` }

interface Uso {
  id: number; nombre: string; estado: string; fundador: boolean; prueba_dias: number | null; prueba_hasta: string | null
  cuentas: string | null; conectada_at: string | null; ultima_actividad: string | null; ingreso: string | null; en_linea: boolean
  preguntas: number; preguntas_7d: number; mensajes: number; mensajes_7d: number; etiquetas: number; etiquetas_7d: number
  reportadas: number; reportadas_7d: number; calificadas: number; calificadas_7d: number; stock: number; stock_7d: number
}
// Columnas de uso: [campo total, campo de los últimos 7 días, título]
const USOS: [keyof Uso, keyof Uso, string][] = [
  ['preguntas', 'preguntas_7d', 'Preguntas'], ['mensajes', 'mensajes_7d', 'Mensajes'], ['etiquetas', 'etiquetas_7d', 'Etiquetas'],
  ['reportadas', 'reportadas_7d', 'Reportadas'], ['calificadas', 'calificadas_7d', 'Calificadas'], ['stock', 'stock_7d', 'Stock'],
]
const fechaHora = (f: string) => new Date(f).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

const SERIES: Record<Serie, { nombre: string; quien: string }> = {
  automatizaciones: { nombre: 'Automatizaciones', quien: 'todas las empresas' },
  inventario:       { nombre: 'Inventario', quien: 'solo empresas con el módulo Inventario' },
}
const reloj = (seg: number | null) => seg ? `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}` : ''

const input = 'w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white'

/** Plataforma → Aprendizaje: videos (YouTube "No listado"), su orden, el link de "agendar" y el avance de cada cliente. */
export default function AprendizajePanel() {
  const confirm = useConfirm()
  const [datos, setDatos] = useState<{ videos: Video[]; alumnos: Alumno[]; agendar: string | null; uso: Uso[]; enLinea: EnLinea[]; enLineaMinutos: number } | null>(null)
  const [nuevo, setNuevo] = useState({ url: '', titulo: '', descripcion: '', serie: 'automatizaciones' as Serie, duracion: '' })
  const [agendar, setAgendar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [vez, setVez] = useState(0)
  const [editando, setEditando] = useState<{ id: number; titulo: string; descripcion: string; url: string; serie: Serie; duracion: string } | null>(null)
  const recargar = () => setVez(n => n + 1)

  useEffect(() => {
    let vivo = true
    fetch('/api/plataforma/aprendizaje', { cache: 'no-store' })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!vivo) return
        if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
        setDatos(d); setAgendar(a => a || d.agendar || '')
      })
      .catch(() => { if (vivo) setError('No se pudo cargar') })
    return () => { vivo = false }
  }, [vez])

  const pedir = async (url: string, method: string, body?: object, ok?: string) => {
    setError(null); setAviso(null)
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo'); return false }
    if (ok) setAviso(ok)
    recargar()
    return true
  }
  const agregar = async () => {
    if (await pedir('/api/plataforma/aprendizaje', 'POST', nuevo, `Video "${nuevo.titulo}" agregado al final de ${SERIES[nuevo.serie].nombre}.`)) setNuevo({ url: '', titulo: '', descripcion: '', serie: nuevo.serie, duracion: '' })
  }
  const borrar = async (v: Video) => {
    if (!await confirm({ title: 'Borrar video', message: `Se borra "${v.titulo}" y el avance de todos en ese video.`, confirmText: 'Borrar' })) return
    pedir(`/api/plataforma/aprendizaje/${v.id}`, 'DELETE', undefined, 'Video borrado.')
  }

  if (!datos) return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-neutral-400">Cargando…</p>
  const activos = datos.videos.filter(v => v.activo).length
  const activosAuto = datos.videos.filter(v => v.activo && v.serie === 'automatizaciones').length
  const activosInv = datos.videos.filter(v => v.activo && v.serie === 'inventario').length
  const deSerie = (v: Video) => datos.videos.filter(x => x.serie === v.serie)

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
      {aviso && <div className="bg-lime-50 border border-lime-300 text-lime-900 px-4 py-2 rounded text-sm">✓ {aviso}</div>}

      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Agregar video</h2>
          <p className="text-sm text-neutral-500">
            Súbelo a YouTube como <b>“No listado”</b> (no “Privado”: un video privado no se reproduce dentro de la web) y pega su link.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={input} placeholder="Link de YouTube (https://youtu.be/…)" value={nuevo.url} onChange={e => setNuevo({ ...nuevo, url: e.target.value })} />
          <input className={input} placeholder="Título (ej. Conectar MercadoLibre)" value={nuevo.titulo} maxLength={120} onChange={e => setNuevo({ ...nuevo, titulo: e.target.value })} />
          <textarea className={`${input} sm:col-span-2 resize-none`} rows={2} maxLength={500} placeholder="Descripción corta (opcional)"
            value={nuevo.descripcion} onChange={e => setNuevo({ ...nuevo, descripcion: e.target.value })} />
          <select className={input} value={nuevo.serie} onChange={e => setNuevo({ ...nuevo, serie: e.target.value as Serie })}>
            {(Object.keys(SERIES) as Serie[]).map(k => <option key={k} value={k}>{SERIES[k].nombre} ({SERIES[k].quien})</option>)}
          </select>
          <input className={input} placeholder="Duración (ej. 6:12); vacía: se toma al reproducirlo" value={nuevo.duracion}
            onChange={e => setNuevo({ ...nuevo, duracion: e.target.value })} />
        </div>
        <div className="flex justify-end">
          <button onClick={agregar} disabled={!nuevo.url.trim() || !nuevo.titulo.trim()} className="btn-primary text-sm disabled:opacity-40">+ Agregar video</button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-neutral-900">Videos <span className="text-neutral-400 font-normal text-sm">({activos} visibles · en este orden se ven, cada serie con su propio orden)</span></h2>
        {datos.videos.length === 0 ? (
          <p className="text-sm text-neutral-400 bg-white rounded-xl border border-neutral-200 p-6 text-center">Todavía no hay videos. Mientras no haya, “Aprendizaje” muestra los primeros pasos.</p>
        ) : (
          <ol className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
            {datos.videos.map((v, i) => {
              const serie = deSerie(v), k = serie.indexOf(v)
              const cabecera = (i === 0 || datos.videos[i - 1].serie !== v.serie) && (
                <li key={`s-${v.serie}`} className="px-4 py-2 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {SERIES[v.serie].nombre} <span className="normal-case font-normal tracking-normal text-neutral-400">· la ven {SERIES[v.serie].quien}
                  {' · '}{reloj(serie.filter(x => x.activo).reduce((t, x) => t + (x.duracion_seg ?? 0), 0)) || '—'} en total</span>
                </li>
              )
              return [cabecera, editando?.id === v.id ? (
              <li key={v.id} className="px-4 py-3 space-y-2 bg-neutral-50/60">
                <p className="text-xs font-medium text-neutral-500">Editar video {k + 1} de {SERIES[v.serie].nombre}</p>
                <input className={input} placeholder="Título" maxLength={120} value={editando.titulo}
                  onChange={e => setEditando({ ...editando, titulo: e.target.value })} />
                <textarea className={input} rows={2} placeholder="Descripción (opcional)" maxLength={500} value={editando.descripcion}
                  onChange={e => setEditando({ ...editando, descripcion: e.target.value })} />
                <input className={input} placeholder="Link de YouTube" value={editando.url}
                  onChange={e => setEditando({ ...editando, url: e.target.value })} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <select className={input} value={editando.serie} onChange={e => setEditando({ ...editando, serie: e.target.value as Serie })}>
                    {(Object.keys(SERIES) as Serie[]).map(x => <option key={x} value={x}>{SERIES[x].nombre} ({SERIES[x].quien})</option>)}
                  </select>
                  <input className={input} placeholder="Duración (ej. 6:12)" value={editando.duracion}
                    onChange={e => setEditando({ ...editando, duracion: e.target.value })} />
                </div>
                <p className="text-xs text-neutral-500">Si cambias el video, quien ya lo había completado lo mantiene visto; a los demás se les reinicia el avance de ese video.</p>
                <div className="flex gap-2">
                  <button disabled={editando.titulo.trim().length < 2 || !editando.url.trim()}
                    onClick={async () => {
                      const cambio: Record<string, unknown> = { titulo: editando.titulo, descripcion: editando.descripcion.trim() || null,
                        serie: editando.serie, duracion: editando.duracion }
                      if (editando.url.trim() !== `https://youtu.be/${v.youtube_id}`) cambio.url = editando.url
                      if (await pedir(`/api/plataforma/aprendizaje/${v.id}`, 'PUT', cambio, `Video "${editando.titulo.trim()}" guardado.`)) setEditando(null)
                    }}
                    className="btn-primary text-sm disabled:opacity-40">Guardar</button>
                  <button onClick={() => setEditando(null)} className="btn-secondary text-sm">Cancelar</button>
                </div>
              </li>
            ) : (
              <li key={v.id} className={`px-4 py-3 flex flex-wrap items-center gap-3 ${v.activo ? '' : 'opacity-50'}`}>
                <span className="w-6 text-center text-sm text-neutral-400 num">{k + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://i.ytimg.com/vi/${v.youtube_id}/mqdefault.jpg`} alt="" className="w-24 aspect-video rounded object-cover bg-neutral-100" />
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-sm font-medium text-neutral-900">{v.titulo}
                    {v.duracion_seg ? <span className="ml-2 text-xs font-normal text-neutral-400 num">{reloj(v.duracion_seg)}</span>
                      : <span className="ml-2 text-xs font-normal text-amber-600">sin duración</span>}</p>
                  {v.descripcion && <p className="text-xs text-neutral-500 line-clamp-1">{v.descripcion}</p>}
                  <a href={`https://youtu.be/${v.youtube_id}`} target="_blank" rel="noreferrer" className="text-xs text-sky-700 hover:underline">youtu.be/{v.youtube_id}</a>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <button onClick={() => pedir(`/api/plataforma/aprendizaje/${v.id}`, 'PUT', { mover: 'arriba' })} disabled={k === 0}
                    className="btn-ghost px-2 py-1 disabled:opacity-30" title="Subir">↑</button>
                  <button onClick={() => pedir(`/api/plataforma/aprendizaje/${v.id}`, 'PUT', { mover: 'abajo' })} disabled={k === serie.length - 1}
                    className="btn-ghost px-2 py-1 disabled:opacity-30" title="Bajar">↓</button>
                  <button onClick={() => setEditando({ id: v.id, titulo: v.titulo, descripcion: v.descripcion ?? '', url: `https://youtu.be/${v.youtube_id}`, serie: v.serie, duracion: reloj(v.duracion_seg) })}
                    className="btn-ghost px-2 py-1 text-xs">Editar</button>
                  <button onClick={() => pedir(`/api/plataforma/aprendizaje/${v.id}`, 'PUT', { activo: !v.activo })}
                    className="btn-ghost px-2 py-1 text-xs">{v.activo ? 'Ocultar' : 'Mostrar'}</button>
                  <button onClick={() => borrar(v)} className="btn-ghost px-2 py-1 text-xs text-red-600">Borrar</button>
                </div>
              </li>
            )]})}
          </ol>
        )}
      </section>

      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-2">
        <h2 className="text-base font-semibold text-neutral-900">Al terminar el curso</h2>
        <p className="text-sm text-neutral-500">Link del botón “Agendar mi configuración” (tu Telegram, ej. https://t.me/tuusuario).</p>
        <div className="flex gap-2">
          <input className={input} placeholder="https://t.me/…" value={agendar} onChange={e => setAgendar(e.target.value)} />
          <button onClick={() => pedir('/api/plataforma/aprendizaje', 'PUT', { agendar }, 'Link guardado.')} className="btn-secondary text-sm whitespace-nowrap">Guardar</button>
        </div>
      </section>

      <section className={`rounded-xl border p-4 ${datos.enLinea.length ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-neutral-200'}`}>
        <h2 className="text-sm font-semibold text-neutral-900">
          {datos.enLinea.length ? <>{PUNTO_VERDE}En línea ahora ({datos.enLinea.length})</> : 'En línea ahora'}
        </h2>
        {datos.enLinea.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {datos.enLinea.map(u => (
              <li key={u.id}>
                <b className="text-neutral-900">{u.nombre}</b>
                <span className="text-neutral-500"> · {u.empresas ?? u.username} · {haceMin(u.ultima_actividad)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-neutral-500">Nadie usando el sistema en los últimos {datos.enLineaMinutos} minutos: buen momento para actualizar.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-neutral-900">Avance de los clientes</h2>
        {datos.alumnos.length === 0 ? (
          <p className="text-sm text-neutral-400 bg-white rounded-xl border border-neutral-200 p-6 text-center">Todavía no hay usuarios de empresas clientes.</p>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr><th className="px-4 py-2 text-left">Usuario</th><th className="px-4 py-2 text-left">Empresa</th>
                  <th className="px-4 py-2 text-left">Automatizaciones</th>
                  {activosInv > 0 && <th className="px-4 py-2 text-left">Inventario</th>}<th className="px-4 py-2 text-left">Último video</th>
                  <th className="px-4 py-2 text-left">Último ingreso</th></tr>
              </thead>
              <tbody>
                {datos.alumnos.map(a => {
                  const p = activosAuto ? Math.min(100, Math.round(a.completados / activosAuto * 100)) : 0
                  return (
                    <tr key={a.id} className="border-t border-neutral-100">
                      <td className="px-4 py-2"><div className="font-medium">{a.en_linea && PUNTO_VERDE}{a.full_name ?? a.username}</div><div className="text-xs text-neutral-400 font-mono">{a.username}</div></td>
                      <td className="px-4 py-2 text-neutral-600">{a.empresas}</td>
                      <td className="px-4 py-2 min-w-[10rem]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-neutral-100 overflow-hidden"><div className={`h-full ${p === 100 ? 'bg-lime-500' : 'bg-sky-400'}`} style={{ width: `${p}%` }} /></div>
                          <span className="text-xs num text-neutral-600">{a.completados}/{activosAuto}</span>
                          {p === 100 && <span className="text-xs text-lime-700 font-medium">✓ listo</span>}
                        </div>
                        {a.viendo && (
                          <div className="mt-0.5 text-[11px] text-sky-700">
                            viendo el {a.viendo.numero}º{a.viendo.serie === 'inventario' ? ' de Inventario' : ''}{a.viendo.pct != null ? ` (${a.viendo.pct}%)` : ''}
                          </div>
                        )}
                      </td>
                      {activosInv > 0 && (
                        <td className="px-4 py-2 text-xs num text-neutral-600">
                          {a.inventario ? `${a.completados_inv}/${activosInv}` : <span className="text-neutral-400">no lo lleva</span>}
                        </td>
                      )}
                      <td className="px-4 py-2 text-xs text-neutral-500">{a.ultima ? new Date(a.ultima).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="px-4 py-2 text-xs text-neutral-500">{a.en_linea ? <span className="text-emerald-700 font-medium">{PUNTO_VERDE}en línea</span> : a.ingreso ? new Date(a.ingreso).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Uso de cada cliente</h2>
          <p className="text-sm text-neutral-500">
            Lo que hicieron <b>desde el sistema</b>: preguntas respondidas, mensajes enviados, etiquetas impresas, guías reportadas,
            ventas calificadas y stock cambiado en MercadoLibre. El número chico es lo de los últimos 7 días.
          </p>
        </div>
        {datos.uso.length === 0 ? (
          <p className="text-sm text-neutral-400 bg-white rounded-xl border border-neutral-200 p-6 text-center">Todavía no hay empresas clientes.</p>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2 text-left">Empresa</th>
                  <th className="px-4 py-2 text-left">MercadoLibre</th>
                  {USOS.map(([k, , t]) => <th key={k} className="px-3 py-2 text-right">{t}</th>)}
                  <th className="px-4 py-2 text-left">Último ingreso</th>
                  <th className="px-4 py-2 text-left" title="Última vez que respondió, mandó, imprimió, reportó, calificó o cambió stock">Último uso de herramientas</th>
                </tr>
              </thead>
              <tbody>
                {datos.uso.map(u => {
                  const esperando = u.prueba_dias != null
                  return (
                    <tr key={u.id} className="border-t border-neutral-100 align-top">
                      <td className="px-4 py-2">
                        <div className="font-medium">{u.nombre}</div>
                        <div className="text-xs text-neutral-400">{u.fundador ? 'Fundador' : u.estado === 'prueba' ? 'Prueba' : u.estado}</div>
                      </td>
                      <td className="px-4 py-2 min-w-[11rem]">
                        {u.cuentas ? (
                          <>
                            <div className="text-emerald-700 font-medium">✓ {u.cuentas}</div>
                            <div className="text-xs text-neutral-500">
                              desde {u.conectada_at ? fechaHora(u.conectada_at) : '—'}
                              {u.estado === 'prueba' && u.prueba_hasta && <> · prueba hasta {ddmm(u.prueba_hasta)}</>}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-amber-700 font-medium">Sin conectar</div>
                            {esperando && u.prueba_hasta && <div className="text-xs text-neutral-500">sus días corren solos desde el {ddmm(
                              new Date(new Date(`${u.prueba_hasta}T12:00:00Z`).getTime() - u.prueba_dias! * 86400000).toISOString().slice(0, 10))}</div>}
                          </>
                        )}
                      </td>
                      {USOS.map(([k, k7]) => {
                        const total = u[k] as number, semana = u[k7] as number
                        return (
                          <td key={k} className="px-3 py-2 text-right num">
                            <span className={total ? 'text-neutral-900 font-medium' : 'text-neutral-300'}>{total}</span>
                            {semana > 0 && <div className="text-[11px] text-lime-700">+{semana} en 7 d</div>}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2 text-xs text-neutral-500">{u.en_linea ? <span className="text-emerald-700 font-medium">{PUNTO_VERDE}en línea</span> : u.ingreso ? fechaHora(u.ingreso) : 'nunca'}</td>
                      <td className="px-4 py-2 text-xs text-neutral-500">{u.ultima_actividad ? fechaHora(u.ultima_actividad) : 'todavía no'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
