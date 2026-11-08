'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { CambiosPublicacion, CampoFicha, Publicacion, ResultadoGuardar } from '@/lib/publicacionesML'

// Editor de UNA publicación de MercadoLibre (Fase 6, 2026-11-07). Se carga lo que hay AHORA en ML, se edita como en
// ML y al guardar se muestra "antes → después" de cada cosa; recién ahí se manda (solo lo que cambió).

const MAX_FOTOS = 10
type Valor = { vid: string | null; vname: string }
interface Borrador {
  titulo: string; precio: string; stock: string; estado: string; descripcion: string
  valores: Record<string, Valor>
  fotos: { id: string; url: string }[]
  variantes: Record<number, { stock: string; combos: { id: string | null; nombre: string; valor: string }[]; fotos: string[] }>
}

const num = (s: string) => { const n = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN }
const dinero = (n: number, moneda: string) => (moneda === 'COP' ? '$ ' : moneda === 'USD' ? 'US$ ' : `${moneda} `)
  + n.toLocaleString('de-DE', { minimumFractionDigits: moneda === 'COP' ? 0 : 2, maximumFractionDigits: moneda === 'COP' ? 0 : 2 })
const precioTxt = (n: number, moneda: string) => n.toLocaleString('de-DE', { maximumFractionDigits: moneda === 'COP' ? 0 : 2 })
const ESTADOS: Record<string, string> = { active: 'Activa', paused: 'Pausada', closed: 'Finalizada', under_review: 'En revisión', inactive: 'Inactiva' }
const NOMBRE_PARTE: Record<string, string> = {
  titulo: 'Título', precio: 'Precio', stock: 'Stock', estado: 'Estado', descripcion: 'Descripción',
  caracteristicas: 'Características', fotos: 'Fotos', variantes: 'Variantes', publicacion: 'Publicación',
}

function borradorDe(p: Publicacion): Borrador {
  return {
    titulo: p.item.titulo, precio: precioTxt(p.item.precio, p.item.moneda), stock: String(p.item.stock), estado: p.item.estado,
    descripcion: p.descripcion,
    valores: Object.fromEntries(p.campos.map(c => [c.id, { vid: c.valorId, vname: c.valor ?? '' }])),
    fotos: p.fotos,
    variantes: Object.fromEntries(p.variantes.map(v => [v.id, { stock: String(v.stock), combos: v.combinaciones.map(c => ({ ...c })), fotos: v.fotos }])),
  }
}

const textoValor = (c: CampoFicha, v: Valor | { vid: string | null; vname: string | null }) =>
  v.vid === '-1' ? 'No aplica' : (v.vid ? c.valores.find(x => x.id === v.vid)?.nombre ?? v.vname : v.vname) || '—'

