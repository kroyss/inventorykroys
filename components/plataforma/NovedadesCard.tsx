'use client'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { MODULOS } from '@/lib/modulos'

// Plataforma → Interno → Novedades (migración 095): lo que ven los clientes en el megáfono de la barra.
// Los borradores no los ve nadie; "Publicar" los muestra con el puntito a quien todavía no los vio.

interface Novedad {
  id: number; fecha: string; titulo: string; texto: string; modulo: string | null; enlace: string | null
  publicada_at: string | null
}
type Form = Omit<Novedad, 'id' | 'publicada_at'> & { id?: number }

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
const VACIO = (): Form => ({ fecha: hoy(), titulo: '', texto: '', modulo: null, enlace: '' })
const MODULO_CORTO: Record<string, string> = {
  preguntas: 'Preguntas / Mensajes / Calificaciones', despachos: 'Despachos', reportador: 'Reportador',
  alertas_stock: 'Stock', inventario: 'Inventario', pagos_me: 'Pagos ME', facturas: 'Facturas', finanzas: 'Finanzas',
}

export default function NovedadesCard() {
  const [lista, setLista] = useState<Novedad[] | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/plataforma/novedades')
    const d = await r.json().catch(() => ({}))
    if (r.ok) setLista(d.novedades); else setError(d.error ?? 'No se pudo cargar')
  }, [])
  useEffect(() => {
    let vivo = true
    fetch('/api/plataforma/novedades').then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => {
      if (!vivo) return
      if (ok) setLista(d.novedades); else setError(d.error ?? 'No se pudo cargar')
    }).catch(() => { if (vivo) setError('No se pudo cargar') })
    return () => { vivo = false }
  }, [])

  const llamar = async (metodo: string, body?: unknown, query = '') => {
    setBusy(true); setError(null)
    const r = await fetch(`/api/plataforma/novedades${query}`, {
      method: metodo, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo guardar'); return false }
    await cargar()
    return true
  }
  const guardar = async () => {
    if (!form) return
    const body = { ...form, enlace: form.enlace?.trim() || null }
    if (await llamar(form.id ? 'PUT' : 'POST', body)) setForm(null)
  }

  const publicarTodas = async () => {
    const ids = (lista ?? []).filter(n => !n.publicada_at).map(n => n.id)
    if (!ids.length || !confirm(`¿Publicar los ${ids.length} borradores? Los clientes los verán en el megáfono.`)) return
    setBusy(true); setError(null)
    for (const id of ids) {
      const r = await fetch('/api/plataforma/novedades', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, publicar: true }) })
      if (!r.ok) { setError('No se pudieron publicar todas'); break }
    }
    setBusy(false)
    await cargar()
  }

  const Fila = ({ n }: { n: Novedad }) => (
    <li className="px-4 py-3 flex flex-wrap items-start gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-72">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-neutral-400">{fecha(n.fecha)}</span>
          <span className="font-medium text-neutral-800">{n.titulo}</span>
          <span className="text-neutral-400">{n.modulo ? `con ${MODULO_CORTO[n.modulo] ?? n.modulo}` : 'todas las empresas'}{n.enlace ? ` · ${n.enlace}` : ''}</span>
        </div>
        <p className="mt-1 text-sm text-neutral-700">{n.texto}</p>
      </div>
      <div className="flex items-center gap-3 text-xs">
        {n.publicada_at
          ? <button onClick={() => llamar('PUT', { id: n.id, publicar: false })} disabled={busy} className="underline text-neutral-500 hover:text-neutral-800">Despublicar</button>
          : <button onClick={() => llamar('PUT', { id: n.id, publicar: true })} disabled={busy} className="btn-secondary text-xs px-2.5 py-1">Publicar</button>}
        <button onClick={() => setForm({ id: n.id, fecha: n.fecha, titulo: n.titulo, texto: n.texto, modulo: n.modulo, enlace: n.enlace ?? '' })}
          className="underline text-neutral-500 hover:text-neutral-800">Editar</button>
        <button onClick={() => { if (confirm('¿Borrar esta novedad?')) llamar('DELETE', undefined, `?id=${n.id}`) }}
          className="underline text-neutral-400 hover:text-red-700">Borrar</button>
      </div>
    </li>
  )

  const borradores = (lista ?? []).filter(n => !n.publicada_at).length
  const fecha = (f: string) => f.split('-').reverse().slice(0, 2).join('/')

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Novedades</h2>
          <p className="text-sm text-neutral-500">
            Lo que mejoramos, en el megáfono de la barra de los clientes (en el celular, Más → Novedades). Cada una la ven
            solo las empresas con su módulo. Corta: una o dos líneas.{borradores ? ` · ${borradores} borrador${borradores === 1 ? '' : 'es'} sin publicar` : ''}
          </p>
        </div>
        {!form && <button onClick={() => setForm(VACIO())} className="btn-secondary text-sm">+ Nueva</button>}
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

      {form && (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1"><span className="text-xs text-neutral-500">Fecha</span>
              <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className="w-full border border-neutral-300 rounded-lg px-2 py-1.5" />
            </label>
            <label className="space-y-1"><span className="text-xs text-neutral-500">Título (la sección)</span>
              <input value={form.titulo} maxLength={40} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Mensajes"
                className="w-full border border-neutral-300 rounded-lg px-2 py-1.5" />
            </label>
            <label className="space-y-1"><span className="text-xs text-neutral-500">Quién la ve</span>
              <select value={form.modulo ?? ''} onChange={e => setForm({ ...form, modulo: e.target.value || null })} className="w-full border border-neutral-300 rounded-lg px-2 py-1.5">
                <option value="">Todas las empresas</option>
                {Object.keys(MODULOS).map(m => <option key={m} value={m}>Con {MODULO_CORTO[m] ?? m}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1"><span className="text-xs text-neutral-500">Texto ({form.texto.length}/280)</span>
            <textarea value={form.texto} maxLength={280} rows={2} onChange={e => setForm({ ...form, texto: e.target.value })}
              placeholder="Ahora ves la foto del producto en cada conversación." className="w-full border border-neutral-300 rounded-lg px-2 py-1.5" />
          </label>
          <label className="block space-y-1"><span className="text-xs text-neutral-500">Enlace (opcional, una pantalla del sistema)</span>
            <input value={form.enlace ?? ''} onChange={e => setForm({ ...form, enlace: e.target.value })} placeholder="/mensajes"
              className="w-full sm:w-64 border border-neutral-300 rounded-lg px-2 py-1.5" />
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="btn-ghost text-sm">Cancelar</button>
            <button onClick={guardar} disabled={busy || !form.titulo.trim() || !form.texto.trim()} className="btn-primary text-sm">
              {busy ? 'Guardando…' : form.id ? 'Guardar' : 'Guardar como borrador'}
            </button>
          </div>
        </div>
      )}

      {!lista ? !error && <p className="text-sm text-neutral-400">Cargando…</p> : lista.length === 0 ? (
        <p className="text-sm text-neutral-400 py-6 text-center bg-white rounded-xl border border-neutral-200">Todavía no hay novedades.</p>
      ) : (
        <div className="space-y-5">
          <Grupo titulo="Borradores" detalle="Nadie los ve todavía. Publícalos cuando estén bien."
            vacio="No hay borradores." items={lista.filter(n => !n.publicada_at)}
            accion={lista.some(n => !n.publicada_at) ? (
              <button onClick={publicarTodas} disabled={busy} className="btn-secondary text-xs px-2.5 py-1">Publicar todas</button>
            ) : null}
            fila={n => <Fila n={n} />} />
          <Grupo titulo="Publicadas" detalle="Las ven los clientes en el megáfono (cada una, las empresas con su módulo)."
            vacio="Ninguna publicada: el megáfono no aparece hasta que publiques al menos una."
            items={lista.filter(n => n.publicada_at)} fila={n => <Fila n={n} />} plegado />
        </div>
      )}
    </section>
  )
}

