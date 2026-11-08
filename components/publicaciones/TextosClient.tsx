'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { caracteresNoPermitidos, limpiarTexto } from '@/lib/descripcionTexto'

// Textos de descripción (08-11): encabezados y pies guardados, por cuenta o para todas. Editar uno puede actualizarlo
// en ML en todas las publicaciones que lo usan (en lote). «Detectar» busca textos que ya se repiten en muchas
// descripciones para guardarlos con un clic.
interface Texto { id: number; tipo: 'encabezado' | 'condiciones' | 'pie'; nombre: string; texto: string; conexion_id: number | null; cuenta: string | null; usos: number }
interface Cuenta { id: number; nickname: string; publicaciones: number; leidas: number }
interface Candidato { tipo: 'encabezado' | 'pie'; texto: string; lineas: number; publicaciones: number }
type Form = { id: number | null; tipo: 'encabezado' | 'condiciones' | 'pie'; nombre: string; texto: string; conexion_id: number | null; usos: number; actualizarEnML: boolean }

export default function TextosClient() {
  const [d, setD] = useState<{ textos: Texto[]; cuentas: Cuenta[] } | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [aviso, setAviso] = useState<React.ReactNode>(null)
  const [cuentaDet, setCuentaDet] = useState<number | null>(null)
  const [cand, setCand] = useState<{ leidas: number; candidatos: Candidato[] } | null>(null)

  // ?editar=ID (botón «Editar texto» del editor de publicación): abre ese texto apenas carga.
  const editar = Number(useSearchParams().get('editar')) || null
  const abierto = useRef(false)
  const cargar = useCallback(() => {
    fetch('/api/publicaciones/textos').then(r => r.json()).then(x => {
      setD({ textos: x.textos ?? [], cuentas: x.cuentas ?? [] })
      const t = editar && !abierto.current ? (x.textos as Texto[] ?? []).find(y => y.id === editar) : null
      if (t) { abierto.current = true; setForm({ id: t.id, tipo: t.tipo, nombre: t.nombre, texto: t.texto, conexion_id: t.conexion_id, usos: t.usos, actualizarEnML: t.usos > 0 }) }
    }).catch(() => setD({ textos: [], cuentas: [] }))
  }, [editar])
  useEffect(() => { cargar() }, [cargar])
  const detectar = useCallback((cuenta: number) => {
    fetch(`/api/publicaciones/textos/detectar?cuenta=${cuenta}`).then(r => r.json()).then(x => setCand({ leidas: x.leidas ?? 0, candidatos: x.candidatos ?? [] })).catch(() => setCand({ leidas: 0, candidatos: [] }))
  }, [])

  const guardar = async () => {
    if (!form) return
    setGuardando(true); setErr(null)
    try {
      const body = { tipo: form.tipo, nombre: form.nombre, texto: form.texto, conexion_id: form.conexion_id, actualizarEnML: form.actualizarEnML }
      const r = await fetch(form.id ? `/api/publicaciones/textos/${form.id}` : '/api/publicaciones/textos',
        { method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const x = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(x.error ?? 'No se pudo guardar'); return }
      setForm(null)
      setAviso(x.lote ? <>Guardado. Se está actualizando en MercadoLibre: <Link href={`/publicaciones/lotes?lote=${x.lote}`} className="underline">ver el avance</Link>.</>
        : x.separadas ? `Guardado. Se reconoció en ${x.separadas} descripciones ya leídas.` : 'Guardado.')
      cargar(); if (cuentaDet) detectar(cuentaDet)
    } finally { setGuardando(false) }
  }
  const borrar = async (t: Texto) => {
    if (!confirm(`¿Borrar «${t.nombre}»? En MercadoLibre no cambia nada: las publicaciones lo siguen teniendo, solo deja de estar separado.`)) return
    await fetch(`/api/publicaciones/textos/${t.id}`, { method: 'DELETE' })
    cargar()
  }
  const leer = async (cuenta: number) => {
    const r = await fetch('/api/publicaciones/textos/detectar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cuenta }) })
    const x = await r.json().catch(() => ({}))
    setAviso(x.nada ? 'Ya están todas leídas (de las últimas 12 horas).'
      : x.lote ? <>Leyendo las descripciones (solo lee, no cambia nada en ML). Tarda unos minutos: <Link href={`/publicaciones/lotes?lote=${x.lote}`} className="underline">ver el avance</Link>; después vuelve a «Buscar repetidos».</> : x.error ?? 'No se pudo')
  }

  if (!d) return <div className="h-40 rounded-xl border border-neutral-200 bg-neutral-50 animate-pulse" />
  const malos = form ? caracteresNoPermitidos(form.texto) : []
  const nuevo = (tipo: 'encabezado' | 'condiciones' | 'pie', texto = '', conexion_id: number | null = null) =>
    setForm({ id: null, tipo, nombre: '', texto, conexion_id, usos: 0, actualizarEnML: false })

  return (
    <div className="space-y-4">
      {aviso && <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2 flex justify-between gap-2"><span>{aviso}</span><button type="button" onClick={() => setAviso(null)}>✕</button></div>}

      {(['encabezado', 'condiciones', 'pie'] as const).map(tipo => {
        const lista = d.textos.filter(t => t.tipo === tipo)
        return (
          <section key={tipo} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-neutral-900">{tipo === 'pie' ? 'Pies (al final)' : tipo === 'condiciones' ? 'Condiciones de compra (después del producto, antes del pie)' : 'Encabezados (arriba de la descripción)'}</h2>
                <p className="text-xs text-neutral-500">{tipo === 'pie' ? 'Ubicación, horario, datos de la tienda…' : tipo === 'condiciones' ? 'Envíos, montos mínimos, formas de pago, garantía, cambios…' : 'Saludo o datos que van antes de la descripción del producto.'}</p>
              </div>
              <button type="button" onClick={() => nuevo(tipo)} className="btn-secondary !px-3 !py-1.5">+ Nuevo</button>
            </div>
            {!lista.length ? <p className="text-sm text-neutral-500">{tipo === 'condiciones' ? 'Ningunas todavía.' : 'Ninguno todavía.'}</p> : (
              <ul className="divide-y divide-neutral-100">
                {lista.map(t => (
                  <li key={t.id} className="py-2 flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-neutral-900">{t.nombre} <span className="text-xs font-normal text-neutral-500">· {t.cuenta ?? 'todas las cuentas'} · lo usan {t.usos}</span></p>
                      <p className="text-xs text-neutral-500 whitespace-pre-wrap line-clamp-3">{t.texto}</p>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <button type="button" onClick={() => setForm({ id: t.id, tipo: t.tipo, nombre: t.nombre, texto: t.texto, conexion_id: t.conexion_id, usos: t.usos, actualizarEnML: t.usos > 0 })} className="px-2.5 py-1 rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100">Editar</button>
                      <button type="button" onClick={() => borrar(t)} className="px-2.5 py-1 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50">Borrar</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-neutral-900">Detectar textos repetidos</h2>
          <p className="text-xs text-neutral-500">Busca lo que ya está pegado igual al final (o al principio) de muchas descripciones, para guardarlo como pie o encabezado. Primero hay que leer las descripciones de la cuenta (solo lee).</p>
        </div>
        <div className="space-y-2">
          {d.cuentas.map(c => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium w-32">{c.nickname}</span>
              <span className="text-xs text-neutral-500">{c.leidas.toLocaleString('es-VE')} de {c.publicaciones.toLocaleString('es-VE')} descripciones leídas</span>
              <button type="button" onClick={() => leer(c.id)} className="text-xs px-2 py-1 rounded border border-neutral-300">Leer descripciones</button>
              <button type="button" onClick={() => { setCuentaDet(c.id); setCand(null); detectar(c.id) }} disabled={!c.leidas} className="text-xs px-2 py-1 rounded border border-neutral-300 disabled:opacity-40">Buscar repetidos</button>
            </div>
          ))}
        </div>
        {cuentaDet && (!cand ? <p className="text-sm text-neutral-500">Buscando…</p> : !cand.candidatos.length ? (
          <p className="text-sm text-neutral-500">No se encontraron textos repetidos nuevos en {cand.leidas} descripciones.</p>
        ) : (
          <ul className="space-y-2">
            {cand.candidatos.map((c, i) => (
              <li key={i} className="rounded-lg border border-neutral-200 p-3 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-neutral-600"><b>{c.tipo === 'pie' ? 'Final' : 'Inicio'}</b> igual en {c.publicaciones} publicaciones · {c.lineas} líneas</span>
                  <button type="button" onClick={() => nuevo(c.tipo, c.texto, cuentaDet)} className="text-xs px-2 py-1 rounded border border-sky-300 text-sky-700">Guardar como {c.tipo === 'pie' ? 'pie o condiciones' : c.tipo}</button>
                </div>
                <p className="text-xs text-neutral-600 whitespace-pre-wrap max-h-28 overflow-y-auto bg-neutral-50 rounded px-2 py-1">{c.texto}</p>
              </li>
            ))}
          </ul>
        ))}
      </section>

      {form && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !guardando && setForm(null)}>
          <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-neutral-900">{form.id ? 'Editar texto' : 'Nuevo texto'}</h3>
            <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-neutral-600">Va como</span>
              {(['encabezado', 'condiciones', 'pie'] as const).map(t => <button key={t} type="button" disabled={!!form.id} onClick={() => setForm({ ...form, tipo: t })}
                className={`px-2.5 py-1 rounded-lg border text-xs disabled:cursor-default ${form.tipo === t ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 disabled:opacity-40'}`}>
                {t === 'encabezado' ? 'Encabezado' : t === 'condiciones' ? 'Condiciones de compra' : 'Pie'}</button>)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Nombre</span>
                <input value={form.nombre} maxLength={60} onChange={e => setForm({ ...form, nombre: e.target.value })} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" /></label>
              <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Para</span>
                <select value={form.conexion_id ?? ''} onChange={e => setForm({ ...form, conexion_id: e.target.value ? Number(e.target.value) : null })} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-white">
                  <option value="">Todas las cuentas</option>
                  {d.cuentas.map(c => <option key={c.id} value={c.id}>Solo {c.nickname}</option>)}
                </select></label>
            </div>
            <textarea rows={10} value={form.texto} onChange={e => setForm({ ...form, texto: e.target.value })} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
            {malos.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                <span>MercadoLibre no acepta: <b className="tracking-widest">{malos.join(' ')}</b></span>
                <button type="button" onClick={() => setForm({ ...form, texto: limpiarTexto(form.texto) })} className="px-2 py-1 rounded border border-amber-300 bg-white">Quitarlos</button>
              </div>
            )}
            {form.id && form.usos > 0 && (
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.actualizarEnML} onChange={e => setForm({ ...form, actualizarEnML: e.target.checked })} />
                <span>Actualizarlo también en MercadoLibre en las {form.usos} publicaciones que lo usan (activas y pausadas; se manda de a poco)</span></label>
            )}
            {err && <p className="text-xs text-red-700">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} disabled={guardando} className="btn-secondary !px-3 !py-1.5">Cancelar</button>
              <button type="button" onClick={guardar} disabled={guardando || !form.nombre.trim() || !form.texto.trim() || malos.length > 0} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
