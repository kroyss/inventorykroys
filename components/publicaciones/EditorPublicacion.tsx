'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { CambiosPublicacion, CampoFicha, Publicacion, ResultadoGuardar } from '@/lib/publicacionesML'
import { componer, mismoTexto, caracteresNoPermitidos, limpiarTexto, tieneContacto, MAX_DESCRIPCION } from '@/lib/descripcionTexto'

// Editor de UNA publicación de MercadoLibre (Fase 6, 2026-11-07). Se carga lo que hay AHORA en ML, se edita como en
// ML y al guardar se muestra "antes → después" de cada cosa; recién ahí se manda (solo lo que cambió).

// 08-11: con variantes, cada variante tiene SUS fotos (subir, ordenar, quitar); las fotos de la publicación se arman
// solas juntando las de todas. La descripción va en 3 partes: encabezado y pie (textos guardados) + la del producto.
type Valor = { vid: string | null; vname: string }
interface Borrador {
  titulo: string; precio: string; stock: string; estado: string
  encId: number | null; pieId: number | null; condId: number | null; cuerpo: string
  valores: Record<string, Valor>
  fotos: string[]                       // sin variantes: las de la publicación, en orden
  variantes: Record<number, { stock: string; combos: { id: string | null; nombre: string; valor: string }[]; fotos: string[] }>
}
const sinRepetir = (a: string[]) => [...new Set(a)]

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
    encId: p.desc.encabezadoId, pieId: p.desc.pieId, condId: p.desc.condicionesId ?? null, cuerpo: p.desc.cuerpo,
    valores: Object.fromEntries(p.campos.map(c => [c.id, { vid: c.valorId, vname: c.valor ?? '' }])),
    fotos: p.fotos.map(f => f.id),
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
  const texto = textoFinal(p, b)
  if (!mismoTexto(texto, p.descripcion)) {
    c.descPartes = { encabezadoId: b.encId, pieId: b.pieId, condicionesId: b.condId, cuerpo: b.cuerpo }
    const enc = p.plantillas.find(x => x.id === b.encId), pie = p.plantillas.find(x => x.id === b.pieId)
    const encA = p.plantillas.find(x => x.id === p.desc.encabezadoId), pieA = p.plantillas.find(x => x.id === p.desc.pieId)
    if (b.encId !== p.desc.encabezadoId) lista.push({ parte: 'Encabezado', antes: encA?.nombre ?? 'sin encabezado', despues: enc?.nombre ?? 'sin encabezado' })
    if (b.pieId !== p.desc.pieId) lista.push({ parte: 'Pie', antes: pieA?.nombre ?? 'sin pie', despues: pie?.nombre ?? 'sin pie' })
    if (b.condId !== (p.desc.condicionesId ?? null)) {
      const nom = (id: number | null) => p.plantillas.find(x => x.id === id)?.nombre ?? 'sin condiciones'
      lista.push({ parte: 'Condiciones de compra', antes: nom(p.desc.condicionesId ?? null), despues: nom(b.condId) })
    }
    lista.push({ parte: 'Descripción', antes: `${p.descripcion.trim().length} caracteres`, despues: `${texto.length} caracteres` })
    const malos = caracteresNoPermitidos(texto)
    if (malos.length) errores.push(`La descripción tiene caracteres que MercadoLibre no acepta: ${malos.join(' ')}`)
    if (texto.length > MAX_DESCRIPCION) errores.push(`La descripción pasa de ${MAX_DESCRIPCION.toLocaleString('es-VE')} caracteres`)
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
  const lim = p.limites
  // Fotos de las variantes: si alguna cambió, las de la publicación son las de todas juntas (sin repetir).
  const fotosVarCambian = p.variantes.some(v => b.variantes[v.id] && b.variantes[v.id].fotos.join(',') !== v.fotos.join(','))
  const fotosNuevas = p.variantes.length
    ? (fotosVarCambian ? sinRepetir(p.variantes.flatMap(v => b.variantes[v.id]?.fotos ?? v.fotos)) : null)
    : (b.fotos.join(',') !== p.fotos.map(f => f.id).join(',') ? b.fotos : null)
  if (fotosNuevas) {
    c.fotos = fotosNuevas
    if (!p.variantes.length) {
      const nuevas = b.fotos.filter(id => !p.fotos.some(x => x.id === id)).length
      const quitadas = p.fotos.filter(f => !b.fotos.includes(f.id)).length
      lista.push({ parte: 'Fotos', antes: `${p.fotos.length} fotos`, despues: `${b.fotos.length} fotos` + resumenFotos(nuevas, quitadas) })
    }
    if (!fotosNuevas.length) errores.push('La publicación tiene que tener al menos una foto')
    if (fotosNuevas.length > lim.fotos) errores.push(`Entre todas las variantes hay ${fotosNuevas.length} fotos distintas: MercadoLibre permite ${lim.fotos} por publicación`)
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
    if (e.fotos.join(',') !== v.fotos.join(',')) {
      out.fotos = e.fotos
      const nuevas = e.fotos.filter(id => !v.fotos.includes(id)).length, quitadas = v.fotos.filter(id => !e.fotos.includes(id)).length
      lista.push({ parte: `Fotos · ${nombreAntes}`, antes: `${v.fotos.length} fotos`, despues: `${e.fotos.length} fotos` + resumenFotos(nuevas, quitadas) })
      if (!e.fotos.length) errores.push(`La variante ${nombreAntes} se queda sin fotos`)
      if (e.fotos.length > lim.fotosVariante) errores.push(`La variante ${nombreAntes} tiene ${e.fotos.length} fotos: MercadoLibre permite ${lim.fotosVariante}`)
    }
    if (Object.keys(out).length > 1) variantes.push(out)
  }
  if (variantes.length) c.variantes = variantes
  return { cambios: c, lista, errores }
}

