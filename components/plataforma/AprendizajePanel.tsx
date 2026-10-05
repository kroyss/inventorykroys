'use client'
import { useEffect, useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'

interface Video { id: number; orden: number; titulo: string; descripcion: string | null; youtube_id: string; activo: boolean }
interface Alumno { id: number; full_name: string | null; username: string; empresas: string; completados: number; ultima: string | null }

const input = 'w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white'

/** Plataforma → Aprendizaje: videos (YouTube "No listado"), su orden, el link de "agendar" y el avance de cada cliente. */
export default function AprendizajePanel() {
  const confirm = useConfirm()
  const [datos, setDatos] = useState<{ videos: Video[]; alumnos: Alumno[]; agendar: string | null } | null>(null)
  const [nuevo, setNuevo] = useState({ url: '', titulo: '', descripcion: '' })
  const [agendar, setAgendar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [vez, setVez] = useState(0)
  const [editando, setEditando] = useState<{ id: number; titulo: string; descripcion: string; url: string } | null>(null)
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
    if (await pedir('/api/plataforma/aprendizaje', 'POST', nuevo, `Video "${nuevo.titulo}" agregado al final.`)) setNuevo({ url: '', titulo: '', descripcion: '' })
  }
  const borrar = async (v: Video) => {
    if (!await confirm({ title: 'Borrar video', message: `Se borra "${v.titulo}" y el avance de todos en ese video.`, confirmText: 'Borrar' })) return
    pedir(`/api/plataforma/aprendizaje/${v.id}`, 'DELETE', undefined, 'Video borrado.')
  }

  if (!datos) return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-neutral-400">Cargando…</p>
  const activos = datos.videos.filter(v => v.activo).length

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
        </div>
        <div className="flex justify-end">
          <button onClick={agregar} disabled={!nuevo.url.trim() || !nuevo.titulo.trim()} className="btn-primary text-sm disabled:opacity-40">+ Agregar video</button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-neutral-900">Videos <span className="text-neutral-400 font-normal text-sm">({activos} visibles · en este orden se ven)</span></h2>
        {datos.videos.length === 0 ? (
          <p className="text-sm text-neutral-400 bg-white rounded-xl border border-neutral-200 p-6 text-center">Todavía no hay videos. Mientras no haya, “Aprendizaje” muestra los primeros pasos.</p>
        ) : (
          <ol className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
            {datos.videos.map((v, i) => editando?.id === v.id ? (
              <li key={v.id} className="px-4 py-3 space-y-2 bg-neutral-50/60">
                <p className="text-xs font-medium text-neutral-500">Editar video {i + 1}</p>
                <input className={input} placeholder="Título" maxLength={120} value={editando.titulo}
                  onChange={e => setEditando({ ...editando, titulo: e.target.value })} />
                <textarea className={input} rows={2} placeholder="Descripción (opcional)" maxLength={500} value={editando.descripcion}
                  onChange={e => setEditando({ ...editando, descripcion: e.target.value })} />
                <input className={input} placeholder="Link de YouTube" value={editando.url}
                  onChange={e => setEditando({ ...editando, url: e.target.value })} />
                <p className="text-xs text-neutral-500">Si cambias el video, quien ya lo había completado lo mantiene visto; a los demás se les reinicia el avance de ese video.</p>
                <div className="flex gap-2">
                  <button disabled={editando.titulo.trim().length < 2 || !editando.url.trim()}
                    onClick={async () => {
                      const cambio: Record<string, unknown> = { titulo: editando.titulo, descripcion: editando.descripcion.trim() || null }
                      if (editando.url.trim() !== `https://youtu.be/${v.youtube_id}`) cambio.url = editando.url
                      if (await pedir(`/api/plataforma/aprendizaje/${v.id}`, 'PUT', cambio, `Video "${editando.titulo.trim()}" guardado.`)) setEditando(null)
                    }}
                    className="btn-primary text-sm disabled:opacity-40">Guardar</button>
                  <button onClick={() => setEditando(null)} className="btn-secondary text-sm">Cancelar</button>
                </div>
              </li>
            ) : (
              <li key={v.id} className={`px-4 py-3 flex flex-wrap items-center gap-3 ${v.activo ? '' : 'opacity-50'}`}>
                <span className="w-6 text-center text-sm text-neutral-400 num">{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://i.ytimg.com/vi/${v.youtube_id}/mqdefault.jpg`} alt="" className="w-24 aspect-video rounded object-cover bg-neutral-100" />
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-sm font-medium text-neutral-900">{v.titulo}</p>
                  {v.descripcion && <p className="text-xs text-neutral-500 line-clamp-1">{v.descripcion}</p>}
                  <a href={`https://youtu.be/${v.youtube_id}`} target="_blank" rel="noreferrer" className="text-xs text-sky-700 hover:underline">youtu.be/{v.youtube_id}</a>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <button onClick={() => pedir(`/api/plataforma/aprendizaje/${v.id}`, 'PUT', { mover: 'arriba' })} disabled={i === 0}
                    className="btn-ghost px-2 py-1 disabled:opacity-30" title="Subir">↑</button>
                  <button onClick={() => pedir(`/api/plataforma/aprendizaje/${v.id}`, 'PUT', { mover: 'abajo' })} disabled={i === datos.videos.length - 1}
                    className="btn-ghost px-2 py-1 disabled:opacity-30" title="Bajar">↓</button>
                  <button onClick={() => setEditando({ id: v.id, titulo: v.titulo, descripcion: v.descripcion ?? '', url: `https://youtu.be/${v.youtube_id}` })}
                    className="btn-ghost px-2 py-1 text-xs">Editar</button>
                  <button onClick={() => pedir(`/api/plataforma/aprendizaje/${v.id}`, 'PUT', { activo: !v.activo })}
                    className="btn-ghost px-2 py-1 text-xs">{v.activo ? 'Ocultar' : 'Mostrar'}</button>
                  <button onClick={() => borrar(v)} className="btn-ghost px-2 py-1 text-xs text-red-600">Borrar</button>
                </div>
              </li>
            ))}
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

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-neutral-900">Avance de los clientes</h2>
        {datos.alumnos.length === 0 ? (
          <p className="text-sm text-neutral-400 bg-white rounded-xl border border-neutral-200 p-6 text-center">Todavía no hay usuarios de empresas clientes.</p>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr><th className="px-4 py-2 text-left">Usuario</th><th className="px-4 py-2 text-left">Empresa</th>
                  <th className="px-4 py-2 text-left">Avance</th><th className="px-4 py-2 text-left">Último video</th></tr>
              </thead>
              <tbody>
                {datos.alumnos.map(a => {
                  const p = activos ? Math.min(100, Math.round(a.completados / activos * 100)) : 0
                  return (
                    <tr key={a.id} className="border-t border-neutral-100">
                      <td className="px-4 py-2"><div className="font-medium">{a.full_name ?? a.username}</div><div className="text-xs text-neutral-400 font-mono">{a.username}</div></td>
                      <td className="px-4 py-2 text-neutral-600">{a.empresas}</td>
                      <td className="px-4 py-2 min-w-[10rem]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-neutral-100 overflow-hidden"><div className={`h-full ${p === 100 ? 'bg-lime-500' : 'bg-sky-400'}`} style={{ width: `${p}%` }} /></div>
                          <span className="text-xs num text-neutral-600">{a.completados}/{activos}</span>
                          {p === 100 && <span className="text-xs text-lime-700 font-medium">✓ listo</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-neutral-500">{a.ultima ? new Date(a.ultima).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
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
