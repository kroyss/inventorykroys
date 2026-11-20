'use client'
// Inventario → «Stock en ML» (26-10, Fase 1; API /api/stock-en-ml, lib/stockConML.ts). Cada producto vinculado con
// TODAS sus publicaciones (cuentas y variantes): lo que muestra ML y lo que debería mostrar. Se marcan varios y
// «Poner en ML lo que hay» (antes «Igualar y reactivar») los deja todos al día de una vez (antes: de a una publicación, cuenta por cuenta).
import { useEffect, useMemo, useState } from 'react'
import Link from '@/components/ui/Link'
import { FotoProducto } from '@/components/ui/FotoProducto'
import { Ventana } from '@/components/ui/Ventana'
import VincularColores from './VincularColores'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import type { DesactivadoPublicado, FilaStockML, PubStockML } from '@/lib/stockConML'
import { AbrirFicha } from '@/components/preguntas/FichaPublicacion'
import { cambioML, grupoDe, motivosDecidir, urgencia, type GrupoStock } from '@/lib/stockGrupos'
import { EncabezadoInfo } from '@/components/ui/Info'
import CrearPack from '@/components/publicaciones/CrearPack'
import { listaCantidades, type TablasEnvio } from '@/lib/mlShipping'
import { useAlActualizar } from '@/lib/useAlActualizar'
import { useEscape } from '@/components/ui/useEscape'
import VincularMLClient from '@/components/productos/VincularMLClient'

// 17-11 (el dueño: «nos llenamos de opciones»): la pantalla se ordena por QUÉ HAY QUE HACER. Cada producto cae en UN
// solo grupo, por prioridad (los números suman lo que falta, sin repetir): Vende de más → Tienes y no vendes → Para
// decidir → Por ajustar. Antes eran 9 pestañas que se pisaban (un producto salía en 3 a la vez).
type Grupo = GrupoStock
type Filtro = Grupo | 'todas'
const ORDEN: Grupo[] = ['vende', 'sinpub', 'ajustar', 'decidir']
/** Al entrar se abre lo más urgente que tenga algo. */
const primero = (filas: FilaStockML[]): Filtro => ORDEN.find(g => filas.some(f => grupoDe(f) === g)) ?? 'ajustar'
const TARJETAS = [
  { k: 'vende', titulo: 'Vende de más', punto: 'bg-red-500', numero: 'text-red-700', marco: 'border-red-300 ring-1 ring-red-200',
    que: 'ML ofrece lo que no tienes: riesgo de reclamo', vacio: 'ML no ofrece de más ✓' },
  { k: 'sinpub', titulo: 'Tienes y no vendes', punto: 'bg-sky-500', numero: 'text-sky-700', marco: 'border-sky-300 ring-1 ring-sky-200',
    que: 'Hay unidades y ML no ofrece ninguna', vacio: 'Lo que tienes está a la venta ✓' },
  { k: 'ajustar', titulo: 'Por ajustar', punto: 'bg-amber-500', numero: 'text-amber-700', marco: 'border-amber-300 ring-1 ring-amber-200',
    que: 'Cantidades distintas a lo sugerido', vacio: 'Igual que en el sistema ✓' },
] as const
interface Res { item_id: string; variante_id: string | null; ok: boolean; error?: string; disponible?: number; estado?: string }

const POR_PAGINA = 40
const clave = (p: { item_id: string; variante_id: string | null }) => `${p.item_id}:${p.variante_id ?? ''}`

const ENVIO: Record<string, { t: string; c: string; title: string }> = {
  ambas:    { t: 'Zoom y Tealca', c: 'bg-emerald-50 text-emerald-800 ring-emerald-200', title: 'Envío gratis por los dos transportistas a este precio' },
  tealca:   { t: 'Solo Tealca', c: 'bg-amber-50 text-amber-800 ring-amber-200', title: 'A este precio el envío gratis es solo por Tealca' },
  destino:  { t: 'Cobro a destino', c: 'bg-red-50 text-red-700 ring-red-200', title: 'A este precio y peso no tiene envío gratis' },
  sin_peso: { t: 'Sin peso', c: 'bg-neutral-100 text-neutral-600 ring-neutral-200', title: 'Falta el peso del producto: no se sabe si tiene envío gratis' },
}

export interface StockMLRespuesta { filas: FilaStockML[]; reserva: number | null; sinVincular: number; puedeCambiar: boolean; puedeReserva: boolean
  desactivados?: DesactivadoPublicado[]; puedeReactivar?: boolean; inventarioAlDia?: boolean
  /** 18-11 «Crear pack» (VE, permiso de editar publicaciones) y las tablas de envío para su cuenta. */
  puedePack?: boolean; tablas?: TablasEnvio
  cola?: { id: number; total: number; que: string } | null }
/** 17-11: más de 10 publicaciones van por la cola de ML (lib/colaML.ts, 60 por minuto, sigue aunque cierres la pantalla). */
const TOPE_DIRECTO = 10
interface Cola { id: number; total: number; que: string; hechos: number; errores: number; lista: string[]; terminado: boolean }