const resumenFotos = (nuevas: number, quitadas: number) =>
  [nuevas && `${nuevas} nueva${nuevas === 1 ? '' : 's'}`, quitadas && `${quitadas} quitada${quitadas === 1 ? '' : 's'}`, !nuevas && !quitadas && 'otro orden']
    .filter(Boolean).map(x => ` · ${x}`).join('')

/** El texto completo como lo verá el comprador en ML. */
function textoFinal(p: Publicacion, b: Borrador) {
  return componer(p.plantillas.find(x => x.id === b.encId)?.texto, b.cuerpo, p.plantillas.find(x => x.id === b.pieId)?.texto, p.plantillas.find(x => x.id === b.condId)?.texto)
}

const mover = (a: string[], i: number, d: -1 | 1) => {
  const f = [...a]; const j = i + d
  if (j < 0 || j >= f.length) return a
  ;[f[i], f[j]] = [f[j], f[i]]
  return f
}

/** Fotos con ordenar y quitar (las de la publicación o las de una variante). */
function FilaFotos({ ids, url, nueva, onMover, onQuitar, chica }: {
  ids: string[]; url: (id: string) => string; nueva: (id: string) => boolean
  onMover: (i: number, d: -1 | 1) => void; onQuitar: (id: string) => void; chica?: boolean
}) {
  return (
    <div className={chica ? 'grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2' : 'grid grid-cols-3 sm:grid-cols-5 gap-2'}>
      {ids.map((id, i) => (
        <div key={id} className="relative rounded-lg border border-neutral-200 bg-neutral-50 aspect-square overflow-hidden">
          {url(id) ? <img src={url(id)} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full grid place-items-center text-[10px] text-neutral-400">foto</div>}
          {i === 0 && <span className="absolute top-1 left-1 text-[10px] bg-neutral-900 text-white rounded px-1.5 py-0.5">{chica ? '1ª' : 'Portada'}</span>}
          {nueva(id) && <span className="absolute top-1 right-1 text-[10px] bg-sky-600 text-white rounded px-1.5 py-0.5">Nueva</span>}
          <div className="absolute inset-x-0 bottom-0 flex justify-between bg-white/90 text-xs">
            <button type="button" onClick={() => onMover(i, -1)} disabled={i === 0} className="px-1.5 py-1 disabled:opacity-30" aria-label="Mover a la izquierda">←</button>
            <button type="button" onClick={() => onQuitar(id)} className="px-1.5 py-1 text-red-600" title="Quitar">✕</button>
            <button type="button" onClick={() => onMover(i, 1)} disabled={i === ids.length - 1} className="px-1.5 py-1 disabled:opacity-30" aria-label="Mover a la derecha">→</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ParteFija({ titulo, valor, opciones, texto, onChange }: {
  titulo: string; valor: number | null; opciones: { id: number; nombre: string; conexion_id: number | null }[]; texto?: string; onChange: (id: number | null) => void
}) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-neutral-600">{titulo}</span>
        <div className="flex items-center gap-2">
          <select value={valor ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs bg-white max-w-[220px]">
            <option value="">Sin {titulo.toLowerCase()}</option>
            {opciones.map(o => <option key={o.id} value={o.id}>{o.nombre}{o.conexion_id == null ? ' (todas las cuentas)' : ''}</option>)}
          </select>
          {valor != null && <>
            <Link href={`/publicaciones/textos?editar=${valor}`} target="_blank" title="Abre en otra pestaña: puedes cambiarlo y actualizarlo en todas las publicaciones que lo usan"
              className="px-2.5 py-1 rounded-lg border border-neutral-300 bg-white text-xs text-neutral-700 hover:bg-neutral-100 whitespace-nowrap">Editar texto</Link>
            <button type="button" onClick={() => onChange(null)} title="Lo saca de esta publicación (el texto guardado no se borra)"
              className="px-2.5 py-1 rounded-lg border border-red-200 bg-white text-xs text-red-700 hover:bg-red-50 whitespace-nowrap">Quitar</button>
          </>}
          <Link href="/publicaciones/textos" target="_blank" title="Crear, editar o borrar tus encabezados y pies (en otra pestaña)" className="px-2.5 py-1 rounded-lg border border-neutral-300 bg-white text-xs text-neutral-700 hover:bg-neutral-100 whitespace-nowrap">Textos guardados</Link>
        </div>
      </div>
      {texto ? <p className="text-xs text-neutral-600 whitespace-pre-wrap max-h-32 overflow-y-auto">{texto}</p>
        : <p className="text-[11px] text-neutral-400">{opciones.length ? 'Ninguno elegido.' : 'Todavía no hay textos guardados. Puedes crearlos desde «Textos de descripción» o con «Pasar…».'}</p>}
    </div>
  )
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
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [destino, setDestino] = useState<number | null>(null)     // a qué variante va la foto que se sube (null = publicación)
  const [elegir, setElegir] = useState<number | null>(null)       // variante que está eligiendo fotos de otra
  const [vista, setVista] = useState(false)
  const [pasar, setPasar] = useState<null | { tipo: 'encabezado' | 'condiciones' | 'pie'; linea: number; nombre: string; todas: boolean; guardando: boolean; error: string | null }>(null)
  const archivo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/publicaciones/${itemId}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!vivo) return
      if (!r.ok) setError(d.error ?? 'No se pudo leer la publicación de MercadoLibre')
      else { setError(null); setP(d); setB(borradorDe(d)); setUrls(u => ({ ...u, ...Object.fromEntries((d as Publicacion).fotos.map(f => [f.id, f.url])) })) }
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
  const urlDe = (id: string) => urls[id] ?? ''
  const fotosOriginales = new Set([...p.fotos.map(f => f.id), ...p.variantes.flatMap(v => v.fotos)])
  const esNueva = (id: string) => !fotosOriginales.has(id)
  const fotosDe = (vid: number | null) => vid == null ? b.fotos : b.variantes[vid]?.fotos ?? []
  const ponerFotos = (vid: number | null, f: (a: string[]) => string[]) => set(x => vid == null
    ? { ...x, fotos: f(x.fotos) }
    : { ...x, variantes: { ...x.variantes, [vid]: { ...x.variantes[vid], fotos: f(x.variantes[vid].fotos) } } })
  const maxDe = (vid: number | null) => vid == null ? p.limites.fotos : p.limites.fotosVariante
  const abrirSubir = (vid: number | null) => { setDestino(vid); setErrorFoto(null); archivo.current?.click() }
  const subir = async (files: FileList | null) => {
    if (!files?.length) return
    const vid = destino
    setErrorFoto(null)
    const lugar = Math.max(0, maxDe(vid) - fotosDe(vid).length)
    if (files.length > lugar) setErrorFoto(`Solo caben ${lugar} foto${lugar === 1 ? '' : 's'} más (máximo ${maxDe(vid)})`)
    for (const f of [...files].slice(0, lugar)) {
      setSubiendo(n => n + 1)
      try {
        const fd = new FormData(); fd.append('foto', f)
        const r = await fetch(`/api/publicaciones/${itemId}/foto`, { method: 'POST', body: fd })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) setErrorFoto(d.error ?? 'No se pudo subir la foto')
        else { setUrls(u => ({ ...u, [d.id]: d.url })); ponerFotos(vid, a => sinRepetir([...a, d.id])) }
      } finally { setSubiendo(n => n - 1) }
    }
    if (archivo.current) archivo.current.value = ''
  }
  // Fotos de la publicación que hoy tiene alguna variante (para «De otra variante»).
  const todasLasFotos = sinRepetir([...p.fotos.map(f => f.id), ...p.variantes.flatMap(v => b.variantes[v.id]?.fotos ?? [])])
  const poolAhora = p.variantes.length ? sinRepetir(p.variantes.flatMap(v => b.variantes[v.id]?.fotos ?? [])) : b.fotos

  // Descripción
  const plantillasCuenta = p.plantillas.filter(x => x.conexion_id == null || x.conexion_id === p.cuenta.id)
  const encabezados = plantillasCuenta.filter(x => x.tipo === 'encabezado'), pies = plantillasCuenta.filter(x => x.tipo === 'pie'), condiciones = plantillasCuenta.filter(x => x.tipo === 'condiciones')
  const enc = p.plantillas.find(x => x.id === b.encId), pie = p.plantillas.find(x => x.id === b.pieId), cond = p.plantillas.find(x => x.id === b.condId)
  const textoML = textoFinal(p, b)
  const malosCuerpo = caracteresNoPermitidos(b.cuerpo)
  const malosPlantilla = caracteresNoPermitidos((enc?.texto ?? '') + (cond?.texto ?? '') + (pie?.texto ?? ''))
  const lineasCuerpo = b.cuerpo.replace(/\r\n?/g, '\n').split('\n')
  const alFinal = pasar?.tipo !== 'encabezado'
  const textoPasar = pasar ? (alFinal ? lineasCuerpo.slice(pasar.linea) : lineasCuerpo.slice(0, pasar.linea + 1)).join('\n').trim() : ''
  const guardarPasar = async () => {
    if (!pasar || !textoPasar || !pasar.nombre.trim()) return
    setPasar({ ...pasar, guardando: true, error: null })
    const r = await fetch('/api/publicaciones/textos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: pasar.tipo, nombre: pasar.nombre.trim(), texto: textoPasar, conexion_id: pasar.todas ? null : p.cuenta.id }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setPasar({ ...pasar, guardando: false, error: d.error ?? 'No se pudo guardar' }); return }
    const nueva = { id: d.id as number, tipo: pasar.tipo, nombre: pasar.nombre.trim(), texto: textoPasar, conexion_id: pasar.todas ? null : p.cuenta.id }
    const resto = (alFinal ? lineasCuerpo.slice(0, pasar.linea) : lineasCuerpo.slice(pasar.linea + 1)).join('\n').trim()
    setP({ ...p, plantillas: [...p.plantillas, nueva] })
    set(x => ({ ...x, cuerpo: resto, ...(pasar.tipo === 'pie' ? { pieId: nueva.id } : pasar.tipo === 'condiciones' ? { condId: nueva.id } : { encId: nueva.id }) }))
    setPasar(null)
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

      <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => subir(e.target.files)} />
      {p.variantes.length > 0 && (
        <Seccion titulo={`Variantes (${p.variantes.length})`}
          ayuda={<>Nombre, stock y fotos de cada variante (hasta {p.limites.fotosVariante} por variante, {p.limites.fotos} distintas entre todas; van {poolAhora.length}). No se crean ni se borran variantes desde aquí.</>}>
          {errorFoto && <p className="text-xs text-red-700">{errorFoto}</p>}
          <div className="space-y-3">
            {p.variantes.map(v => {
              const e = b.variantes[v.id]
              const otras = todasLasFotos.filter(id => !e.fotos.includes(id))
              return (
                <div key={v.id} className="rounded-lg border border-neutral-200 p-3 space-y-2">
                  <div className="flex flex-wrap items-end gap-3">
                    {e.combos.map((c, i) => (
                      <label key={i} className="block text-sm flex-1 min-w-[140px]">
                        <span className="text-xs font-medium text-neutral-600">{c.nombre}</span>
                        <input value={c.valor} maxLength={80} onChange={ev => set(x => ({ ...x, variantes: { ...x.variantes, [v.id]: { ...x.variantes[v.id], combos: x.variantes[v.id].combos.map((y, j) => j === i ? { ...y, valor: ev.target.value } : y) } } }))}
                          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
                      </label>
                    ))}
                    <label className="block text-sm w-28">
                      <span className="text-xs font-medium text-neutral-600">Stock</span>
                      <input inputMode="numeric" value={e.stock} onChange={ev => set(x => ({ ...x, variantes: { ...x.variantes, [v.id]: { ...x.variantes[v.id], stock: ev.target.value.replace(/\D/g, '') } } }))}
                        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm num" />
                    </label>
                    <span className="text-xs text-neutral-500 pb-2">{v.vendidas} vendidas{v.sku ? ` · SKU ${v.sku}` : ''}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`text-xs ${e.fotos.length > p.limites.fotosVariante || !e.fotos.length ? 'text-red-600' : 'text-neutral-500'}`}>Fotos de esta variante: {e.fotos.length}/{p.limites.fotosVariante}</span>
                    <div className="flex gap-2">
                      {otras.length > 0 && <button type="button" onClick={() => setElegir(elegir === v.id ? null : v.id)} className="text-xs px-2 py-1 rounded border border-neutral-300">De otra variante</button>}
                      {e.fotos.length < p.limites.fotosVariante && <button type="button" onClick={() => abrirSubir(v.id)} disabled={subiendo > 0} className="text-xs px-2 py-1 rounded border border-neutral-300 disabled:opacity-50">{subiendo && destino === v.id ? 'Subiendo…' : '+ Subir fotos'}</button>}
                    </div>
                  </div>
                  {elegir === v.id && (
                    <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-2 space-y-1">
                      <p className="text-[11px] text-neutral-500">Toca una foto para agregarla a esta variante.</p>
                      <div className="flex flex-wrap gap-1.5">
                        {otras.map(id => (
                          <button key={id} type="button" disabled={e.fotos.length >= p.limites.fotosVariante} onClick={() => ponerFotos(v.id, a => sinRepetir([...a, id]))}
                            className="w-12 h-12 rounded-md border border-neutral-300 overflow-hidden bg-white hover:border-sky-500 disabled:opacity-40">
                            <img src={urlDe(id)} alt="" className="w-full h-full object-contain" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {e.fotos.length > 0
                    ? <FilaFotos chica ids={e.fotos} url={urlDe} nueva={esNueva} onMover={(i, d) => ponerFotos(v.id, a => mover(a, i, d))} onQuitar={id => ponerFotos(v.id, a => a.filter(x => x !== id))} />
                    : <p className="text-xs text-red-600">Sin fotos: sube al menos una.</p>}
                </div>
              )
            })}
          </div>
        </Seccion>
      )}

      {!p.variantes.length && (
        <Seccion titulo={`Fotos (${b.fotos.length}/${p.limites.fotos})`} ayuda="La primera es la portada. Las nuevas se suben a MercadoLibre y quedan en la publicación al guardar."
          derecha={b.fotos.length < p.limites.fotos && (
            <button type="button" onClick={() => abrirSubir(null)} disabled={subiendo > 0} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm disabled:opacity-50">
              {subiendo ? 'Subiendo…' : '+ Agregar fotos'}
            </button>
          )}>
          {errorFoto && <p className="text-xs text-red-700">{errorFoto}</p>}
          <FilaFotos ids={b.fotos} url={urlDe} nueva={esNueva} onMover={(i, d) => ponerFotos(null, a => mover(a, i, d))} onQuitar={id => ponerFotos(null, a => a.filter(x => x !== id))} />
        </Seccion>
      )}

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

      <Seccion titulo="Descripción" ayuda="En 4 partes: encabezado, condiciones de compra y pie son textos guardados que se repiten en muchas publicaciones; la descripción del producto es de esta. A MercadoLibre va todo junto, en ese orden."
        derecha={<button type="button" onClick={() => setVista(true)} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm">Vista previa</button>}>
        <div className="space-y-3">
          <ParteFija titulo="Encabezado" valor={b.encId} opciones={encabezados} texto={enc?.texto}
            onChange={id => set(x => ({ ...x, encId: id }))} />
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-neutral-600">Descripción del producto</span>
              <div className="flex gap-3 text-xs">
                <button type="button" onClick={() => setPasar({ tipo: 'encabezado', linea: 0, nombre: '', todas: false, guardando: false, error: null })} className="px-2.5 py-1 rounded-lg border border-neutral-300 bg-white text-xs text-neutral-700 hover:bg-neutral-100 whitespace-nowrap">Pasar el inicio a encabezado…</button>
                <button type="button" onClick={() => setPasar({ tipo: 'pie', linea: Math.max(0, lineasCuerpo.length - 1), nombre: '', todas: false, guardando: false, error: null })} className="px-2.5 py-1 rounded-lg border border-neutral-300 bg-white text-xs text-neutral-700 hover:bg-neutral-100 whitespace-nowrap">Pasar el final a condiciones o pie…</button>
              </div>
            </div>
            <textarea rows={10} value={b.cuerpo} onChange={e => set(x => ({ ...x, cuerpo: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
          </div>
          <ParteFija titulo="Condiciones de compra" valor={b.condId} opciones={condiciones} texto={cond?.texto}
            onChange={id => set(x => ({ ...x, condId: id }))} />
          <ParteFija titulo="Pie" valor={b.pieId} opciones={pies} texto={pie?.texto}
            onChange={id => set(x => ({ ...x, pieId: id }))} />
          {malosCuerpo.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
              <span>MercadoLibre no acepta estos caracteres: <b className="tracking-widest">{malosCuerpo.join(' ')}</b></span>
              <button type="button" onClick={() => set(x => ({ ...x, cuerpo: limpiarTexto(x.cuerpo) }))} className="px-2 py-1 rounded border border-amber-300 bg-white">Quitarlos</button>
            </div>
          )}
          {malosPlantilla.length > 0 && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">El encabezado o el pie tiene caracteres que ML no acepta ({malosPlantilla.join(' ')}): corrígelo en «Textos de descripción».</p>}
          {tieneContacto(textoML) && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">Parece que hay un teléfono, correo o link: MercadoLibre no los permite y puede pausar la publicación.</p>}
          <p className={`text-xs text-right ${textoML.length > MAX_DESCRIPCION ? 'text-red-600' : 'text-neutral-400'}`}>{textoML.length.toLocaleString('es-VE')}/{MAX_DESCRIPCION.toLocaleString('es-VE')} caracteres en total · Permitidos: letras, números y signos básicos (# * - + / . , : ; ( ) ¿? ¡!)</p>
        </div>
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

      {vista && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setVista(false)}>
          <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="font-semibold text-neutral-900">Así se verá en MercadoLibre</h3>
              <button type="button" onClick={() => setVista(false)} className="text-neutral-500 text-sm">Cerrar</button></div>
            <p className="text-xs text-neutral-500">Descripción · {textoML.length.toLocaleString('es-VE')} caracteres</p>
            <div className="rounded-lg border border-neutral-200 p-4 text-[15px] leading-relaxed text-neutral-700 whitespace-pre-wrap break-words">{textoML || <span className="text-neutral-400">Sin descripción</span>}</div>
          </div>
        </div>
      )}

      {pasar && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !pasar.guardando && setPasar(null)}>
          <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-neutral-900">{alFinal ? 'Pasar el final a un texto guardado' : 'Pasar el inicio a un encabezado guardado'}</h3>
            {alFinal && <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-xs font-medium text-neutral-600">Guardarlo como</span>
              {(['condiciones', 'pie'] as const).map(t => <button key={t} type="button" onClick={() => setPasar({ ...pasar, tipo: t })}
                className={`px-2.5 py-1 rounded-lg border text-xs ${pasar.tipo === t ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'}`}>{t === 'pie' ? 'Pie' : 'Condiciones de compra'}</button>)}
            </div>}
            <p className="text-xs text-neutral-500">Toca la línea donde {alFinal ? 'empieza (de ahí hasta el final)' : 'termina el encabezado (desde el principio hasta ahí)'}. Queda guardado para usarlo en otras publicaciones; en ML no cambia nada hasta que guardes.</p>
            <div className="rounded-lg border border-neutral-200 max-h-64 overflow-y-auto text-xs font-mono">
              {lineasCuerpo.map((l, i) => {
                const dentro = alFinal ? i >= pasar.linea : i <= pasar.linea
                return <button key={i} type="button" onClick={() => setPasar({ ...pasar, linea: i })}
                  className={`block w-full text-left px-2 py-0.5 whitespace-pre-wrap break-words ${dentro ? 'bg-sky-50 text-sky-900' : 'text-neutral-500 hover:bg-neutral-50'}`}>{l || ' '}</button>
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Nombre (para reconocerlo)</span>
                <input value={pasar.nombre} maxLength={60} onChange={e => setPasar({ ...pasar, nombre: e.target.value })} placeholder={pasar.tipo === 'pie' ? 'Ej: Ubicación y horario' : pasar.tipo === 'condiciones' ? 'Ej: Condiciones de compra' : 'Ej: Bienvenida'}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" /></label>
              <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Para</span>
                <select value={pasar.todas ? 'todas' : 'esta'} onChange={e => setPasar({ ...pasar, todas: e.target.value === 'todas' })} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-white">
                  <option value="esta">Solo la cuenta {p.cuenta.nickname}</option><option value="todas">Todas las cuentas</option>
                </select></label>
            </div>
            {pasar.error && <p className="text-xs text-red-700">{pasar.error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPasar(null)} disabled={pasar.guardando} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm">Cancelar</button>
              <button type="button" onClick={guardarPasar} disabled={pasar.guardando || !textoPasar || !pasar.nombre.trim()} className="btn-primary text-sm">{pasar.guardando ? 'Guardando…' : 'Guardar texto'}</button>
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