/** Lo que cambió: lo que se manda y la lista para "antes → después". */
function diferencias(p: Publicacion, b: Borrador) {
  const c: CambiosPublicacion = {}
  const lista: { parte: string; antes: string; despues: string }[] = []
  const errores: string[] = []
  if (b.titulo.trim() !== p.item.titulo) {
    c.titulo = b.titulo.trim(); lista.push({ parte: 'Título', antes: p.item.titulo, despues: c.titulo })
    if (!c.titulo) errores.push('El título no puede quedar vacío')
  }
  const precio = num(b.precio)
  if (!Number.isFinite(precio) || precio <= 0) errores.push('El precio no es válido')
  else if (Math.abs(precio - p.item.precio) > 0.0001) {
    c.precio = precio; lista.push({ parte: 'Precio', antes: dinero(p.item.precio, p.item.moneda), despues: dinero(precio, p.item.moneda) })
  }
  if (!p.variantes.length) {
    const st = Number(b.stock)
    if (!Number.isInteger(st) || st < 0) errores.push('El stock no es válido')
    else if (st !== p.item.stock) { c.stock = st; lista.push({ parte: 'Stock', antes: String(p.item.stock), despues: String(st) }) }
  }
  if (b.estado !== p.item.estado && (b.estado === 'active' || b.estado === 'paused')) {
    c.estado = b.estado; lista.push({ parte: 'Estado', antes: ESTADOS[p.item.estado] ?? p.item.estado, despues: ESTADOS[b.estado] })
  }
  if (b.descripcion.trim() !== p.descripcion.trim()) {
    c.descripcion = b.descripcion
    lista.push({ parte: 'Descripción', antes: `${p.descripcion.trim().length} caracteres`, despues: `${b.descripcion.trim().length} caracteres` })
  }
  const atributos: NonNullable<CambiosPublicacion['atributos']> = []
  for (const campo of p.campos) {
    const v = b.valores[campo.id]
    if (!v) continue
    const antesVid = campo.valorId ?? null, antesName = campo.valor ?? ''
    if ((v.vid ?? null) === antesVid && (v.vid ? true : v.vname.trim() === antesName)) continue
    if (!v.vid && !v.vname.trim() && !antesVid && !antesName) continue
    if (v.vid) atributos.push({ id: campo.id, value_id: v.vid })
    else if (v.vname.trim()) atributos.push({ id: campo.id, value_name: v.vname.trim() })
    else atributos.push({ id: campo.id, value_id: '-1', value_name: null })
    lista.push({ parte: campo.nombre, antes: textoValor(campo, { vid: antesVid, vname: antesName }), despues: textoValor(campo, v.vid || v.vname.trim() ? v : { vid: '-1', vname: '' }) })
  }
  if (atributos.length) c.atributos = atributos
  const fotosAntes = p.fotos.map(f => f.id).join(','), fotosAhora = b.fotos.map(f => f.id).join(',')
  if (fotosAntes !== fotosAhora) {
    c.fotos = b.fotos.map(f => f.id)
    const nuevas = b.fotos.filter(f => !p.fotos.some(x => x.id === f.id)).length
    const quitadas = p.fotos.filter(f => !b.fotos.some(x => x.id === f.id)).length
    lista.push({ parte: 'Fotos', antes: `${p.fotos.length} fotos`, despues: `${b.fotos.length} fotos`
      + [nuevas && `${nuevas} nueva${nuevas === 1 ? '' : 's'}`, quitadas && `${quitadas} quitada${quitadas === 1 ? '' : 's'}`, !nuevas && !quitadas && 'otro orden']
        .filter(Boolean).map(x => ` · ${x}`).join('') })
    if (!b.fotos.length) errores.push('La publicación tiene que tener al menos una foto')
  }
  const variantes: NonNullable<CambiosPublicacion['variantes']> = []
  for (const v of p.variantes) {
    const e = b.variantes[v.id]
    if (!e) continue
    const nombreAntes = v.combinaciones.map(x => x.valor).join(' / ') || `#${v.id}`
    const out: NonNullable<CambiosPublicacion['variantes']>[number] = { id: v.id }
    const st = Number(e.stock)
    if (!Number.isInteger(st) || st < 0) errores.push(`Stock no válido en ${nombreAntes}`)
    else if (st !== v.stock) { out.stock = st; lista.push({ parte: `Stock · ${nombreAntes}`, antes: String(v.stock), despues: String(st) }) }
    if (e.combos.some(x => !x.valor.trim())) errores.push(`Falta el nombre en ${nombreAntes}`)
    else if (e.combos.map(x => x.valor.trim()).join('|') !== v.combinaciones.map(x => x.valor).join('|')) {
      out.combinaciones = e.combos.map(x => ({ ...x, valor: x.valor.trim() }))
      lista.push({ parte: 'Variante', antes: nombreAntes, despues: e.combos.map(x => x.valor.trim()).join(' / ') })
    }
    const vivas = e.fotos.filter(id => b.fotos.some(f => f.id === id))
    if (e.fotos.join(',') !== v.fotos.join(',')) {
      out.fotos = vivas
      lista.push({ parte: `Fotos · ${nombreAntes}`, antes: `${v.fotos.length} fotos`, despues: `${vivas.length} fotos` })
    }
    if (!vivas.length && (out.fotos || c.fotos)) errores.push(`La variante ${nombreAntes} se queda sin fotos`)
    if (Object.keys(out).length > 1) variantes.push(out)
  }
  if (variantes.length) c.variantes = variantes
  return { cambios: c, lista, errores }
}