export default function StockMLClient({ buscarInicial = '', conVincular = false, inicial = null }: {
  buscarInicial?: string; conVincular?: boolean
  inicial?: StockMLRespuesta | null   // 12-11: ya vino en el HTML (lib/inicial.ts); no se pide de nuevo al abrir
}) {
  const [filas, setFilas] = useState<FilaStockML[] | null>(inicial?.filas ?? null)
  const [puedeCambiar, setPuedeCambiar] = useState(!!inicial?.puedeCambiar)
  const [error, setError] = useState<string | null>(null)
  // Desde Vincular («ver stock») llega ?buscar=COD-…: se abre en Todos con ese producto.
  // 16-11 «Vende de más» (lib/vendeDeMas.ts): si ML ofrece unidades que no hay, se abre en esa vista.
  const [filtro, setFiltro] = useState<Filtro>(buscarInicial ? 'todas' : primero(inicial?.filas ?? []))
  const [verFiltros, setVerFiltros] = useState(false)
  const [verAjustes, setVerAjustes] = useState(false)
  // «Arreglar N productos» de una tarjeta: primero la lista de lo que cambia (con casillas), recién ahí se aplica.
  const [revisar, setRevisar] = useState<Grupo | null>(null)
  const [cola, setCola] = useState<Cola | null>(inicial?.cola ? { ...inicial.cola, hechos: 0, errores: 0, lista: [], terminado: false } : null)
  const [tocado, setTocado] = useState(!!buscarInicial || !!inicial)
  const [cuenta, setCuenta] = useState('')
  // 16-11 (el dueño): Estado de la publicación en ML, combinable con las pestañas; con él se pausan/activan varias.
  const [estadoML, setEstadoML] = useState<'' | 'active' | 'paused'>('')
  const [motivoLote, setMotivoLote] = useState('')
  const [buscar, setBuscar] = useState(buscarInicial)
  const [ver, setVer] = useState(POR_PAGINA)
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const [trabajando, setTrabajando] = useState<{ hechos: number; total: number } | null>(null)
  const [resultados, setResultados] = useState<Map<string, Res>>(new Map())
  // 18-11: «Actualizar desde ML» pasó a la central de actualización (botón de arriba): al terminar, se relee.
  const [reserva, setReserva] = useState<number | null>(inicial?.reserva ?? null)
  const [puedeReserva, setPuedeReserva] = useState(!!inicial?.puedeReserva)
  // 18-11 «Crear pack»: la publicación (y su producto) para la que se arma el pack.
  const [packDe, setPackDe] = useState<{ f: FilaStockML; p: PubStockML } | null>(null)
  const [pack, setPack] = useState<{ puede: boolean; tablas?: TablasEnvio }>({ puede: !!inicial?.puedePack, tablas: inicial?.tablas })
  const [sinVincular, setSinVincular] = useState(inicial?.sinVincular ?? 0)
  // 17-11: productos desactivados que siguen publicados en ML (faltó pausar o la vinculación está mal).
  const [desactivados, setDesactivados] = useState<DesactivadoPublicado[]>(inicial?.desactivados ?? [])
  const [puedeReactivar, setPuedeReactivar] = useState(!!inicial?.puedeReactivar)
  const [verDesactivados, setVerDesactivados] = useState(false)
  // 17-11: «Dividir por variantes» de una publicación vinculada entera.
  const [dividir, setDividir] = useState<PubStockML | null>(null)
  // 17-11: «Mi inventario está al día» (lib/inventarioAlDia.ts). Apagado: nota para revisar las sugerencias antes de aplicar.
  const [alDia, setAlDia] = useState(inicial?.inventarioAlDia ?? true)
  // 16-11 Historial (seguimiento de lo que se cambia en ML): null = cerrado; con producto = filtrado.
  const [historial, setHistorial] = useState<{ product_id: number | null; nombre: string | null } | null>(null)
  // 19-11 (el dueño: «de lo que más uso»): los vínculos de un producto se ven y corrigen en un panel, sin salir de aquí.
  const [vinculos, setVinculos] = useState<FilaStockML | null>(null)
  const confirmar = useConfirm()

  const cargar = (revisar = false) => fetch(`/api/stock-en-ml${revisar ? '?revisar=1' : ''}`, { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return null }
    setFilas(d.filas); setPuedeCambiar(!!d.puedeCambiar); setReserva(d.reserva ?? null); setPuedeReserva(!!d.puedeReserva); setPack({ puede: !!d.puedePack, tablas: d.tablas }); setSinVincular(d.sinVincular ?? 0); setError(null)
    setDesactivados(d.desactivados ?? []); setPuedeReactivar(!!d.puedeReactivar); setAlDia(d.inventarioAlDia ?? true)
    if (d.cola) setCola(c => (c && c.id === d.cola.id ? c : { ...d.cola, hechos: 0, errores: 0, lista: [], terminado: false }))
    return d.filas as FilaStockML[]
  })
  useAlActualizar(['publicaciones'], () => { cargar() })
  const conInicial = !!inicial
  useEffect(() => {
    (async () => {
      const f = conInicial ? inicial!.filas : await cargar()
      if (!conInicial && f) setFiltro(v => (tocado ? v : primero(f)))
      // 16-11: ya no se relee ML al abrir (hacía la pantalla pesada): el cron lo revisa cada 10 min (lib/vendeDeMas.ts).
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Avance de la cola: cada 4 s; al terminar se recarga la lista.
  const colaId = cola && !cola.terminado ? cola.id : null
  useEffect(() => {
    if (!colaId) return
    let vivo = true
    const t = setInterval(async () => {
      const r = await fetch('/api/stock-en-ml', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'lote', id: colaId }) })
      const d = await r.json().catch(() => null)
      if (!vivo || !r.ok || !d) return
      setCola(c => c && c.id === colaId ? { ...c, hechos: d.hechos, errores: d.errores, lista: d.lista ?? [], terminado: d.terminado } : c)
      if (d.terminado) cargar()
    }, 4000)
    return () => { vivo = false; clearInterval(t) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaId])

  const pedir = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/stock-en-ml', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo'); return null }
    return d
  }

  const cuentas = useMemo(() => [...new Set((filas ?? []).flatMap(f => f.pubs.map(p => p.cuenta)))].sort(), [filas])
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return (filas ?? []).filter(f =>
      (filtro === 'todas' || grupoDe(f) === filtro)
      && (!cuenta || f.pubs.some(p => p.cuenta === cuenta))
      && (!estadoML || f.pubs.some(p => p.estado === estadoML && (!cuenta || p.cuenta === cuenta)))
      && (!q || `${f.code} ${f.name}`.toLowerCase().includes(q) || f.pubs.some(p => `${p.item_id} ${p.titulo ?? ''} ${p.variante ?? ''}`.toLowerCase().includes(q))))
      // 17-11 (el dueño: «no se sabe cuál es la urgencia»): en cada tarjeta, lo más urgente arriba.
      .sort((a, b) => filtro === 'todas' ? 0 : urgencia(b) - urgencia(a))
  }, [filas, filtro, cuenta, buscar, estadoML])

  if (!filas) return <p className="text-sm text-neutral-400">{error ?? 'Cargando productos y publicaciones…'}</p>

  const n: Record<Filtro, number> = { vende: 0, sinpub: 0, decidir: 0, ajustar: 0, todas: filas.length }
  for (const f of filas) { const g = grupoDe(f); if (g) n[g]++ }
  const pendientes = n.vende + n.sinpub + n.decidir + n.ajustar
  // Urgente = tienes 0 y ML lo ofrece (lo mismo que cuenta el numerito del menú).
  const urgentes = filas.filter(f => f.vende === 'sin').length
  const elegir = (k: Filtro) => { setFiltro(k); setTocado(true); setVer(POR_PAGINA) }
  const accionables = (f: FilaStockML) => f.pubs.filter(p => p.objetivo != null && (p.objetivo !== p.ml_disponible || p.reactivar))
  // Las publicaciones (enteras: ML pausa la publicación, no la variante) que se pausan/activan con el Estado elegido.
  // 17-11 (el dueño): sin Estado elegido igual se pueden PAUSAR las activas de lo marcado (antes había que adivinar el filtro).
  const modoEstado = estadoML || 'active'
  const pubsEstado = (f: FilaStockML) => [...new Set(f.pubs.filter(p => p.estado === modoEstado && !p.sin_sincronizar
    && (!cuenta || p.cuenta === cuenta)).map(p => p.item_id))]
  const activables = (f: FilaStockML) => pubsEstado(f).filter(it => f.pubs.some(p => p.item_id === it && (p.ml_disponible ?? 0) > 0))
  const marcables = visibles.slice(0, ver).filter(f => accionables(f).length || pubsEstado(f).length)
  const todosMarcados = marcables.length > 0 && marcables.every(f => marcados.has(f.product_id))

  const marcadasF = filas.filter(f => marcados.has(f.product_id))
  const nIgualar = marcadasF.flatMap(accionables).length
  // Sin repetir: una publicación con variantes puede estar en varios productos (ML la pausa entera).
  const lote = [...new Set(modoEstado === 'active' ? marcadasF.flatMap(pubsEstado) : marcadasF.flatMap(activables))]
  const sinStockLote = estadoML === 'paused' ? new Set(marcadasF.flatMap(pubsEstado)).size - lote.length : 0
  const cambiarEstados = async () => {
    if (!lote.length) return
    const estado = modoEstado === 'active' ? 'paused' : 'active'
    if (lote.length > TOPE_DIRECTO) {
      const d = await pedir({ accion: 'cola_estado', items: lote, estado, motivo: motivoLote || undefined })
      if (d?.lote) { setCola({ ...d.lote, hechos: 0, errores: 0, lista: [], terminado: false }); setMarcados(new Set()); setMotivoLote('') }
      return
    }
    setTrabajando({ hechos: 0, total: lote.length }); setError(null)
    const res = new Map(resultados)
    for (let i = 0; i < lote.length; i += 10) {
      const d = await pedir({ accion: 'estados', items: lote.slice(i, i + 10), estado, motivo: motivoLote || undefined })
      if (!d) break
      for (const x of d.resultados as Res[]) for (const p of filas.flatMap(f => f.pubs).filter(p => p.item_id === x.item_id)) res.set(clave(p), { ...x, variante_id: p.variante_id })
      setResultados(new Map(res))
      setTrabajando({ hechos: Math.min(i + 10, lote.length), total: lote.length })
    }
    setTrabajando(null); setMarcados(new Set()); setMotivoLote('')
    await cargar()
  }

  // 17-11 (el dueño): «Aplicar en ML» de un producto o «Poner en ML lo que hay» con varios marcados.
  const aplicar = async (prods: FilaStockML[], avisar: boolean) => {
    const pubs = prods.flatMap(accionables).map(p => ({ item_id: p.item_id, variante_id: p.variante_id }))
    if (!pubs.length) return
    const demas = prods.filter(f => f.vende)
    if (avisar && demas.length && !await confirmar({ title: `${demas.length} producto${demas.length === 1 ? ' vende' : 's venden'} de más`,
      message: `${demas.slice(0, 5).map(f => `${f.code} ${f.name}: ML ofrece ${f.ofrece}, tienes ${f.disponible}`).join('\n')}${demas.length > 5 ? `\n… y ${demas.length - 5} más` : ''}\n\nSe bajan en ML a lo que hay (lo que muestra «Quedará»).`,
      confirmText: 'Sí, poner lo que hay' })) return
    if (pubs.length > TOPE_DIRECTO) {
      const d = await pedir({ accion: 'cola_stock', pubs })
      if (d?.lote) {
        setCola({ ...d.lote, hechos: 0, errores: 0, lista: [], terminado: false })
        setMarcados(m => { const x = new Set(m); for (const f of prods) x.delete(f.product_id); return x })
      }
      return
    }
    setTrabajando({ hechos: 0, total: pubs.length }); setError(null)
    const res = new Map(resultados)
    for (let i = 0; i < pubs.length; i += 10) {
      const d = await pedir({ accion: 'igualar', pubs: pubs.slice(i, i + 10) })
      if (!d) break
      for (const x of d.resultados as Res[]) res.set(clave(x), x)
      setResultados(new Map(res))
      setTrabajando({ hechos: Math.min(i + 10, pubs.length), total: pubs.length })
    }
    setTrabajando(null); setMarcados(m => { const x = new Set(m); for (const f of prods) x.delete(f.product_id); return x })
    await cargar()
  }
  const igualar = () => aplicar(filas.filter(f => marcados.has(f.product_id)), true)

  const errores = [...resultados.values()].filter(r => !r.ok).length
  const okCount = [...resultados.values()].filter(r => r.ok).length

  return (
    <div className="space-y-4 pb-20">
      {/* 18-11 (el dueño): ⓘ en cada sección. */}
      <EncabezadoInfo info={<><li>Cada producto con todas sus publicaciones: lo que MercadoLibre ofrece contra lo que tienes en inventario.</li><li>Arriba, lo que hay que hacer: <b className="font-medium text-neutral-800">Vende de más</b> (ML ofrece más de lo que tienes: urgente), <b className="font-medium text-neutral-800">Tienes y no vendes</b> y <b className="font-medium text-neutral-800">Por ajustar</b>.</li><li>Poner en ML cambia tus publicaciones; <b className="font-medium text-neutral-800">Corregir stock</b> cambia tu inventario (queda como ajuste).</li><li><b className="font-medium text-neutral-800">🔗 N vínculos</b> en cada producto: ves y corriges sus publicaciones en un panel, sin salir de aquí. <b className="font-medium text-neutral-800">Ver cambios</b> y <b className="font-medium text-neutral-800">Se acabó</b> están en el <b className="font-medium text-neutral-800">⋯</b> del producto; <b className="font-medium text-neutral-800">Pausar</b>, «trae N u.» y «No sincronizar», en el <b className="font-medium text-neutral-800">⋯</b> de cada publicación.</li><li><b className="font-medium text-neutral-800">Vende de más</b>: si alguien compra no vas a poder cumplir; «Arreglar» o «Aplicar en ML» los baja a lo que hay. <b className="font-medium text-neutral-800">Tienes y no vendes</b>: «Arreglar» pone stock y reactiva las pausadas por falta de stock (las pausadas a mano no). <b className="font-medium text-neutral-800">Por ajustar</b>: no es urgente; te muestra la lista antes. <b className="font-medium text-neutral-800">Para decidir</b>: el sistema no lo resuelve solo y cada producto dice por qué.</li><li>En el celular cada producto sale resumido: tócalo para ver sus publicaciones.</li><li>Más de 10 publicaciones a la vez van por la cola: el avance sale abajo a la derecha y queda en <b className="font-medium text-neutral-800">Historial de tareas</b>.</li><li>Publicación por publicación también lo ves en <b className="font-medium text-neutral-800">Mis publicaciones</b>: la etiqueta «Stock distinto» con su botón Igualar.</li><li><b className="font-medium text-neutral-800">«⚠ Desde N u. pierde envío gratis»</b>: comprando esa cantidad el paquete pesa más y no llega al mínimo (revisado hasta 20, con la promo). <b className="font-medium text-neutral-800">Crear pack</b> arma un «Pack xN» con envío gratis. La etiqueta de envío sale solo si avisa algo (Solo Tealca, Cobro a destino).</li></>} title="Stock en MercadoLibre"
        subtitle={<span className="hidden sm:inline">Cada producto con todas sus publicaciones: pon en ML lo que hay y reactiva las pausadas en todas tus cuentas de una vez</span>}
        actions={<>
          <Link href="/inventario" className="btn-secondary text-sm whitespace-nowrap">← Inventario</Link>
          <button type="button" onClick={() => setHistorial({ product_id: null, nombre: null })} className="btn-secondary text-sm whitespace-nowrap"
            title="Quién cambió qué en MercadoLibre: stock, pausas y reactivaciones">Historial</button>
          <button type="button" onClick={() => setVerAjustes(true)} className="btn-secondary text-sm whitespace-nowrap"
            title="Inventario al día, reserva de seguridad y cómo se calcula">⚙ Ajustes</button>
        </>} />

      {desactivados.length > 0 && (
        <button type="button" onClick={() => setVerDesactivados(true)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-left text-sm text-amber-900 hover:bg-amber-100">
          <span><b>{desactivados.length} producto{desactivados.length === 1 ? ' desactivado sigue publicado' : 's desactivados siguen publicados'} en ML</b>
            <span className="block text-xs text-amber-800">El sistema ya no les controla el stock: pausa la publicación o, si el título no es de ese producto, corrige la vinculación.</span></span>
          <span className="shrink-0 text-xs font-semibold underline">Revisar</span>
        </button>
      )}

      {sinVincular > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <b>{sinVincular} publicaci{sinVincular === 1 ? 'ón activa' : 'ones activas'} con stock en ML no {sinVincular === 1 ? 'está vinculada' : 'están vinculadas'}</b>: sus ventas
          no descuentan nada del inventario.{' '}
          {conVincular ? <Link href="/vincular-ml?vista=activas" className="font-medium underline">Vincularlas →</Link> : 'Avísale a quien vincula.'}
        </p>
      )}
      {!alDia && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          Inventario sin marcar «al día»: revisa las sugerencias antes de aplicar (en lote solo «Vende de más»).
          <button type="button" onClick={() => setVerAjustes(true)} className="ml-1 font-medium underline">Ajustes</button>
        </p>
      )}

      {/* 17-11: tres tarjetas = lo que hay que hacer (riesgo, venta perdida, ajuste). En el celular se deslizan. */}
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
        {TARJETAS.map(t => {
          const cant = n[t.k]
          const lote = filas.filter(f => grupoDe(f) === t.k && accionables(f).length > 0)
          const puedeLote = puedeCambiar && lote.length > 0 && (alDia || t.k === 'vende') && !trabajando
          return (
            <div key={t.k} className={`flex min-w-[14.5rem] shrink-0 snap-start flex-col rounded-xl border bg-white shadow-sm sm:min-w-0 ${filtro === t.k ? t.marco : 'border-neutral-200'}`}>
              <button type="button" onClick={() => elegir(t.k)} aria-pressed={filtro === t.k} className="flex-1 px-4 pt-3 text-left">
                <span className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                  <span className={`h-2 w-2 rounded-full ${t.punto}`} aria-hidden />{t.titulo}</span>
                <span className={`mt-1 block text-2xl font-semibold tabular-nums ${cant ? t.numero : 'text-neutral-300'}`}>{cant}
                  {t.k === 'vende' && cant > 0 && <span className={`ml-2 text-sm font-medium ${urgentes ? 'text-red-700' : 'text-neutral-400'}`}>
                    · {urgentes ? `${urgentes} urgente${urgentes === 1 ? '' : 's'}` : 'ninguno urgente'}</span>}</span>
                <span className="block text-xs text-neutral-500">{cant ? t.que : t.vacio}</span>
              </button>
              <div className="flex min-h-[2.25rem] items-center px-4 pb-3 pt-1 text-xs">
                {puedeLote
                  ? <button type="button" onClick={() => setRevisar(t.k)} className="font-semibold text-neutral-900 underline underline-offset-2 hover:text-neutral-600">
                      Arreglar {lote.length === 1 ? '1 producto' : `${lote.length} productos`} →</button>
                  : cant > 0 && puedeCambiar && !alDia && t.k !== 'vende' ? <span className="text-neutral-400">Revisa uno por uno</span> : null}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([['decidir', 'Para decidir'], ['todas', 'Todos']] as const).map(([k, t]) => (
          <button key={k} type="button" onClick={() => elegir(k)} aria-pressed={filtro === k}
            title={k === 'decidir' ? 'Lo que el sistema no resuelve solo: quedan pocas, sin envío gratis al reactivar o posible pack' : 'Todos los productos vinculados'}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs sm:py-1 ${filtro === k ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700'}`}>
            {k === 'decidir' && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-neutral-400 align-middle" aria-hidden />}
            {t} <span className="opacity-60">{n[k]}</span>
          </button>
        ))}
        <button type="button" onClick={() => setVerFiltros(v => !v)} aria-expanded={verFiltros}
          className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs sm:py-1 ${cuenta || estadoML ? 'border-neutral-900 font-medium text-neutral-900' : 'border-neutral-200 bg-white text-neutral-600'}`}>
          Filtros{cuenta || estadoML ? ` · ${(cuenta ? 1 : 0) + (estadoML ? 1 : 0)}` : ''} {verFiltros ? '▴' : '▾'}</button>
        <input type="search" value={buscar} onChange={e => { setBuscar(e.target.value); setVer(POR_PAGINA) }} placeholder="Buscar producto, código o MLV…"
          className="ml-auto w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:w-72 sm:py-1.5 sm:text-sm" />
      </div>
      {verFiltros && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs">
          <select value={estadoML} onChange={e => { setEstadoML(e.target.value as '' | 'active' | 'paused'); setMarcados(new Set()); setVer(POR_PAGINA) }}
            title="Estado de la publicación en MercadoLibre" className={`rounded-lg border bg-white px-2 py-1 ${estadoML ? 'border-neutral-900 font-medium' : 'border-neutral-300'}`}>
            <option value="">Activas y pausadas</option>
            <option value="active">Activas en ML</option>
            <option value="paused">Pausadas en ML</option>
          </select>
          {cuentas.length > 1 && (
            <select value={cuenta} onChange={e => { setCuenta(e.target.value); setVer(POR_PAGINA) }}
              className={`rounded-lg border bg-white px-2 py-1 ${cuenta ? 'border-neutral-900 font-medium' : 'border-neutral-300'}`}>
              <option value="">Todas las cuentas</option>
              {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {(cuenta || estadoML) && <button type="button" onClick={() => { setCuenta(''); setEstadoML(''); setMarcados(new Set()) }} className="text-neutral-600 underline">Quitar filtros</button>}
          <span className="text-neutral-500">Con un estado elegido puedes marcar varios y pausarlos o activarlos juntos.</span>
        </div>
      )}
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {/* 20-11 (el dueño: «pesado»): la explicación de cada tarjeta ya está en la tarjeta y en ⓘ; sin recuadro aparte. */}
      {cola && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${cola.terminado ? (cola.errores ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800') : 'border-sky-200 bg-sky-50 text-sky-900'}`}>
          {cola.terminado
            ? <>✓ Listo: {cola.hechos} de {cola.total} en MercadoLibre{cola.errores ? ` · ${cola.errores} con problema` : ''}</>
            : <>{cola.que}… <b className="tabular-nums">{cola.hechos + cola.errores} de {cola.total}</b>
                <span className="ml-1 text-xs text-sky-800">· va por la cola de MercadoLibre (60 por minuto): sigue aunque cierres la pantalla</span></>}
          {!cola.terminado && <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-sky-100">
            <span className="block h-full bg-sky-500 transition-all" style={{ width: `${Math.round((cola.hechos + cola.errores) * 100 / Math.max(1, cola.total))}%` }} /></span>}
          {cola.lista.length > 0 && <ul className="mt-1 text-xs">{cola.lista.map(x => <li key={x}>{x}</li>)}</ul>}
          {cola.terminado && <button type="button" className="ml-3 underline" onClick={() => setCola(null)}>Ocultar</button>}
        </div>
      )}
      {/* 20-11: un solo aviso de resultado (si hay cola, manda la cola). */}
      {resultados.size > 0 && !trabajando && !cola && (
        <div className={`rounded border px-3 py-2 text-sm ${errores ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          ✓ {okCount} publicación{okCount === 1 ? '' : 'es'} al día{errores ? ` · ${errores} con problema (mira el detalle en rojo)` : ''}
          <button className="ml-3 underline" onClick={() => setResultados(new Map())}>Ocultar</button>
        </div>
      )}

      {filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">
          No hay productos vinculados a publicaciones de MercadoLibre. Vincúlalos en <Link href="/vincular-ml" className="underline">Vincular con ML</Link>.
        </p>
      ) : visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">
          {filtro === 'todas' || buscar || cuenta || estadoML ? 'Nada con esa búsqueda o filtro.'
            : pendientes === 0 ? '✓ Todo al día: lo que muestra MercadoLibre coincide con tu inventario.'
            : 'Nada aquí ✓ Mira las otras tarjetas.'}
        </p>
      ) : (
        <div className="space-y-3">
          {puedeCambiar && marcables.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input type="checkbox" checked={todosMarcados} onChange={() => setMarcados(todosMarcados ? new Set() : new Set(marcables.map(f => f.product_id)))} />
              Marcar los {marcables.length} de esta vista
            </label>
          )}
          {visibles.slice(0, ver).map(f => (
            <Producto key={f.product_id} f={f} puedeCambiar={puedeCambiar} marcable={accionables(f).length > 0 || pubsEstado(f).length > 0}
              resaltar={estadoML || null} cuenta={cuenta}
              aplicables={accionables(f).length} ocupado={!!trabajando} onAplicar={() => aplicar([f], false)}
              onDividir={conVincular ? p => setDividir(p) : undefined}
              marcado={marcados.has(f.product_id)} resultados={resultados} verCombos={filtro === 'decidir'}
              etiquetas={filtro === 'decidir' || filtro === 'todas' ? motivosDecidir(f) : []}
              onMarcar={() => setMarcados(m => { const x = new Set(m); if (x.has(f.product_id)) x.delete(f.product_id); else x.add(f.product_id); return x })}
              onUnidades={async (p, u) => { if (await pedir({ accion: 'unidades', codigo_id: p.codigo_id, unidades: u })) await cargar() }}
              onSincronizar={async (p, v) => { if (await pedir({ accion: 'sincronizar', codigo_id: p.codigo_id, sin_sincronizar: v })) await cargar() }}
              onCorregir={async cantidad => {
                // El mismo ajuste de Inventario (movimiento ADJUST con el delta); después se recalcula el reparto.
                const r = await fetch(`/api/inventory/${f.product_id}/adjust`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ movement_type: 'ADJUST', quantity: cantidad, notes: 'corregido desde Stock en ML' }) })
                const d = await r.json().catch(() => ({}))
                if (!r.ok) { setError(d.error ?? 'No se pudo corregir el stock'); return false }
                await cargar(); return true
              }}
              onAsignar={async asignaciones => {
                const d = await pedir({ accion: 'asignar', product_id: f.product_id, asignaciones })
                if (!d) return false
                setResultados(r => { const x = new Map(r); for (const y of d.resultados as Res[]) x.set(clave(y), y); return x })
                await cargar(); return true
              }}
              onEstado={async (p, estado, motivo) => {
                const d = await pedir({ accion: 'estado', item_id: p.item_id, estado, motivo: motivo || undefined })
                if (!d) return false
                // La pausa es de la publicación entera: el resultado vale para todas sus variantes de esta fila.
                setResultados(r => { const x = new Map(r); for (const q of f.pubs.filter(q => q.item_id === p.item_id)) x.set(clave(q), { ...(d.resultados as Res[])[0], variante_id: q.variante_id }); return x })
                await cargar(); return (d.resultados as Res[])[0]?.ok ?? false
              }}
              onSinFisico={async valor => {
                if (valor && !await confirmar({ title: 'Se acabó', danger: true, confirmText: 'Sí, poner en 0',
                  message: `${f.code} ${f.name}: todas sus publicaciones quedan en 0 en MercadoLibre hasta que entre mercancía o se ajuste el inventario. El inventario no se toca (lo ajusta quien puede).` })) return
                const d = await pedir({ accion: 'sin_fisico', product_id: f.product_id, valor })
                if (!d) return
                setResultados(r => { const x = new Map(r); for (const y of d.resultados as Res[]) x.set(clave(y), y); return x })
                await cargar()
              }}
              onHistorial={() => setHistorial({ product_id: f.product_id, nombre: `${f.code} ${f.name}` })}
              onVinculos={conVincular ? () => setVinculos(f) : undefined}
              onPack={pack.puede ? p => setPackDe({ f, p }) : undefined} />
          ))}
          {visibles.length > ver && (
            <button onClick={() => setVer(v => v + POR_PAGINA)} className="btn-secondary w-full text-sm">Ver {Math.min(POR_PAGINA, visibles.length - ver)} más ({visibles.length - ver} quedan)</button>
          )}
        </div>
      )}

      {vinculos && <PanelVinculos f={vinculos} onCerrar={() => { setVinculos(null); void cargar() }} />}
      {historial && <Historial filtro={historial} onFiltro={setHistorial} onCerrar={() => setHistorial(null)} />}
      {revisar && <RevisarCambios grupo={revisar} prods={filas.filter(f => grupoDe(f) === revisar && accionables(f).length > 0)}
        faltan={n[revisar] - filas.filter(f => grupoDe(f) === revisar && accionables(f).length > 0).length}
        onCerrar={() => setRevisar(null)} onAplicar={async ps => { setRevisar(null); await aplicar(ps, false) }} />}
      {verAjustes && (
        <Ventana titulo="Ajustes de stock" onCerrar={() => setVerAjustes(false)}>
          <div className="space-y-4 text-sm text-neutral-700">
            <section className="space-y-1">
              {puedeReserva ? (
                <label className="flex items-center gap-2 font-medium text-neutral-900">
                  <input type="checkbox" checked={alDia} className="h-4 w-4"
                    onChange={async e => { const v = e.target.checked; setAlDia(v); if (!await pedir({ accion: 'al_dia', valor: v })) setAlDia(!v) }} />
                  Mi inventario está al día
                </label>
              ) : <p className="font-medium text-neutral-900">Inventario {alDia ? 'al día' : 'sin marcar como al día'}</p>}
              <p className="text-xs text-neutral-600">Prendido: puedes arreglar en lote y al poner stock en ML (también en Automatizaciones → Stock) avisa si
                pones más de lo que tienes. Apagado: las tarjetas solo informan y en lote solo se arregla «Vende de más» (bajar es seguro).</p>
            </section>
            <section className="space-y-1">
              <p className="font-medium text-neutral-900">Reserva de seguridad: {reserva ?? '…'} u.
                {puedeReserva && reserva != null && <CambiarReserva valor={reserva} onGuardar={async u => { if (await pedir({ accion: 'reserva', unidades: u })) await cargar() }} />}</p>
              <p className="text-xs text-neutral-600">Quedan sin publicar por producto por si hay un error. Lo demás se reparte en partes iguales entre las
                publicaciones (lo que sobra, a la que más vende). Con {reserva ?? '…'} o menos el producto queda en «Para decidir»: tú eliges a qué
                cuenta va cada unidad.</p>
            </section>
            <section className="space-y-1 border-t border-neutral-100 pt-3 text-xs text-neutral-600">
              <p><b>Disponible</b> = stock del sistema − ventas de MercadoLibre que todavía no se registraron (ML ya las descontó de su publicación).
                Si una publicación <b>trae varias unidades</b> (pack o combo), recibe el disponible ÷ las que trae.</p>
              <p>Una pausada se reactiva si tiene stock, salvo que a su precio y peso quede <b>sin envío gratis</b> (eso va a «Para decidir»).
                Lo marcado <b>No sincronizar</b> (rifas, encargos) no se toca. Las <b>pausadas a mano</b> no se reactivan solas.</p>
            </section>
          </div>
        </Ventana>
      )}
      {/* 20-11: «Vincular por color» (ex Dividir por variantes) en el panel compartido con Automatizaciones → Stock. */}
      {dividir && <VincularColores item={dividir.item_id} conStock={puedeCambiar} onCerrar={() => setDividir(null)}
        onHecho={() => { void cargar() }} />}
      {verDesactivados && <Desactivados lista={desactivados} puedePausar={puedeCambiar} puedeDesvincular={conVincular} puedeReactivar={puedeReactivar}
        onCerrar={() => setVerDesactivados(false)} onCambio={async () => { await cargar() }} />}

      {puedeCambiar && (marcados.size > 0 || trabajando) && (
        <div data-barra-fija className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-neutral-700">
              {trabajando ? `Actualizando MercadoLibre… ${trabajando.hechos} de ${trabajando.total} publicaciones`
                : `${marcados.size} producto${marcados.size === 1 ? '' : 's'}${estadoML || !nIgualar ? '' : ` · ${nIgualar} por actualizar`}`}
              {!trabajando && sinStockLote > 0 && <span className="ml-2 text-xs text-amber-700">· {sinStockLote} sin stock en ML: ponles lo que hay primero</span>}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {!trabajando && <button onClick={() => setMarcados(new Set())} className="btn-ghost text-sm">Cancelar</button>}
              {modoEstado === 'active' && lote.length > 0 && !trabajando && (
                <input value={motivoLote} onChange={e => setMotivoLote(e.target.value)} maxLength={200} placeholder="Motivo (opcional)"
                  className="w-40 rounded-lg border border-neutral-300 px-2 py-1.5 text-base sm:text-sm" />
              )}
              {(estadoML || lote.length > 0) && (
                <button onClick={cambiarEstados} disabled={!!trabajando || !lote.length} className={`${estadoML || !nIgualar ? 'btn-primary' : 'btn-secondary'} text-sm disabled:opacity-50`}>
                  {trabajando ? 'Trabajando…' : `${modoEstado === 'active' ? 'Pausar' : 'Activar'} ${lote.length} publicaci${lote.length === 1 ? 'ón' : 'ones'}`}
                </button>
              )}
              {nIgualar > 0 && (
                <button onClick={igualar} disabled={!!trabajando} className={`${estadoML ? 'btn-secondary' : 'btn-primary'} text-sm disabled:opacity-50`}>
                  {trabajando && !estadoML ? 'Trabajando…' : 'Poner en ML lo que hay'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {packDe && packDe.f.peso != null && packDe.p.envio_cantidad && (
        <CrearPack item={packDe.p.item_id} varianteId={packDe.p.variante_id} titulo={packDe.p.titulo} peso={packDe.f.peso}
          precio={packDe.p.envio_cantidad.precio} pierde={packDe.p.envio_cantidad.pierde} disponible={packDe.f.publicable}
          tablas={pack.tablas} onCerrar={() => setPackDe(null)} onCreado={() => { void cargar() }} />
      )}
    </div>
  )
}

/** 19-11: botón chico de acción (fila de cada producto y de cada publicación), todos del mismo tamaño. */
const CHIP = 'inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50'
const nVinculos = (f: FilaStockML) => {
  const n = new Set(f.pubs.map(p => `${p.cuenta}|${p.item_id}`)).size
  return n === 0 ? 'Sin vincular' : `${n} vínculo${n === 1 ? '' : 's'}`
}
function IconoCadena() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9" /><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9" />
    </svg>
  )
}

/** 19-11 (el dueño): Vincular de ESTE producto en un panel lateral (en el celular, pantalla completa). Al cerrar, la
 *  pantalla de Stock se relee con los vínculos nuevos, sin perder el filtro ni dónde estabas. */
function PanelVinculos({ f, onCerrar }: { f: FilaStockML; onCerrar: () => void }) {
  useEscape(true, onCerrar)
  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = antes }
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={`Vínculos de ${f.code}`}
      onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="flex h-full w-full flex-col bg-neutral-50 shadow-2xl sm:max-w-3xl">
        <div className="flex items-start gap-3 border-b border-neutral-200 bg-white px-4 py-3">
          <FotoProducto id={f.product_id} nombre={f.name} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Vínculos con MercadoLibre</p>
            <p className="truncate font-medium text-neutral-900"><span className="font-mono text-xs text-neutral-400">{f.code}</span> {f.name}</p>
            <p className="text-xs text-neutral-500">Vincula, desvincula o cambia «trae N u.». Para unir otra publicación a este producto, búscala abajo.</p>
          </div>
          <button type="button" onClick={onCerrar} className="btn-primary shrink-0 text-sm">Listo</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <VincularMLClient conCuentas buscarInicial={f.code} vistaInicial="todas" enPanel />
        </div>
      </div>
    </div>
  )
}

function CambiarReserva({ valor, onGuardar }: { valor: number; onGuardar: (u: number) => void }) {
  const [v, setV] = useState(String(valor))
  useEffect(() => setV(String(valor)), [valor])
  const n = Math.round(Number(v))
  return (
    <span className="ml-2 inline-flex items-center gap-1">
      · Reserva:
      <input type="number" min={0} max={100} value={v} onChange={e => setV(e.target.value)}
        className="w-12 rounded border border-neutral-300 px-1 py-0.5 text-right tabular-nums" />
      u.
      {n !== valor && n >= 0 && n <= 100 && <button type="button" onClick={() => onGuardar(n)} className="font-medium text-lime-700 underline">Guardar</button>}
    </span>
  )
}

function Producto({ f, puedeCambiar, marcable, marcado, resultados, verCombos, etiquetas, resaltar, cuenta, aplicables, ocupado, onAplicar, onDividir, onMarcar, onUnidades, onSincronizar, onAsignar, onCorregir, onEstado, onSinFisico, onHistorial, onVinculos, onPack }: {
  /** 18-11 «Crear pack» desde el aviso de envío gratis por cantidad. */
  onPack?: (p: PubStockML) => void
  f: FilaStockML; puedeCambiar: boolean; marcable: boolean; marcado: boolean; resultados: Map<string, Res>; verCombos: boolean
  /** 17-11: por qué está en «Para decidir». */
  etiquetas: string[]
  /** Con Estado elegido: las publicaciones en otro estado (u otra cuenta) se atenúan. */
  resaltar: 'active' | 'paused' | null; cuenta: string
  /** 17-11: publicaciones de este producto que cambian al aplicar; «Aplicar en ML» las manda sin marcar nada. */
  aplicables: number; ocupado: boolean; onAplicar: () => Promise<void>
  onDividir?: (p: PubStockML) => void
  onMarcar: () => void; onUnidades: (p: PubStockML, u: number) => void; onSincronizar: (p: PubStockML, v: boolean) => void
  onAsignar: (a: { item_id: string; variante_id: string | null; cantidad: number }[]) => Promise<boolean>
  onCorregir: (cantidad: number) => Promise<boolean>
  onEstado: (p: PubStockML, estado: 'paused' | 'active', motivo: string) => Promise<boolean>
  onSinFisico: (valor: boolean) => Promise<void>
  onHistorial: () => void
  /** 19-11: abre el panel de vínculos (solo con permiso de vincular). */
  onVinculos?: () => void
}) {
  const [marcando, setMarcando] = useState(false)
  const [menu, setMenu] = useState(false)
  const conStockML = f.pubs.some(p => !p.sin_sincronizar && !p.entera_con_variantes && (p.ml_disponible ?? 0) > 0)
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null)
  const [guardandoStock, setGuardandoStock] = useState(false)
  const nuevoStock = corrigiendo == null || corrigiendo.trim() === '' ? NaN : Math.round(Number(corrigiendo))
  // En reserva: lo que la persona asigna a cada publicación (arranca con lo que muestra ML).
  const asignables = f.pubs.filter(p => !p.sin_sincronizar && !p.entera_con_variantes && p.estado != null && p.ml_disponible != null)
  const [asig, setAsig] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  // Arranca con la sugerencia del servidor (objetivo) si ML muestra de más; si no, con lo que ya muestra ML.
  const valor = (p: PubStockML) => asig[clave(p)] ?? String(p.objetivo ?? p.ml_disponible ?? 0)
  const num = (p: PubStockML) => Math.max(0, Math.round(Number(valor(p)) || 0))
  const totalAsig = asignables.reduce((s, p) => s + (p.pausa_mano && num(p) === p.ml_disponible ? 0 : num(p) * p.unidades), 0)
  const guardarAMano = async () => {
    setGuardando(true)
    const ok = await onAsignar(asignables.filter(p => num(p) !== p.ml_disponible)
      .map(p => ({ item_id: p.item_id, variante_id: p.variante_id, cantidad: num(p) })))
    setGuardando(false)
    if (ok) { setAsig({}); setEditando(false) }
  }
  // 17-11 (el dueño): a mano en cualquier producto. Pasarse de lo que hay NO se puede (el inventario manda: si hay más,
  // Corregir stock); comerse la reserva o tocar una pausada a mano son solo avisos.
  const pasa = totalAsig - f.disponible
  const pausadasConStock = asignables.filter(p => p.pausa_mano && num(p) > 0 && num(p) !== p.ml_disponible)
  const avisosAMano = (
    <>
      {pasa > 0
        ? <span className="font-semibold text-red-700">Te pasas por {pasa}: tienes {f.disponible} y pondrías {totalAsig}. Si hay más, toca Corregir stock.</span>
        : !f.en_reserva && totalAsig > f.publicable
          ? <span className="text-amber-800">Usas {totalAsig} de {f.disponible} · te comes la reserva ({f.disponible - totalAsig} sin publicar)</span>
          : <span className="text-xs text-neutral-600">Usas {totalAsig} de {f.disponible}{f.disponible - totalAsig > 0 ? ` · ${f.disponible - totalAsig} sin publicar` : ''}</span>}
      {pausadasConStock.length > 0 && <span className="text-xs text-amber-800">{pausadasConStock.map(p => p.cuenta).join(', ')}: pausada a mano, no se vende hasta que la actives</span>}
    </>
  )
  const cambioAsig = asignables.some(p => Number(valor(p)) !== p.ml_disponible)
  // 20-11 (el dueño, A+): en el celular el producto sale RESUMIDO (una línea con sus publicaciones y Aplicar en ML a la
  // vista); al tocar «Ver» se abre. En pantallas grandes siempre abierto (las clases max-sm: no aplican).
  const [abierto, setAbierto] = useState(false)
  const conML = f.pubs.filter(p => p.ml_disponible != null)
  const enML = conML.reduce((s, p) => s + (p.ml_disponible ?? 0), 0)
  const quedara = conML.reduce((s, p) => s + (p.sin_sincronizar || p.objetivo == null ? (p.ml_disponible ?? 0) : p.objetivo), 0)
  const resProd = f.pubs.map(p => resultados.get(clave(p))).filter((x): x is Res => !!x)
  const fallas = resProd.filter(x => !x.ok).length
  useEffect(() => { if (fallas > 0) setAbierto(true) }, [fallas])
  const plegar = abierto ? '' : 'max-sm:hidden'
  return (
    <section className={`rounded-xl border bg-white shadow-sm ${marcado ? 'border-lime-400 ring-1 ring-lime-300' : 'border-neutral-200'}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-100 px-4 py-2.5">
        {puedeCambiar && <input type="checkbox" checked={marcado} disabled={!marcable} onChange={onMarcar}
          title={marcable ? 'Marcar (para hacer varios a la vez)' : 'Nada que cambiar'} className="h-4 w-4" />}
        <FotoProducto id={f.product_id} nombre={f.name} />
        <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-6.5rem)]">
          <div>
            <span className="font-mono text-xs text-neutral-400">{f.code}</span> <span className="font-medium text-neutral-900">{f.name}</span>
            <EtiquetaGrupo f={f} />
            {etiquetas.map(e => <span key={e} className="ml-2 inline-flex items-center whitespace-nowrap rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">{e}</span>)}
          </div>
          {/* 19-11 (el dueño): las acciones del producto como botones iguales en una fila (antes, enlaces sueltos que se
              cortaban). Lo que casi no se usa («Se acabó») va en ⋯. */}
          <div className={`mt-1.5 flex flex-wrap items-center gap-1.5 ${plegar}`}>
            {onVinculos && (
              <button type="button" onClick={onVinculos} className={`${CHIP} ${f.pubs.length ? '' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
                title="Ver y corregir con qué publicaciones está vinculado este producto, sin salir de aquí">
                <IconoCadena />{nVinculos(f)}</button>
            )}
            {puedeCambiar && corrigiendo == null && (
              <button type="button" onClick={() => setCorrigiendo('')} className={CHIP}
                title="Si contaste y el inventario está mal: se guarda como ajuste de inventario">Corregir stock</button>
            )}
            {/* 20-11 (el dueño: «pesado»): un solo ⋯ del producto con lo ocasional: Ver cambios y Se acabó. */}
            <span className="relative">
              <button type="button" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-label="Más acciones del producto" className={CHIP}>⋯</button>
              {menu && <>
                <span className="fixed inset-0 z-10" aria-hidden="true" onClick={() => setMenu(false)} />
                <span className="absolute left-0 top-full z-20 mt-1 block w-64 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
                  <button type="button" className="block w-full rounded-md px-2.5 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-100"
                    onClick={() => { setMenu(false); onHistorial() }}>
                    <b className="block font-medium">Ver cambios</b>
                    <span className="text-neutral-500">Quién cambió el stock o el estado de sus publicaciones en MercadoLibre</span>
                  </button>
                  {puedeCambiar && conStockML && !f.sin_fisico && (
                    <button type="button" disabled={marcando} className="block w-full rounded-md px-2.5 py-2 text-left text-xs text-neutral-700 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                      onClick={async () => { setMenu(false); setMarcando(true); await onSinFisico(true); setMarcando(false) }}>
                      <b className="block font-medium">Se acabó</b>
                      <span className="text-neutral-500">No está en bodega aunque el sistema diga que hay: todas sus publicaciones a 0 en ML</span>
                    </button>
                  )}
                </span>
              </>}
            </span>
            {marcando && <span className="text-xs text-neutral-500">Un momento…</span>}
          </div>
          {f.sin_fisico && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700"
                title="Para MercadoLibre cuenta como 0 hasta que entre mercancía o se ajuste el inventario">
                Sin stock físico · {f.sin_fisico.por ?? 'alguien'}, {new Date(f.sin_fisico.at).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' })}</span>
              {f.stock > 0 && <span className="text-neutral-500">el inventario dice {f.stock}: falta ajustarlo</span>}
              {puedeCambiar && <button type="button" disabled={marcando} className="font-medium text-lime-700 underline disabled:opacity-50"
                onClick={async () => { setMarcando(true); await onSinFisico(false); setMarcando(false) }}>Ya hay</button>}
            </div>
          )}
        </div>
        {/* 19-11: Disponible manda (es lo que se reparte en ML); stock y sin registrar, chicos debajo. El peso solo si falta. */}
        <div className="text-xs text-neutral-500 max-sm:flex-1 sm:text-right">
          {corrigiendo == null ? (
            <>
              <div><span className="mr-1">Disponible</span><b className="text-lg leading-none text-neutral-900 tabular-nums">{f.disponible}</b></div>
              <div className="mt-0.5 tabular-nums" title={f.comprometidas > 0 ? 'Ventas de ML todavía sin registrar: ML ya las descontó' : undefined}>
                stock {f.stock}{f.comprometidas > 0 && <> − {f.comprometidas} sin registrar</>}
                {!f.en_reserva && f.publicable !== f.disponible && <span title="Disponible menos la reserva de seguridad"> · publicable {f.publicable}</span>}
              </div>
              {!f.peso && <div className="mt-0.5 text-amber-700" title="Sin peso no se sabe si tiene envío gratis">⚠ sin peso</div>}
            </>
          ) : (
            <span className="inline-flex items-center gap-1">
              Contaste
              <input type="number" min={0} max={99999} autoFocus value={corrigiendo} placeholder={String(f.stock)} onChange={e => setCorrigiendo(e.target.value)}
                className="w-16 rounded border border-lime-400 px-1 py-0.5 text-right text-sm tabular-nums" />
              <button type="button" disabled={guardandoStock || !(nuevoStock >= 0) || nuevoStock === f.stock} className="btn-primary px-2 py-0.5 text-xs disabled:opacity-50"
                onClick={async () => { setGuardandoStock(true); const ok = await onCorregir(nuevoStock); setGuardandoStock(false); if (ok) setCorrigiendo(null) }}>
                {guardandoStock ? 'Guardando…' : 'Guardar'}</button>
              <button type="button" onClick={() => setCorrigiendo(null)} className="text-neutral-500 underline">cancelar</button>
            </span>
          )}
        </div>
        {puedeCambiar && aplicables > 0 && !editando && (
          <button type="button" disabled={ocupado || aplicando} className="btn-primary px-3 py-1 text-xs disabled:opacity-50"
            title={`Manda a MercadoLibre lo que dice «Quedará» (${aplicables} publicaci${aplicables === 1 ? 'ón' : 'ones'})`}
            onClick={async () => { setAplicando(true); await onAplicar(); setAplicando(false) }}>
            {aplicando ? 'Aplicando…' : 'Aplicar en ML'}</button>
        )}
        {/* Celular: resumen de sus publicaciones + abrir/cerrar. */}
        <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
          className="flex w-full items-center justify-between gap-2 rounded-lg bg-neutral-50 px-2.5 py-1.5 text-left text-xs text-neutral-600 sm:hidden">
          <span className="min-w-0 truncate tabular-nums">
            {f.pubs.length} publicaci{f.pubs.length === 1 ? 'ón' : 'ones'}{conML.length > 0 && <> · ML {enML}{quedara !== enML && <> → <b className="text-lime-700">{quedara}</b></>}</>}
            {resProd.length > 0 && (fallas
              ? <span className="ml-1 font-medium text-red-700">· {fallas} con problema</span>
              : <span className="ml-1 font-medium text-emerald-700">· ✓ listo</span>)}
          </span>
          <span className="shrink-0 font-medium text-neutral-800">{abierto ? 'Ocultar ▴' : 'Ver ▾'}</span>
        </button>
      </div>
      {f.en_reserva && (
        <div className={`${plegar} space-y-2 border-b border-l-4 border-b-neutral-100 border-l-neutral-300 bg-neutral-50 px-4 py-3 text-sm text-neutral-800`}>
          {/* 16-11 (el dueño: «no sé qué hacer ahí»): arranca con una sugerencia válida, dicha en claro, y un botón listo. */}
          <p>
            {f.excede
              ? <><b>Quedan pocas ({f.disponible}): repártelas entre las cuentas.</b>{(() => {
                  const pausadas = asignables.filter(p => p.estado !== 'active').reduce((s, p) => s + (p.ml_disponible ?? 0) * p.unidades, 0)
                  return pausadas > 0 ? <span className="text-neutral-500"> ({pausadas} guardadas en pausadas)</span> : null })()} {puedeCambiar ? (editando ? 'Pon cuántas muestra cada cuenta:' : 'Con «Aplicar en ML» queda así:') : 'Avísale a quien maneja el stock.'}</>
              : <><b>Quedan pocas ({f.disponible}).</b> Con tan pocas el sistema no reparte solo: cada cuenta muestra lo que decidiste.</>}
          </p>
          {puedeCambiar && f.excede && !editando && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {asignables.map(p => {
                const n = Math.max(0, Math.round(Number(valor(p)) || 0))
                return <li key={clave(p)} className="tabular-nums"><b>{p.cuenta}</b>{p.variante ? ` · ${p.variante}` : ''}{' '}
                  <span className="text-neutral-500">{p.ml_disponible}</span> → <b className={n !== p.ml_disponible ? 'text-lime-700' : ''}>{n}</b></li>
              })}
            </ul>
          )}
          {puedeCambiar && (
            <div className="flex flex-wrap items-center gap-3">
              {editando && (
                <button disabled={guardando || !cambioAsig || pasa > 0} className="btn-primary text-sm disabled:opacity-50"
                  onClick={guardarAMano}>{guardando ? 'Guardando en ML…' : 'Guardar en ML'}</button>
              )}
              <button type="button" onClick={() => { setEditando(e => !e); setAsig({}) }} className="text-sm underline">
                {editando ? 'Cancelar' : 'Cambiar a mano'}</button>
              {editando && avisosAMano}
            </div>
          )}
        </div>
      )}
      {editando && !f.en_reserva && puedeCambiar && (
        <div className={`${plegar} flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-l-4 border-b-neutral-100 border-l-sky-300 bg-sky-50/40 px-4 py-2.5 text-sm`}>
          <b className="text-neutral-800">A mano:</b>
          {avisosAMano}
          <span className="ml-auto flex items-center gap-3">
            <button type="button" onClick={() => { setEditando(false); setAsig({}) }} className="text-sm underline">Volver a la sugerencia</button>
            <button type="button" disabled={guardando || !cambioAsig || pasa > 0} className="btn-primary text-sm disabled:opacity-50"
              onClick={guardarAMano}>{guardando ? 'Guardando en ML…' : 'Guardar en ML'}</button>
          </span>
        </div>
      )}
      <ul className={`divide-y divide-neutral-100 ${plegar}`}>
        {f.pubs.map(p => <FilaPub key={p.codigo_id} p={p} res={resultados.get(clave(p))} puedeCambiar={puedeCambiar} reserva={f.en_reserva}
          abrirOpciones={verCombos} onEstado={(e, m) => onEstado(p, e, m)}
          atenuada={(!!resaltar && p.estado !== resaltar) || (!!cuenta && p.cuenta !== cuenta)}
          onUnidades={u => onUnidades(p, u)} onSincronizar={v => onSincronizar(p, v)}
          editar={puedeCambiar && !editando && asignables.includes(p) ? () => setEditando(true) : undefined}
          dividir={onDividir && p.entera_con_variantes && p.variantes_ml?.length ? () => onDividir(p) : undefined}
          pack={onPack && p.unidades === 1 && p.envio_cantidad?.pierde.length ? () => onPack(p) : undefined}
          asignar={editando && puedeCambiar && asignables.includes(p) ? { valor: valor(p), onCambio: v => setAsig(a => ({ ...a, [clave(p)]: v })) } : undefined} />)}
      </ul>
    </section>
  )
}

function FilaPub({ p, res, puedeCambiar, reserva, abrirOpciones, atenuada, onUnidades, onSincronizar, onEstado, asignar, editar, dividir, pack }: {
  /** 18-11: abrir «Crear pack» (comprando varias pierde el envío gratis). */
  pack?: () => void
  p: PubStockML; res?: Res; puedeCambiar: boolean; reserva: boolean; abrirOpciones: boolean; onUnidades: (u: number) => void; onSincronizar: (v: boolean) => void
  onEstado: (estado: 'paused' | 'active', motivo: string) => Promise<boolean>
  atenuada: boolean
  /** Producto en reserva: cuántas va a mostrar esta publicación (lo decide la persona). */
  asignar?: { valor: string; onCambio: (v: string) => void }
  /** 17-11: tocar «Quedará» pasa el producto a «a mano». */
  editar?: () => void
  /** 17-11: vinculada entera con variantes → abrir «Dividir por variantes». */
  dividir?: () => void
}) {
  const [u, setU] = useState(String(p.unidades))
  useEffect(() => setU(String(p.unidades)), [p.unidades])
  // 16-11: «trae N u.», pack/combo y No sincronizar van en «Más opciones» (casi no se usan; en Revisar combos, abiertas).
  const [opciones, setOpciones] = useState(false)
  const verOpciones = opciones || abrirOpciones
  // 16-11 Pausar / Activar (publicación entera). Al pausar se puede dejar el motivo.
  const [pausando, setPausando] = useState<string | null>(null)
  const [cambiandoEstado, setCambiandoEstado] = useState(false)
  const estadoML = async (e: 'paused' | 'active', m = '') => { setCambiandoEstado(true); const ok = await onEstado(e, m); setCambiandoEstado(false); if (ok) setPausando(null) }
  const cambia = p.objetivo != null && (p.objetivo !== p.ml_disponible || p.reactivar)
  // 20-11: la etiqueta de envío solo si avisa algo («Zoom y Tealca» es lo normal; «Sin peso» ya sale en el producto).
  const envio = p.envio && p.envio !== 'ambas' && p.envio !== 'sin_peso' ? ENVIO[p.envio] : null
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 text-sm ${p.sin_sincronizar || atenuada ? 'opacity-50' : ''}`}>
      <div className="min-w-[12rem] flex-1">
        <div className="text-xs text-neutral-500">
          <b className="text-neutral-700">{p.cuenta}</b> · <AbrirFicha item={p.item_id} title="Ver la publicación aquí mismo"
            className="font-mono text-sky-700 underline decoration-dotted underline-offset-2 hover:text-sky-900">{p.item_id}</AbrirFicha>
          {p.variante && <span className="ml-1 rounded-full bg-sky-50 px-1.5 py-px text-[11px] text-sky-800 ring-1 ring-inset ring-sky-200">{p.variante}</span>}
          {p.compartida && <span className="ml-1 rounded-full bg-violet-50 px-1.5 py-px text-[11px] text-violet-800 ring-1 ring-inset ring-violet-200"
            title={`La misma publicación está vinculada a otros productos: ML muestra la suma de todos.${p.compartida.aporte != null ? ` Este aporta ${p.compartida.aporte}.` : ''}`}>
            Compartida con {p.compartida.con.join(', ')}{p.compartida.aporte != null ? ` · aporta ${p.compartida.aporte}` : ''}</span>}
        </div>
        <div className="truncate text-neutral-800" title={p.titulo ?? ''}>{p.titulo ?? <span className="text-neutral-400">No está activa ni pausada en ML (cerrada o finalizada); si la acabas de crear, toca ↻ Actualizar arriba</span>}</div>
      </div>

      {!verOpciones && p.unidades > 1 && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700" title="Pack o combo: cada venta descuenta esta cantidad">trae {p.unidades} u.</span>}

      <div className="w-24 text-xs sm:w-28">
        <div className="text-neutral-400">En ML</div>
        <div className="tabular-nums text-neutral-800">
          {p.ml_disponible ?? '—'} {p.estado === 'paused' ? <span className="text-amber-700">· pausada</span> : p.estado === 'active' ? <span className="text-neutral-400">· activa</span> : null}
        </div>
      </div>
      <div className="w-28 text-xs sm:w-36">
        <div className="text-neutral-400">Quedará</div>
        {asignar ? (
          <label className="flex items-center gap-1 text-neutral-500">poner
            <input type="number" min={0} max={99999} value={asignar.valor} onChange={e => asignar.onCambio(e.target.value)} onFocus={e => e.target.select()}
              className="w-14 rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-right text-sm tabular-nums" />
            {p.unidades > 1 && <span title="Cada una trae varias unidades del producto">×{p.unidades}</span>}
          </label>
        ) : p.sin_sincronizar ? <div className="text-neutral-500">no se toca</div>
          : p.entera_con_variantes ? (
              <div className="space-y-0.5">
                {p.objetivo === 0
                  && <div className={`tabular-nums ${p.ml_disponible ? 'font-semibold text-lime-700' : 'text-neutral-500'}`}>0 en todas las variantes{p.ml_disponible ? '' : ' ✓ igual'}</div>}
                {/* 20-11 (el dueño: «poco protagonismo»): un botón en vez del enlace chico; la explicación al pasar el cursor. */}
                {dividir
                  ? <button type="button" onClick={dividir}
                      title="Vinculada la publicación entera: el sistema no sabe qué color es cada producto (solo la toca sola si todos están en 0). Elige el producto de cada color"
                      className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 ring-1 ring-inset ring-amber-300 hover:bg-amber-100">Vincular por color →</button>
                  : <div className="text-amber-700" title="Vinculada la publicación entera: no se sabe qué color es cada producto">vincular por color</div>}
              </div>
            )
          : p.objetivo == null ? (editar
              ? <button type="button" onClick={editar} title="Poner a mano cuántas muestra" className="text-neutral-400 underline decoration-dotted underline-offset-2 hover:text-neutral-700">{reserva ? 'lo que decidiste' : '—'} ✎</button>
              : <div className="text-neutral-400">{reserva ? 'lo que decidiste' : '—'}</div>)
          : <div className={`tabular-nums ${cambia ? 'font-semibold text-lime-700' : 'text-neutral-500'}`}>
              {editar
                ? <button type="button" onClick={editar} title="Tocar para poner otro número a mano" className="tabular-nums underline decoration-dotted underline-offset-2 hover:text-neutral-900">
                    {p.objetivo}{p.reactivar ? ' · se reactiva' : ''}{!cambia ? ' ✓ igual' : ''} ✎</button>
                : <>{p.objetivo}{p.reactivar ? ' · se reactiva' : ''}{!cambia ? ' ✓ igual' : ''}</>}
              {p.bloqueada_envio && <div className="font-normal text-red-700">pausada: sin envío gratis</div>}
            </div>}
      </div>
      {/* 18-11 (el dueño: un cliente quería 10 bolsas): envío gratis por cantidad, hasta lo que mostrará ML (máx. 20).
          Pierde → aviso + «Crear pack». Sigue gratis y el stock sube → la confianza para subirlo. No cambia lo sugerido. */}
      {p.envio_cantidad && (p.envio_cantidad.pierde.length ? (
        <span className="flex w-full flex-wrap items-center gap-x-2 text-[11px] text-amber-800"
          title={`Comprando ${listaCantidades(p.envio_cantidad.pierde)} u. queda sin envío gratis: ${p.envio_cantidad.kgDesde?.toLocaleString('de-DE')} kg pide $${p.envio_cantidad.minimoDesde} y con ${p.envio_cantidad.pierde[0]} pagaría $${(p.envio_cantidad.precio * p.envio_cantidad.pierde[0]).toLocaleString('de-DE', { maximumFractionDigits: 2 })}${p.envio_cantidad.promo ? ' (precio con la promo)' : ''}`}>
          <span>⚠ Desde {p.envio_cantidad.pierde[0]} u. pierde envío gratis{p.envio_cantidad.promo ? ' (con la promo)' : ''}</span>
          {pack && <button type="button" onClick={pack} className="font-medium text-sky-700 underline hover:text-sky-900">Crear pack</button>}
        </span>
      ) : null)}
      {/* 20-11: Pausar va dentro del ⋯ de la publicación (Activar sigue a la vista: es lo que se busca en una pausada). */}
      {puedeCambiar && verOpciones && p.estado === 'active' && !p.sin_sincronizar && pausando == null && (
        <button type="button" onClick={() => setPausando('')} className={CHIP}
          title="Deja de venderse en MercadoLibre (la publicación entera). «Poner en ML lo que hay» no la reactiva hasta que alguien la active">Pausar</button>
      )}
      {puedeCambiar && p.estado === 'paused' && !p.sin_sincronizar && (
        <button type="button" disabled={cambiandoEstado || !(p.ml_disponible ?? 0)} onClick={() => estadoML('active')}
          title={(p.ml_disponible ?? 0) ? 'Vuelve a venderse en MercadoLibre' : 'No tiene stock en ML: aplica o pon unidades primero'}
          className="rounded-lg border border-lime-300 bg-lime-50 px-2.5 py-1 text-xs font-medium text-lime-800 hover:bg-lime-100 disabled:opacity-40">
          {cambiandoEstado ? 'Activando…' : 'Activar'}</button>
      )}
      {pausando != null && (
        <span className="flex w-full flex-wrap items-center gap-2 text-xs sm:w-auto">
          <input autoFocus value={pausando} onChange={e => setPausando(e.target.value)} maxLength={200} placeholder="Motivo (opcional): dañado, sin foto…"
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-base sm:w-56 sm:flex-none sm:text-xs" />
          <button type="button" disabled={cambiandoEstado} onClick={() => estadoML('paused', pausando)} className="btn-primary px-2.5 py-1 text-xs disabled:opacity-50">
            {cambiandoEstado ? 'Pausando…' : 'Pausar'}</button>
          <button type="button" onClick={() => setPausando(null)} className="text-neutral-500 underline">cancelar</button>
        </span>
      )}
      {p.pausa_mano && (
        <span className="w-full text-[11px] text-amber-800">
          Pausada a mano por {p.pausa_mano.por ?? 'alguien'} · {new Date(p.pausa_mano.at).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' })}
          {p.pausa_mano.motivo ? ` · «${p.pausa_mano.motivo}»` : ''} — no se reactiva sola
        </span>
      )}
      {puedeCambiar && !abrirOpciones && (
        <button type="button" onClick={() => setOpciones(o => !o)} aria-expanded={opciones} className={CHIP}
          aria-label="Más opciones de la publicación" title="Pausar, «trae N u.» (pack o combo) y No sincronizar">
          {opciones ? 'Cerrar ▴' : '⋯'}</button>
      )}
      {verOpciones && (
        <label className="flex items-center gap-1 text-xs text-neutral-500" title="Cuántas unidades del producto trae esta publicación (pack o combo). Lo pones tú; 1 = suelto">
          trae
          <input type="number" min={1} max={100} value={u} disabled={!puedeCambiar} onChange={e => setU(e.target.value)}
            onBlur={() => { const n = Math.round(Number(u)); if (n >= 1 && n <= 100 && n !== p.unidades) onUnidades(n); else setU(String(p.unidades)) }}
            className="w-12 rounded border border-neutral-300 px-1 py-0.5 text-right text-sm tabular-nums" /> u.
        </label>
      )}
      {verOpciones && p.posible_combo && puedeCambiar && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900 ring-1 ring-inset ring-amber-200"
          title="El título parece de un pack o combo. Si trae varias unidades, pon cuántas en «trae»; si no, toca «Es suelta» y no vuelve a aparecer">
          ¿pack o combo?
          <button type="button" onClick={() => onUnidades(1)} className="font-medium underline">Es suelta</button>
        </span>
      )}
      {envio && <span title={envio.title} className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${envio.c}`}>{envio.t}</span>}
      {puedeCambiar && (verOpciones || p.sin_sincronizar) && (
        <label className="flex items-center gap-1 text-[11px] text-neutral-500" title="Rifas, encargos o lo que manejas aparte: esta pantalla no la toca">
          <input type="checkbox" checked={p.sin_sincronizar} onChange={e => onSincronizar(e.target.checked)} /> No sincronizar
        </label>
      )}
      {res && (
        <div className={`w-full text-xs ${res.ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {res.ok ? `✓ Listo: ${res.disponible ?? '?'} u.${res.estado === 'active' ? ', activa' : res.estado === 'paused' ? ', pausada' : ''}` : `✗ ${res.error}`}
        </div>
      )}
    </li>
  )
}

interface Cambio {
  id: string; creado_at: string; item_id: string; variante_id: string | null; antes: number | null; despues: number | null
  estado_antes: string | null; estado_despues: string | null; reactivada: boolean; origen: string | null; error: string | null
  motivo: string | null; usuario: string | null; cuenta: string | null; titulo: string | null; product_id: number | null; code: string | null; name: string | null
}
const ORIGEN: Record<string, string> = {
  stock_ml: 'Puso lo que hay', stock_ml_mano: 'Reparto a mano', se_acabo: 'Se acabó', pausar: 'Pausó', activar: 'Activó',
  stock: 'Automatizaciones → Stock', pausadas: 'Reactivar (Automatizaciones)', reponer: 'Reponer desde Preguntas',
  preguntas: 'Desde Preguntas', mensajes: 'Desde Mensajes', ficha: 'Desde la ficha',
}

/** 16-11 Historial de Stock en ML: quién cambió qué en MercadoLibre (stock, pausas, reactivaciones). */
function Historial({ filtro, onFiltro, onCerrar }: {
  filtro: { product_id: number | null; nombre: string | null }
  onFiltro: (f: { product_id: number | null; nombre: string | null }) => void; onCerrar: () => void
}) {
  const [persona, setPersona] = useState('')
  const [datos, setDatos] = useState<{ filas: Cambio[]; personas: { id: number; nombre: string }[]; todos: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    const q = new URLSearchParams()
    if (filtro.product_id) q.set('product_id', String(filtro.product_id))
    if (persona) q.set('usuario_id', persona)
    fetch(`/api/stock-en-ml/historial?${q}`, { cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!vivo) return
      if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
      setDatos(d); setError(null)
    })
    return () => { vivo = false }
  }, [filtro.product_id, persona])
  const fecha = (f: string) => new Date(f).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' })
  return (
    <Ventana titulo={filtro.nombre ? `Cambios · ${filtro.nombre}` : 'Historial de cambios en MercadoLibre'} onCerrar={onCerrar}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {datos?.todos && datos.personas.length > 0 && (
          <select value={persona} onChange={e => setPersona(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1">
            <option value="">Todas las personas</option>
            {datos.personas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        )}
        {filtro.product_id && <button type="button" onClick={() => onFiltro({ product_id: null, nombre: null })} className="underline">Ver todos los productos</button>}
        {datos && !datos.todos && <span className="text-neutral-500">Ves tus cambios.</span>}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p>
        : !datos ? <p className="text-sm text-neutral-400">Cargando…</p>
        : datos.filas.length === 0 ? <p className="py-6 text-center text-sm text-neutral-500">Todavía no hay cambios registrados.</p>
        : (
          <ul className="divide-y divide-neutral-100 text-sm">
            {datos.filas.map(c => {
              const accion = c.origen === 'pausar' ? 'Pausó' : c.origen === 'activar' ? 'Activó'
                : `${c.antes ?? '?'} → ${c.despues ?? '?'} u.${c.reactivada ? ' · reactivó' : ''}`
              return (
                <li key={c.id} className="py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-neutral-500">
                    <span><b className="text-neutral-700">{c.usuario ?? 'Sistema'}</b> · {ORIGEN[c.origen ?? ''] ?? c.origen ?? '—'}</span>
                    <span className="tabular-nums">{fecha(c.creado_at)}</span>
                  </div>
                  {!filtro.product_id && <div className="truncate text-neutral-800">{c.code ? <><span className="font-mono text-xs text-neutral-400">{c.code}</span> {c.name}</> : c.titulo ?? c.item_id}</div>}
                  <div className="text-xs text-neutral-600">
                    {c.cuenta ?? '—'} · <span className="font-mono">{c.item_id}</span> · <b className={c.error ? 'text-red-700' : 'text-neutral-800'}>{accion}</b>
                    {c.motivo && <span> · «{c.motivo}»</span>}
                  </div>
                  {c.error && <div className="text-xs text-red-700">✗ {c.error}</div>}
                </li>
              )
            })}
          </ul>
        )}
    </Ventana>
  )
}

// ── Desactivados que siguen publicados (17-11, el dueño) ───────────────────────────────────────────────────────────
// Lado a lado el producto y el título de cada publicación: si no coinciden es una vinculación equivocada (Desvincular y
// vincularla al correcto en Vincular con ML). Si coinciden, faltó pausarla. O fue un error y se reactiva el producto.
function Desactivados({ lista, puedePausar, puedeDesvincular, puedeReactivar, onCerrar, onCambio }: {
  lista: DesactivadoPublicado[]; puedePausar: boolean; puedeDesvincular: boolean; puedeReactivar: boolean
  onCerrar: () => void; onCambio: () => Promise<void>
}) {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hechos, setHechos] = useState<Record<string, string>>({})
  const json = async (url: string, method: string, body: unknown) => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error ?? 'No se pudo')
    return d
  }
  // Lo hecho queda marcado en la ventana aunque la lista se recargue (la fila desaparece al recargar).
  const correr = async (claves: string[], fn: () => Promise<string>) => {
    setOcupado(claves[0]); setError(null)
    try { const t = await fn(); setHechos(h => ({ ...h, ...Object.fromEntries(claves.map(c => [c, t])) })); await onCambio() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo') }
    finally { setOcupado(null) }
  }
  const pausar = async (items: string[]) => {
    for (let i = 0; i < items.length; i += 10) {
      const d = await json('/api/stock-en-ml', 'POST', { accion: 'estados', items: items.slice(i, i + 10), estado: 'paused', motivo: 'Producto desactivado' })
      const mal = (d.resultados as Res[]).find(x => !x.ok)
      if (mal) throw new Error(`${mal.item_id}: ${mal.error ?? 'ML no la pausó'}`)
    }
    return 'Pausada'
  }
  const todas = [...new Set(lista.flatMap(p => p.pubs.map(x => x.item_id)))].filter(it => !hechos[it])
  return (
    <Ventana titulo="Desactivados que siguen publicados en ML" onCerrar={onCerrar}>
      <p className="text-xs text-neutral-600">Compara el <b>producto</b> con el <b>título</b> de cada publicación. Si el título no es de ese
        producto, la vinculación está equivocada: <b>Desvincular</b> y vincúlala al correcto en Vincular con ML. Si coincide, <b>Pausar</b>.
        Si lo desactivaste por error, <b>Reactivar producto</b>.</p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {!lista.length && <p className="text-sm text-neutral-500">Listo: ninguno queda publicado.</p>}
      <ul className="space-y-3">
        {lista.map(p => (
          <li key={p.product_id} className="rounded-xl border border-neutral-200">
            <div className="flex items-center gap-2.5 border-b border-neutral-100 px-3 py-2">
              <FotoProducto id={p.product_id} nombre={p.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900" title={p.name}>{p.name}</p>
                <p className="text-xs text-neutral-500"><span className="font-mono">{p.code}</span> · <span className="text-amber-700">desactivado</span></p>
              </div>
              {puedeReactivar && (hechos[`p${p.product_id}`]
                ? <span className="text-xs text-emerald-700">{hechos[`p${p.product_id}`]}</span>
                : <button type="button" disabled={!!ocupado} className="btn-secondary shrink-0 text-xs disabled:opacity-50"
                    onClick={() => correr([`p${p.product_id}`], async () => { await json(`/api/products/${p.product_id}/status`, 'PUT', { action: 'activate' }); return 'Reactivado' })}>
                    {ocupado === `p${p.product_id}` ? '…' : 'Reactivar producto'}
                  </button>)}
            </div>
            <ul className="divide-y divide-neutral-100">
              {p.pubs.map(x => (
                <li key={x.codigo_id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-neutral-500"><b className="text-neutral-700">{x.cuenta}</b> · <AbrirFicha item={x.item_id} title="Ver la publicación aquí mismo"
                      className="font-mono text-sky-700 underline decoration-dotted underline-offset-2 hover:text-sky-900">{x.item_id}</AbrirFicha> · {x.disponible ?? 0} en ML</p>
                    <p className="text-neutral-800">{x.titulo ?? 'Sin título guardado'}</p>
                  </div>
                  {hechos[x.item_id] || hechos[`d${x.codigo_id}`]
                    ? <span className="text-xs text-emerald-700">{hechos[x.item_id] ?? hechos[`d${x.codigo_id}`]}</span>
                    : <div className="flex gap-1.5">
                        {puedePausar && <button type="button" disabled={!!ocupado} className="btn-secondary text-xs disabled:opacity-50"
                          onClick={() => correr([x.item_id], () => pausar([x.item_id]))}>{ocupado === x.item_id ? '…' : 'Pausar'}</button>}
                        {puedeDesvincular && <button type="button" disabled={!!ocupado} className="btn-ghost text-xs disabled:opacity-50"
                          onClick={() => correr([`d${x.codigo_id}`], async () => {
                            await json('/api/vincular-ml', 'POST', { accion: 'desvincular', codigo: x.ml_code, product_id: p.product_id }); return 'Desvinculada'
                          })}>{ocupado === `d${x.codigo_id}` ? '…' : 'Desvincular'}</button>}
                      </div>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {puedePausar && todas.length > 1 && (
        <div className="flex justify-end border-t border-neutral-100 pt-3">
          <button type="button" disabled={!!ocupado} className="btn-primary text-sm disabled:opacity-50"
            onClick={() => correr(todas, () => pausar(todas))}>
            {ocupado === todas[0] ? 'Pausando…' : `Pausar las ${todas.length}`}
          </button>
        </div>
      )}
    </Ventana>
  )
}

// ── «Arreglar N productos» (17-11): nada se cambia en ML sin ver antes la lista ───────────────────────────────────────
function RevisarCambios({ grupo, prods, faltan, onCerrar, onAplicar }: {
  grupo: Grupo; prods: FilaStockML[]; faltan: number; onCerrar: () => void; onAplicar: (p: FilaStockML[]) => Promise<void>
}) {
  const [quitar, setQuitar] = useState<Set<number>>(new Set())
  const t = TARJETAS.find(x => x.k === grupo)
  const cambios = (f: FilaStockML) => f.pubs.filter(p => p.objetivo != null && (p.objetivo !== p.ml_disponible || p.reactivar))
  const elegidos = prods.filter(f => !quitar.has(f.product_id))
  const nPubs = elegidos.reduce((s, f) => s + cambios(f).length, 0)
  const alternar = (id: number) => setQuitar(q => { const x = new Set(q); if (x.has(id)) x.delete(id); else x.add(id); return x })
  return (
    <Ventana titulo={`${t?.titulo ?? 'Arreglar'}: revisa antes de aplicar`} onCerrar={onCerrar}>
      <p className="text-xs text-neutral-600">Esto cambia en MercadoLibre. Desmarca lo que no quieras tocar.
        {faltan > 0 && <> {faltan === 1 ? 'Otro producto necesita' : `Otros ${faltan} productos necesitan`} que elijas a mano: quedan en la lista.</>}</p>
      <ul className="max-h-[55vh] divide-y divide-neutral-100 overflow-y-auto rounded-lg border border-neutral-200">
        {prods.map(f => (
          <li key={f.product_id} className={`px-3 py-2 text-sm ${quitar.has(f.product_id) ? 'opacity-50' : ''}`}>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={!quitar.has(f.product_id)} onChange={() => alternar(f.product_id)} />
              <span className="min-w-0 flex-1">
                <span className="font-mono text-xs text-neutral-400">{f.code}</span> <span className="font-medium text-neutral-900">{f.name}</span>
                <span className="ml-1 whitespace-nowrap text-xs text-neutral-500">· tienes {f.disponible}</span>
                <span className="mt-0.5 block text-xs text-neutral-600">
                  {cambios(f).map(p => (
                    <span key={clave(p)} className="block tabular-nums">{p.cuenta}{p.variante ? ` · ${p.variante}` : ''}:{' '}
                      <span className="text-neutral-400">{p.ml_disponible ?? '—'}</span> → <b className="text-neutral-900">{p.objetivo}</b>
                      {p.reactivar && <span className="ml-1 text-sky-700">· se reactiva</span>}</span>
                  ))}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 pt-3">
        <span className="mr-auto text-xs text-neutral-500">{elegidos.length} producto{elegidos.length === 1 ? '' : 's'} · {nPubs} publicaci{nPubs === 1 ? 'ón' : 'ones'}</span>
        <button type="button" onClick={onCerrar} className="btn-ghost text-sm">Cancelar</button>
        <button type="button" disabled={!nPubs} onClick={() => onAplicar(elegidos)} className="btn-primary text-sm disabled:opacity-50">
          Aplicar {nPubs} cambio{nPubs === 1 ? '' : 's'} en ML</button>
      </div>
    </Ventana>
  )
}

/** 17-11 (el dueño: «unas con etiqueta, otras sin, no se entiende la prioridad»): UNA etiqueta por fila, del color de su
 *  tarjeta y siempre en el mismo lugar, con el motivo en números. Lo demás va en gris (etiquetas de «Para decidir»). */
function EtiquetaGrupo({ f }: { f: FilaStockML }) {
  const g = grupoDe(f)
  if (!g || g === 'decidir') return null
  const c = cambioML(f)
  const [color, texto, title] =
    g === 'vende' ? (f.vende === 'sin'
      ? ['bg-red-50 text-red-700 ring-red-200', `Urgente: tienes 0, ML ofrece ${f.ofrece}`, 'Si alguien compra no vas a poder cumplir']
      : ['bg-orange-50 text-orange-700 ring-orange-200', `ML ofrece ${f.ofrece}, tienes ${f.disponible}`, 'Las publicaciones activas suman más de lo que tienes'])
    : g === 'sinpub' ? ['bg-sky-50 text-sky-700 ring-sky-200', `Tienes ${f.disponible} · ninguna activa${f.pubs.some(p => p.pausa_mano) ? ' (pausada a mano)' : ''}`,
        'Hay unidades y ninguna publicación activa las ofrece en ML']
    : ['bg-amber-50 text-amber-800 ring-amber-200', c.pubs ? `ML ${c.antes} → quedará ${c.despues}` : 'Por ajustar',
        `${c.pubs} publicaci${c.pubs === 1 ? 'ón cambia' : 'ones cambian'} con «Aplicar en ML»`]
  return <span title={title} className={`ml-2 inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${color}`}>{texto}</span>
}