/** Un grupo (Borradores / Publicadas) con su título, cuántas hay y la lista. */
function Grupo({ titulo, detalle, vacio, items, fila, accion, plegado = false }: {
  titulo: string; detalle: string; vacio: string; items: Novedad[]; fila: (n: Novedad) => React.ReactNode; accion?: React.ReactNode
  /** Publicadas: plegadas (solo el título y cuántas); se despliegan al tocar. */
  plegado?: boolean
}) {
  const borrador = titulo === 'Borradores'
  const [abierto, setAbierto] = useState(!plegado)
  return (
    <div className="space-y-2">
      <div className={`flex flex-wrap items-center gap-2 ${plegado ? 'cursor-pointer select-none' : ''}`} onClick={plegado ? () => setAbierto(a => !a) : undefined}>
        {plegado && <span className={`text-neutral-400 text-xs transition-transform ${abierto ? 'rotate-90' : ''}`}>▶</span>}
        <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${borrador ? 'text-amber-800' : 'text-lime-800'}`}>
          <span className={`w-2 h-2 rounded-full ${borrador ? 'bg-amber-400' : 'bg-lime-500'}`} />{titulo} ({items.length})
        </span>
        <span className="text-xs text-neutral-500">{detalle}</span>
        {accion && <span className="ml-auto">{accion}</span>}
      </div>
      {!abierto ? null : items.length === 0 ? (
        <p className="text-sm text-neutral-400 py-3 px-4 bg-white rounded-xl border border-dashed border-neutral-200">{vacio}</p>
      ) : (
        <ul className={`bg-white rounded-xl border shadow-sm divide-y divide-neutral-100 ${borrador ? 'border-amber-200' : 'border-lime-200'}`}>
          {items.map(n => <Fragment key={n.id}>{fila(n)}</Fragment>)}
        </ul>
      )}
    </div>
  )
}