function CampoInput({ c, v, onChange }: { c: CampoFicha; v: Valor; onChange: (v: Valor) => void }) {
  const base = 'w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-white'
  if (c.tipo === 'list' || c.tipo === 'boolean') {
    return (
      <select value={v.vid ?? ''} onChange={e => onChange({ vid: e.target.value || null, vname: c.valores.find(x => x.id === e.target.value)?.nombre ?? '' })} className={base}>
        <option value="">{v.vid ? '' : 'Elegir…'}</option>
        {c.valores.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        <option value="-1">No aplica</option>
      </select>
    )
  }
  if (c.tipo === 'number_unit') {
    const m = /^\s*([\d.,]+)\s*(.*)$/.exec(v.vname) ?? ['', '', '']
    const unidad = m[2] || c.unidad || c.unidades.find(u => u !== '"') || c.unidades[0] || ''
    return (
      <div className="flex gap-2">
        <input inputMode="decimal" value={m[1]} onChange={e => onChange({ vid: null, vname: e.target.value ? `${e.target.value} ${unidad}`.trim() : '' })} className={base} />
        {c.unidades.length > 0 && (
          <select value={unidad} onChange={e => onChange({ vid: null, vname: m[1] ? `${m[1]} ${e.target.value}` : '' })} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm bg-white">
            {c.unidades.map(u => <option key={u}>{u}</option>)}
          </select>
        )}
      </div>
    )
  }
  const lista = `dl-${c.id}`
  return <>
    <input value={v.vid === '-1' ? '' : v.vname} maxLength={c.largoMax ?? 255} inputMode={c.tipo === 'number' ? 'decimal' : undefined}
      placeholder={v.vid === '-1' ? 'No aplica' : undefined} list={c.valores.length ? lista : undefined}
      onChange={e => { const t = e.target.value; onChange({ vid: c.valores.find(x => x.nombre.toLowerCase() === t.trim().toLowerCase())?.id ?? null, vname: t }) }}
      className={base} />
    {c.valores.length > 0 && <datalist id={lista}>{c.valores.slice(0, 300).map(x => <option key={x.id} value={x.nombre} />)}</datalist>}
  </>
}

function Seccion({ titulo, ayuda, children, derecha }: { titulo: string; ayuda?: React.ReactNode; children: React.ReactNode; derecha?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-neutral-900">{titulo}</h2>
          {ayuda && <p className="text-xs text-neutral-500 mt-0.5">{ayuda}</p>}
        </div>
        {derecha}
      </div>
      {children}
    </section>
  )
}

export default function EditorPublicacion({ itemId }: { itemId: string }) {
  const [p, setP] = useState<Publicacion | null>(null)
  const [b, setB] = useState<Borrador | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revisar, setRevisar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoGuardar | null>(null)
  const [subiendo, setSubiendo] = useState(0)
  const [errorFoto, setErrorFoto] = useState<string | null>(null)
  const [todas, setTodas] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/publicaciones/${itemId}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!vivo) return
      if (!r.ok) setError(d.error ?? 'No se pudo leer la publicación de MercadoLibre')
      else { setError(null); setP(d); setB(borradorDe(d)) }
    }).catch(() => { if (vivo) setError('No se pudo leer la publicación de MercadoLibre') })
    return () => { vivo = false }
  }, [itemId])

  const dif = useMemo(() => (p && b ? diferencias(p, b) : null), [p, b])
  const hayCambios = !!dif?.lista.length

  useEffect(() => {
    if (!hayCambios) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [hayCambios])

  if (error) return (
    <div className="bg-white rounded-xl border border-red-200 p-5 text-sm text-red-700 space-y-2">
      <p>{error}</p>
      <Link href="/publicaciones" className="text-sky-700 hover:underline">← Volver a Publicaciones</Link>
    </div>
  )
  if (!p || !b || !dif) return <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-32 rounded-xl border border-neutral-200 bg-neutral-50 animate-pulse" />)}</div>

  const set = (f: (b: Borrador) => Borrador) => { setB(x => x && f(x)); setResultado(null) }
  const moneda = p.item.moneda
  const precio = num(b.precio)
  const comision = Number.isFinite(precio) ? precio * p.comision / 100 : null
  const principales = p.campos.filter(c => c.principal)
  const secundarias = p.campos.filter(c => !c.principal)
  const secundariasVisibles = todas ? secundarias : secundarias.filter(c => c.valor || c.valorId || b.valores[c.id]?.vname)
  const fotoUsada = (id: string) => p.variantes.filter(v => b.variantes[v.id]?.fotos.includes(id))

  const moverFoto = (i: number, d: -1 | 1) => set(x => {
    const f = [...x.fotos]; const j = i + d
    if (j < 0 || j >= f.length) return x
    ;[f[i], f[j]] = [f[j], f[i]]
    return { ...x, fotos: f }
  })
  const quitarFoto = (id: string) => set(x => ({
    ...x, fotos: x.fotos.filter(f => f.id !== id),
    variantes: Object.fromEntries(Object.entries(x.variantes).map(([k, v]) => [k, { ...v, fotos: v.fotos.filter(f => f !== id) }])),
  }))
  const subir = async (files: FileList | null) => {
    if (!files?.length) return
    setErrorFoto(null)
    const lista = [...files].slice(0, Math.max(0, MAX_FOTOS - b.fotos.length))
    for (const f of lista) {
      setSubiendo(n => n + 1)
      try {
        const fd = new FormData(); fd.append('foto', f)
        const r = await fetch(`/api/publicaciones/${itemId}/foto`, { method: 'POST', body: fd })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) setErrorFoto(d.error ?? 'No se pudo subir la foto')
        else set(x => ({ ...x, fotos: [...x.fotos, { id: d.id, url: d.url }] }))
      } finally { setSubiendo(n => n - 1) }
    }
    if (archivo.current) archivo.current.value = ''
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const r = await fetch(`/api/publicaciones/${itemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dif.cambios) })
      const d = await r.json().catch(() => ({}))
      const res: ResultadoGuardar = d.errores ? d : { ok: false, guardado: [], errores: [{ parte: 'publicacion', mensaje: d.error ?? 'No se pudo guardar' }] }
      setRevisar(false)
      if (res.guardado.length) {
        // Lo que quedó de verdad en ML (recargado); si algo falló, se conserva lo que no se guardó para corregirlo.
        const r2 = await fetch(`/api/publicaciones/${itemId}`)
        const nuevo = r2.ok ? await r2.json() : null
        if (nuevo) { setP(nuevo); if (res.ok) setB(borradorDe(nuevo)) }
      }
      setResultado(res)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally { setGuardando(false) }
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start gap-3">
        {p.fotos[0] && <img src={p.fotos[0].url} alt="" className="w-16 h-16 rounded-lg object-contain bg-neutral-50 border border-neutral-200" />}
        <div className="min-w-0 flex-1">
          <Link href="/publicaciones" className="text-xs text-neutral-500 hover:text-neutral-800">← Publicaciones</Link>
          <h1 className="text-lg font-semibold text-neutral-900 leading-snug">{p.item.titulo}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {p.item.id} · {p.cuenta.nickname} · {ESTADOS[p.item.estado] ?? p.item.estado} · {p.item.vendidas.toLocaleString('es-VE')} vendidas
            {p.categoriaNombre && <> · {p.categoriaNombre}</>}
          </p>
        </div>
        <a href={p.item.permalink} target="_blank" rel="noreferrer" className="text-sm text-sky-700 hover:underline whitespace-nowrap">Ver en MercadoLibre ↗</a>
      </div>

      {resultado && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${resultado.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {resultado.ok ? <p>✓ Guardado en MercadoLibre: {resultado.guardado.map(x => NOMBRE_PARTE[x] ?? x).join(', ')}. Lo que ves es lo que quedó en ML.</p> : <>
            {resultado.guardado.length > 0 && <p>Se guardó: {resultado.guardado.map(x => NOMBRE_PARTE[x] ?? x).join(', ')}.</p>}
            <p className="font-medium">MercadoLibre no aceptó{resultado.guardado.length ? ' el resto' : ' los cambios'}:</p>
            <ul className="list-disc ml-5">{resultado.errores.map((e, i) => <li key={i}>{e.parte.split(', ').map(x => NOMBRE_PARTE[x] ?? x).join(', ')}: {e.mensaje}</li>)}</ul>
          </>}
        </div>
      )}
      {p.item.catalogo && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">Es una publicación de catálogo: MercadoLibre maneja la ficha, varias cosas no se pueden cambiar.</p>}

      <Seccion titulo="Título" ayuda={p.item.tituloEditable ? 'Hasta 60 caracteres.' : 'MercadoLibre no deja cambiar el título de una publicación que ya tiene ventas.'}>
        <input value={b.titulo} maxLength={60} disabled={!p.item.tituloEditable} onChange={e => set(x => ({ ...x, titulo: e.target.value }))}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50 disabled:text-neutral-500" />
        {p.item.tituloEditable && <p className="text-xs text-neutral-400 text-right">{b.titulo.length}/60</p>}
      </Seccion>

      <Seccion titulo="Precio y stock" ayuda={p.variantes.length ? 'Con variantes, el precio es el mismo para todas; el stock va en cada variante.' : undefined}>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-xs font-medium text-neutral-600">Precio ({moneda})</span>
            <input inputMode="decimal" value={b.precio} onChange={e => set(x => ({ ...x, precio: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm num" />
          </label>
          {!p.variantes.length && (
            <label className="block text-sm">
              <span className="text-xs font-medium text-neutral-600">Stock disponible</span>
              <input inputMode="numeric" value={b.stock} onChange={e => set(x => ({ ...x, stock: e.target.value.replace(/\D/g, '') }))}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm num" />
            </label>
          )}
          <label className="block text-sm">
            <span className="text-xs font-medium text-neutral-600">Estado</span>
            <select value={b.estado} disabled={!['active', 'paused'].includes(p.item.estado)} onChange={e => set(x => ({ ...x, estado: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white disabled:bg-neutral-50">
              {!['active', 'paused'].includes(p.item.estado) && <option value={p.item.estado}>{ESTADOS[p.item.estado] ?? p.item.estado}</option>}
              <option value="active">Activa</option><option value="paused">Pausada</option>
            </select>
          </label>
        </div>
        {comision != null && precio > 0 && (
          <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-3 py-2 text-xs text-neutral-600 space-y-0.5">
            <div className="flex justify-between"><span>Precio</span><span className="num">{dinero(precio, moneda)}</span></div>
            <div className="flex justify-between"><span>Comisión de ML (~{p.comision.toLocaleString('es-VE')}%, de Ajustes)</span><span className="num">− {dinero(comision, moneda)}</span></div>
            <div className="flex justify-between font-medium text-neutral-800 border-t border-neutral-200 pt-1"><span>Te queda antes del envío y el costo</span><span className="num">{dinero(precio - comision, moneda)}</span></div>
            {p.item.envioGratis && <p className="text-neutral-500">Tiene envío gratis: ML descuenta además el envío.</p>}
          </div>
        )}
      </Seccion>

      {p.variantes.length > 0 && (
        <Seccion titulo={`Variantes (${p.variantes.length})`} ayuda="Nombre de cada variante, su stock y qué fotos muestra. No se crean ni se borran variantes desde aquí.">
          <div className="space-y-3">
            {p.variantes.map(v => {
              const e = b.variantes[v.id]
              return (
                <div key={v.id} className="rounded-lg border border-neutral-200 p-3 space-y-2">
                  <div className="flex flex-wrap items-end gap-3">
                    {e.combos.map((c, i) => (
                      <label key={i} className="block text-sm flex-1 min-w-[140px]">
                        <span className="text-xs font-medium text-neutral-600">{c.nombre}</span>
                        <input value={c.valor} maxLength={80} onChange={ev => set(x => ({ ...x, variantes: { ...x.variantes, [v.id]: { ...e, combos: e.combos.map((y, j) => j === i ? { ...y, valor: ev.target.value } : y) } } }))}
                          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
                      </label>
                    ))}
                    <label className="block text-sm w-28">
                      <span className="text-xs font-medium text-neutral-600">Stock</span>
                      <input inputMode="numeric" value={e.stock} onChange={ev => set(x => ({ ...x, variantes: { ...x.variantes, [v.id]: { ...e, stock: ev.target.value.replace(/\D/g, '') } } }))}
                        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm num" />
                    </label>
                    <span className="text-xs text-neutral-500 pb-2">{v.vendidas} vendidas{v.sku ? ` · SKU ${v.sku}` : ''}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {b.fotos.map(f => {
                      const on = e.fotos.includes(f.id)
                      return (
                        <button key={f.id} type="button" title={on ? 'Quitar de esta variante' : 'Mostrar en esta variante'}
                          onClick={() => set(x => ({ ...x, variantes: { ...x.variantes, [v.id]: { ...e, fotos: on ? e.fotos.filter(y => y !== f.id) : [...e.fotos, f.id] } } }))}
                          className={`w-11 h-11 rounded-md border-2 overflow-hidden bg-neutral-50 ${on ? 'border-sky-500' : 'border-transparent opacity-40 hover:opacity-80'}`}>
                          <img src={f.url} alt="" className="w-full h-full object-contain" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Seccion>
      )}

      <Seccion titulo={`Fotos (${b.fotos.length}/${MAX_FOTOS})`} ayuda="La primera es la portada. Las nuevas se suben a MercadoLibre y quedan en la publicación al guardar."
        derecha={b.fotos.length < MAX_FOTOS && (
          <button type="button" onClick={() => archivo.current?.click()} disabled={subiendo > 0} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm disabled:opacity-50">
            {subiendo ? 'Subiendo…' : '+ Agregar fotos'}
          </button>
        )}>
        <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => subir(e.target.files)} />
        {errorFoto && <p className="text-xs text-red-700">{errorFoto}</p>}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {b.fotos.map((f, i) => {
            const usada = fotoUsada(f.id)
            return (
              <div key={f.id} className="relative rounded-lg border border-neutral-200 bg-neutral-50 aspect-square overflow-hidden group">
                <img src={f.url} alt="" className="w-full h-full object-contain" />
                {i === 0 && <span className="absolute top-1 left-1 text-[10px] bg-neutral-900 text-white rounded px-1.5 py-0.5">Portada</span>}
                {!p.fotos.some(x => x.id === f.id) && <span className="absolute top-1 right-1 text-[10px] bg-sky-600 text-white rounded px-1.5 py-0.5">Nueva</span>}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-white/90 text-xs">
                  <button type="button" onClick={() => moverFoto(i, -1)} disabled={i === 0} className="px-2 py-1 disabled:opacity-30" aria-label="Mover a la izquierda">←</button>
                  <button type="button" onClick={() => quitarFoto(f.id)} className="px-2 py-1 text-red-600"
                    title={usada.length ? `La usa${usada.length > 1 ? 'n' : ''} ${usada.length} variante${usada.length > 1 ? 's' : ''}: se quita también de ahí` : 'Quitar'}>✕</button>
                  <button type="button" onClick={() => moverFoto(i, 1)} disabled={i === b.fotos.length - 1} className="px-2 py-1 disabled:opacity-30" aria-label="Mover a la derecha">→</button>
                </div>
              </div>
            )
          })}
        </div>
      </Seccion>

      {principales.length > 0 && (
        <Seccion titulo="Características principales" ayuda="Las que MercadoLibre usa para los filtros y la ficha técnica. * = obligatoria.">
          <div className="grid gap-3 sm:grid-cols-2">
            {principales.map(c => (
              <label key={c.id} className="block text-sm">
                <span className="text-xs font-medium text-neutral-600">{c.nombre}{c.obligatorio && ' *'}</span>
                <div className="mt-1"><CampoInput c={c} v={b.valores[c.id]} onChange={v => set(x => ({ ...x, valores: { ...x.valores, [c.id]: v } }))} /></div>
                {c.ayuda && <span className="block text-[11px] text-neutral-400 mt-0.5">{c.ayuda}</span>}
              </label>
            ))}
          </div>
        </Seccion>
      )}

      {secundarias.length > 0 && (
        <Seccion titulo="Características secundarias" ayuda="Más datos de la ficha técnica. Si vacías una que tenía valor, queda como «No aplica»."
          derecha={<button type="button" onClick={() => setTodas(t => !t)} className="text-xs text-sky-700 hover:underline">
            {todas ? 'Ver solo las que tienen valor' : `Ver todas (${secundarias.length})`}</button>}>
          {secundariasVisibles.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {secundariasVisibles.map(c => (
                <label key={c.id} className="block text-sm">
                  <span className="text-xs font-medium text-neutral-600">{c.nombre}</span>
                  <div className="mt-1"><CampoInput c={c} v={b.valores[c.id]} onChange={v => set(x => ({ ...x, valores: { ...x.valores, [c.id]: v } }))} /></div>
                </label>
              ))}
            </div>
          ) : <p className="text-sm text-neutral-500">Ninguna tiene valor todavía. Toca «Ver todas» para completarlas.</p>}
        </Seccion>
      )}

      <Seccion titulo="Descripción" ayuda="Solo texto (MercadoLibre no acepta formato, links, teléfonos ni correos).">
        <textarea rows={10} value={b.descripcion} onChange={e => set(x => ({ ...x, descripcion: e.target.value }))}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
      </Seccion>

      {p.historial.length > 0 && (
        <Seccion titulo="Cambios hechos desde el sistema">
          <ul className="text-xs text-neutral-600 divide-y divide-neutral-100">
            {p.historial.map(h => (
              <li key={h.id} className="py-1.5 flex flex-wrap gap-x-2">
                <span className="text-neutral-400">{new Date(h.fecha).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span>{h.usuario ?? '—'}</span>
                <span className="font-medium">{h.partes.map(x => NOMBRE_PARTE[x] ?? x).join(', ')}</span>
                {h.ok ? <span className="text-emerald-600">guardado</span> : <span className="text-red-600">no lo aceptó ML: {h.error}</span>}
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {/* Barra de guardar */}
      {hayCambios && (
        <div className="fixed inset-x-0 bottom-16 md:bottom-0 z-30 bg-white/95 backdrop-blur border-t border-neutral-200 px-4 py-3">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-neutral-700">{dif.lista.length} cambio{dif.lista.length === 1 ? '' : 's'} sin guardar</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setB(borradorDe(p)); setResultado(null) }} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm">Descartar</button>
              <button type="button" onClick={() => setRevisar(true)} disabled={subiendo > 0} className="btn-primary text-sm">Revisar y guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Revisar: antes → después */}
      {revisar && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !guardando && setRevisar(false)}>
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-neutral-900">Se va a cambiar en MercadoLibre</h3>
            <p className="text-xs text-neutral-500">Lo ven los compradores apenas se guarda. Queda anotado en «Cambios hechos desde el sistema».</p>
            <ul className="divide-y divide-neutral-100 text-sm">
              {dif.lista.map((x, i) => (
                <li key={i} className="py-2">
                  <div className="text-xs font-medium text-neutral-500">{x.parte}</div>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-neutral-400 line-through break-all">{x.antes}</span>
                    <span className="text-neutral-400">→</span>
                    <span className="text-neutral-900 font-medium break-all">{x.despues}</span>
                  </div>
                </li>
              ))}
            </ul>
            {dif.errores.length > 0 && (
              <ul className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 list-disc ml-0 pl-6">{dif.errores.map((e, i) => <li key={i}>{e}</li>)}</ul>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setRevisar(false)} disabled={guardando} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm">Volver</button>
              <button type="button" onClick={guardar} disabled={guardando || dif.errores.length > 0} className="btn-primary text-sm">
                {guardando ? 'Guardando…' : 'Guardar en MercadoLibre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
