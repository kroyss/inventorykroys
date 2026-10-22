'use client'
// Ventas → Por confirmar (2026-10-12): las ventas de MercadoLibre que todavía no están registradas
// (lib/porConfirmar.ts). Cada fila dice de un vistazo si se puede confirmar ya (productos, pago,
// mensaje del comprador) y "Confirmar" abre Nueva venta con todo cargado.
// Sin inventario (Pagos ME de los Fundadores, 19-10) es la MISMA lista: sin productos ni "Confirmar"; el pago
// se verifica en la fila (✓ / ✗) y la guía ya está en Despachos. Al activar inventario, gana esos dos pasos.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CargadaConPago, PorConfirmar as Fila } from '@/lib/porConfirmar'
import ComprobarBanco from '@/components/pagosme/ComprobarBanco'
import { borrarMemoria, leerMemoria, recruzarMemoria, type EstadoGuardado } from '@/lib/bancoMemoria'
import LineaBanco from './LineaBanco'
import { BotonGuia } from './VerGuia'
import { BotonComprobante } from './VerComprobante'
import { Monto } from '@/components/pagosme/PagoME'

interface Datos { dias: number; filas: Fila[]; ultimaBusqueda: string | null; pagosME: boolean; sincronizadas_at: string | null
  /** Ya cargadas en borrador cuyo pago trajo Pagos ME (22-10, solo con inventario). */
  cargadas?: CargadaConPago[] }
/** Sin inventario: verificar el pago desde la fila (Pagos ME). */
type Verificar = (pagoId: number, v: 'valido' | 'invalido' | 'pendiente') => Promise<void>

const hora = (s: string | null) => s ? new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit',
}) : '—'

function hace(s: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 60000))
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d === 1 ? '' : 's'}`
}

const usd = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Tono = 'verde' | 'ambar' | 'rojo' | 'azul' | 'gris'
const TONO: Record<Tono, string> = {
  verde: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  ambar: 'bg-amber-50 text-amber-800 ring-amber-200',
  rojo: 'bg-red-50 text-red-800 ring-red-200',
  azul: 'bg-sky-50 text-sky-800 ring-sky-200',
  gris: 'bg-neutral-50 text-neutral-600 ring-neutral-200',
}
const PUNTO: Record<Tono, string> = {
  verde: 'bg-emerald-500', ambar: 'bg-amber-500', rojo: 'bg-red-500', azul: 'bg-sky-500', gris: 'bg-neutral-400',
}

function Etiqueta({ tono, children, title }: { tono: Tono; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONO[tono]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${PUNTO[tono]}`} aria-hidden="true" />
      {children}
    </span>
  )
}

function IconoActualizar({ girando }: { girando: boolean }) {
  return (
    <svg className={`h-4 w-4 ${girando ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </svg>
  )
}

function estadoProductos(f: Fila): { tono: Tono; texto: string; title: string } {
  if (f.productos === 'listo') return { tono: 'verde', texto: 'Productos listos', title: 'Cada publicación está vinculada a un solo producto' }
  if (f.productos === 'elegir') return { tono: 'ambar', texto: 'Elegir producto', title: 'Una publicación está en varios productos: hay que elegir cuál se vendió' }
  return { tono: 'ambar', texto: 'Sin vincular', title: 'Una publicación no está vinculada a ningún producto: hay que buscarlo a mano' }
}

function estadoPago(f: Fila, ultima: string | null): { tono: Tono; texto: string; title?: string } {
  if (f.pago?.verificacion === 'valido') return { tono: 'verde', texto: 'Pago verificado' }
  if (f.pago?.verificacion === 'invalido') return { tono: 'rojo', texto: 'Pago inválido' }
  if (f.pago) return { tono: 'azul', texto: `Pago por verificar${f.pago.monto ? ` · Bs ${usd(f.pago.monto)}` : ''}` }
  if (!ultima || new Date(ultima) < new Date(f.fecha)) return { tono: 'gris', texto: 'Pago sin buscar', title: `La última búsqueda de pagos (${hora(ultima)}) fue antes de la compra` }
  return { tono: 'ambar', texto: 'No ha pagado', title: `Se buscó el ${hora(ultima)} y no apareció: no ha pagado o no subió el comprobante` }
}

const METODO: Record<string, string> = { mobile_payment: 'Pago móvil', transfer: 'Transferencia', zelle: 'Zelle' }

function FilaVenta({ f, d, onConfirmar, onVerificar }: { f: Fila; d: Datos; onConfirmar: (numero: string) => void; onVerificar?: Verificar }) {
  const sinInventario = !!onVerificar
  const [haciendo, setHaciendo] = useState(false)
  const verificar = async (v: 'valido' | 'invalido' | 'pendiente') => {
    if (!onVerificar || !f.pago) return
    setHaciendo(true)
    try { await onVerificar(f.pago.id, v) } finally { setHaciendo(false) }
  }
  const prod = estadoProductos(f)
  const pago = d.pagosME ? estadoPago(f, d.ultimaBusqueda) : null
  const quedan = d.dias - Math.floor((Date.now() - new Date(f.fecha).getTime()) / 86_400_000)
  return (
    <li className="group flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center hover:bg-neutral-50/70">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-semibold text-neutral-900 truncate">{f.comprador ?? f.nick ?? 'Sin nombre'}</span>
          {f.comprador && f.nick && <span className="text-xs text-neutral-400">@{f.nick}</span>}
          <span className="font-mono text-[11px] text-neutral-400">{f.numero}</span>
        </div>
        <div className="text-sm text-neutral-700 space-y-0.5">
          {f.lineas.map((l, k) => (
            <div key={k} className="truncate" title={l.titulo}>
              {/* La variante va antes del título: en títulos largos quedaba cortada al final. */}
              <span className="font-medium">{l.cantidad} ×</span>{' '}
              {l.variante && <span className="mr-1 inline-block rounded-full bg-sky-50 px-1.5 py-px text-[11px] font-medium text-sky-800 ring-1 ring-inset ring-sky-200 align-middle">{l.variante}</span>}
              {l.titulo}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {!sinInventario && <Etiqueta tono={prod.tono} title={prod.title}>{prod.texto}</Etiqueta>}
          {pago && <Etiqueta tono={pago.tono} title={pago.title}>{pago.texto}</Etiqueta>}
          {sinInventario && f.pago && f.pago.verificacion === 'pendiente' && f.pago.monto != null && (
            <Monto p={{ monto_pagado: f.pago.monto, total_orden: f.pago.totalOrden }} />
          )}
          {f.pago?.retiro && <Etiqueta tono="ambar" title="El comprador pasa a buscarlo: no lleva guía ni pasa por Despachos">🏪 Retiro en tienda</Etiqueta>}
          {!f.vencida && quedan <= 2 && <Etiqueta tono="rojo">{quedan <= 0 ? 'Vence hoy' : `Quedan ${quedan} día${quedan === 1 ? '' : 's'}`}</Etiqueta>}
          <span className="text-[11px] text-neutral-400">
            compró {hace(f.fecha)}{f.pago?.at ? ` · pago traído ${hace(f.pago.at)}` : ''} · {f.cuenta}
          </span>
          {f.pago?.guia && <BotonGuia pagoId={f.pago.id} venta={f.numero} />}
          {sinInventario && f.pago?.comprobante && (
            <BotonComprobante pagoId={f.pago.id} venta={f.numero}
              datos={{ monto: f.pago.monto, totalOrden: f.pago.totalOrden, banco: f.pago.banco, referencia: f.pago.referencia, metodo: f.pago.metodo }} />
          )}
        </div>
        {/* Lo que dijo el banco (20-10, "Comprobar con el banco"): para verificar sabiendo qué llegó de verdad. */}
        {f.pago?.bancoRes && f.pago.verificacion !== 'invalido' && <LineaBanco b={f.pago.bancoRes} />}
        {sinInventario && f.pago && (
          <div className="text-[11px] text-neutral-500">
            {[METODO[f.pago.metodo ?? ''] ?? f.pago.metodo, f.pago.banco, f.pago.referencia && `ref. ${f.pago.referencia}`,
              f.pago.guiaNum && `${f.pago.carrier ? f.pago.carrier.toUpperCase() + ' ' : 'guía '}${f.pago.guiaNum}`].filter(Boolean).join(' · ')}
          </div>
        )}
        {f.mensaje && (
          <div className="mt-1 flex items-start gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs text-violet-900 ring-1 ring-inset ring-violet-200">
            <svg className="mt-px h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
            </svg>
            <span className="min-w-0"><b>Escribió después de comprar:</b> <span className="line-clamp-2">{f.mensaje.texto}</span></span>
          </div>
        )}
      </div>
      {sinInventario ? (
        f.pago?.verificacion === 'pendiente' ? (
          <div className="flex gap-2 self-start sm:self-center">
            <button type="button" onClick={() => verificar('valido')} disabled={haciendo} className="btn-primary text-sm whitespace-nowrap">✓ Pago correcto</button>
            <button type="button" onClick={() => verificar('invalido')} disabled={haciendo} className="btn-secondary text-sm whitespace-nowrap text-red-700">✗ Inválido</button>
          </div>
        ) : f.pago?.verificacion === 'valido' ? (
          <div className="flex flex-col items-end gap-1 self-start sm:self-center">
            <a href="/despachos" className="btn-secondary text-sm whitespace-nowrap">Ir a Despachos →</a>
            <button type="button" onClick={() => verificar('pendiente')} disabled={haciendo} className="text-[11px] text-neutral-400 underline hover:text-neutral-700">deshacer</button>
          </div>
        ) : f.pago?.verificacion === 'invalido' ? (
          <button type="button" onClick={() => verificar('pendiente')} disabled={haciendo}
            className="text-xs text-neutral-500 underline self-start sm:self-center">Volver a revisar</button>
        ) : null
      ) : (
        <button type="button" onClick={() => onConfirmar(f.numero)}
          className="btn-primary text-sm whitespace-nowrap self-start sm:self-center">
          {/* "Verificar" (22-10, pedido del dueño): abre la venta para revisarla; recién adentro se confirma y procesa. */}
          Verificar
        </button>
      )}
    </li>
  )
}

function Grupo({ titulo, nota, filas, d, onConfirmar, plegable, onVerificar }: {
  titulo: string; nota: string; filas: Fila[]; d: Datos; onConfirmar: (numero: string) => void; plegable?: boolean; onVerificar?: Verificar
}) {
  const [abierto, setAbierto] = useState(!plegable)
  if (!filas.length) return null
  return (
    <section className="border-b border-neutral-100 last:border-b-0">
      <button type="button" onClick={() => plegable && setAbierto(a => !a)} disabled={!plegable}
        className={`flex w-full items-baseline gap-2 bg-neutral-50 px-4 py-2 text-left ${abierto ? 'border-b border-neutral-100' : ''} ${plegable ? 'hover:bg-neutral-100' : 'cursor-default'}`}>
        {plegable && (
          <svg className={`h-3 w-3 self-center text-neutral-400 transition-transform ${abierto ? 'rotate-90' : ''}`} viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        )}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{titulo}</h3>
        <span className="text-xs font-medium text-neutral-400">{filas.length}</span>
        <span className="hidden sm:inline text-[11px] text-neutral-400">· {nota}</span>
        {plegable && <span className="ml-auto text-[11px] text-neutral-400">{abierto ? 'Ocultar' : 'Ver'}</span>}
      </button>
      {abierto && (
        <ul className="divide-y divide-neutral-100">
          {filas.map(f => <FilaVenta key={f.numero} f={f} d={d} onConfirmar={onConfirmar} onVerificar={onVerificar} />)}
        </ul>
      )}
    </section>
  )
}

// ── Ya cargadas · pago por verificar (22-10-2026) ───────────────────────────
// Ventas que se cargaron a mano antes de que llegara el pago (p. ej. para facturar con retención) y cuyo pago ya trajo
// Pagos ME. "Verificar" (como en las demás filas) abre ESA venta en la pantalla de siempre (Editar venta): ahí se
// revisa el pago, lo que compró en ML, productos y nota, y se procesa con "Actualizar y procesar". Nada se mueve solo.
function FilaCargada({ c, onVerificar }: { c: CargadaConPago; onVerificar: (saleId: number) => void }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center hover:bg-neutral-50/70">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="truncate font-semibold text-neutral-900">{c.cliente ?? 'Sin nombre'}</span>
          <span className="font-mono text-[11px] text-neutral-400">{c.numero}</span>
        </div>
        <div className="space-y-0.5 text-sm text-neutral-700">
          {c.productos.map((p, k) => <div key={k} className="truncate"><span className="font-medium">{p.cantidad} ×</span> {p.nombre}</div>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <Etiqueta tono="ambar" title="Cargada a mano antes de que llegara el pago: sigue en borrador hasta verificar el pago">Borrador · ya cargada</Etiqueta>
          {c.factura && <Etiqueta tono="gris" title="Ya tiene factura emitida">Factura #{c.factura}</Etiqueta>}
          {c.pago.verificacion === 'valido'
            ? <Etiqueta tono="verde">Pago ya verificado · falta procesar</Etiqueta>
            : c.pago.monto != null && <Monto p={{ monto_pagado: c.pago.monto, total_orden: c.pago.totalOrden }} />}
          <span className="text-[11px] text-neutral-400">pago traído {hace(c.pago.at)}</span>
          {c.pago.guia && <BotonGuia pagoId={c.pago.id} venta={c.numero} />}
          {c.pago.comprobante && (
            <BotonComprobante pagoId={c.pago.id} venta={c.numero}
              datos={{ monto: c.pago.monto, totalOrden: c.pago.totalOrden, banco: c.pago.banco, referencia: c.pago.referencia, metodo: c.pago.metodo }} />
          )}
        </div>
        {c.pago.bancoRes && <LineaBanco b={c.pago.bancoRes} />}
      </div>
      <button type="button" onClick={() => onVerificar(c.sale_id)}
        className="btn-primary text-sm whitespace-nowrap self-start sm:self-center">
        Verificar
      </button>
    </li>
  )
}

export default function PorConfirmar({ datos, onRecargar, onConfirmar, onVerificar, onVerificarCargada }: {
  datos: Datos | null
  onRecargar: () => Promise<void>
  onConfirmar: (numero: string) => void
  /** Ya cargadas (22-10): abre la venta existente en Editar venta. */
  onVerificarCargada?: (saleId: number) => void
  /** Sin inventario (Pagos ME de los Fundadores): se verifica el pago en la fila, sin "Confirmar". */
  onVerificar?: Verificar
}) {
  const sinInventario = !!onVerificar
  const [actualizando, setActualizando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revisado, setRevisado] = useState<{ at: string; nuevas: number } | null>(null)
  const [verVencidas, setVerVencidas] = useState(false)
  // Buscador (20-10): nombre, apodo de ML, número de venta, producto o cuenta.
  const [buscar, setBuscar] = useState('')
  // "Traer ME" (2026-10-12; Pagos ME salió del menú de los usuarios): le pide a la PC del vigilante que traiga
  // los pagos y guías del portal. Tarda 1-3 min: se recarga la lista cada 10 s hasta que llega la búsqueda nueva.
  const [pidiendoME, setPidiendoME] = useState<number | null>(null)
  const [avisoME, setAvisoME] = useState<string | null>(null)
  // "Comprobar con el banco" (20-10): cualquier usuario sube los estados de cuenta; el resultado queda en cada venta.
  const [banco, setBanco] = useState(false)
  // Estados de cuenta de hoy en este navegador (22-10, lib/bancoMemoria.ts): cuando llegan pagos nuevos sin lo que
  // dijo el banco, se cruzan solos. `cruzados` = los pagos ya intentados (los que no aparecen no se reintentan en bucle).
  const [memoria, setMemoria] = useState<EstadoGuardado[]>(() => typeof window === 'undefined' ? [] : leerMemoria())
  useEffect(() => {
    const leer = () => setMemoria(leerMemoria())
    window.addEventListener('banco-memoria', leer)
    return () => window.removeEventListener('banco-memoria', leer)
  }, [])
  const cruzados = useRef(new Set<string>())
  useEffect(() => {
    if (!datos?.pagosME || !memoria.length || banco) return
    const sinBanco = [
      ...datos.filas.filter(f => f.pago?.verificacion === 'pendiente' && !f.pago.bancoRes).map(f => f.numero),
      ...(datos.cargadas ?? []).filter(c => !c.pago.bancoRes).map(c => c.numero),
    ].filter(n => !cruzados.current.has(n))
    if (!sinBanco.length) return
    sinBanco.forEach(n => cruzados.current.add(n))
    recruzarMemoria().then(n => { if (n) onRecargar() }).catch(() => {})
  }, [datos, memoria, banco, onRecargar])
  const ultimaME = datos?.ultimaBusqueda ? new Date(datos.ultimaBusqueda).getTime() : 0
  // Buscando = se pidió y todavía no llegó una búsqueda terminada después del pedido.
  const buscandoME = pidiendoME != null && ultimaME < pidiendoME - 5000
  useEffect(() => {
    if (!buscandoME || pidiendoME == null) return
    const t = setInterval(() => {
      if (Date.now() - pidiendoME > 5 * 60_000) {
        setPidiendoME(null)
        setAvisoME('La PC de los pagos no respondió en 5 minutos: revisa que esté encendida (Pagos MercadoEnvíos, en el menú de la cuenta del administrador).')
        return
      }
      onRecargar()
    }, 10_000)
    return () => clearInterval(t)
  }, [buscandoME, pidiendoME, onRecargar])
  useEffect(() => {
    if (pidiendoME == null || buscandoME) return
    setPidiendoME(null)   // terminó (el tiempo agotado ya lo pone en null antes): ahora las ventas de ML
    actualizar()
  }, [pidiendoME, buscandoME])   // eslint-disable-line react-hooks/exhaustive-deps
  const traerME = async () => {
    setAvisoME(null)
    const r = await fetch('/api/pagos-me/traer', { method: 'POST' }).catch(() => null)
    if (r?.ok) setPidiendoME(Date.now())
    else setAvisoME('No se pudo pedir la búsqueda de pagos.')
  }

  const actualizar = async () => {
    setActualizando(true); setError(null)
    try {
      const r = await fetch('/api/sales/por-confirmar', { method: 'POST' })
      const j = await r.json().catch(() => null)
      if (!r.ok || (j && !j.ok)) setError(j?.errores?.join(' · ') || j?.error || 'No se pudo traer de MercadoLibre')
      else setRevisado({ at: new Date().toISOString(), nuevas: Number(j?.nuevas) || 0 })
      await onRecargar()
    } finally { setActualizando(false) }
  }

  if (!datos) return <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-400">Cargando…</div>

  const q = buscar.trim().toLowerCase()
  const coincide = (f: Fila) => !q || [f.numero, f.comprador, f.nick, f.cuenta, ...f.lineas.map(l => `${l.titulo} ${l.variante ?? ''}`)]
    .some(t => (t ?? '').toLowerCase().includes(q))
  const filas = datos.filas.filter(coincide)
  const vigentes = filas.filter(f => !f.vencida)
  const vencidas = filas.filter(f => f.vencida)
  const conPago = vigentes.filter(f => f.pago && f.pago.verificacion !== 'invalido')
  const sinPago = vigentes.filter(f => !conPago.includes(f))
  // Sin inventario: por verificar · listos para despachar (verificados en los últimos 3 días) · sin pago.
  const porVerificar = conPago.filter(f => f.pago!.verificacion === 'pendiente')
  // Ya cargadas con pago por verificar (22-10): también entran en la búsqueda.
  const cargadas = (datos.cargadas ?? []).filter(c => !q || [c.numero, c.cliente, ...c.productos.map(p => p.nombre)].some(t => (t ?? '').toLowerCase().includes(q)))
  const listos = conPago.filter(f => f.pago!.verificacion === 'valido'
    && (!f.pago!.verificadoAt || Date.now() - new Date(f.pago!.verificadoAt).getTime() < 3 * 86_400_000))

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Una línea por botón: qué trae y cuándo fue la última vez. */}
        <div className="space-y-0.5 text-xs text-neutral-500">
          {datos.pagosME && (
            <p>
              <b className="text-neutral-700">Traer ME</b>: pagos y guías de MercadoEnvíos (tarda 1 a 3 min; al terminar trae también las ventas) · {buscandoME
                ? <b className="text-violet-700">buscando…</b>
                : <>última <b className="text-neutral-700">{datos.ultimaBusqueda ? hora(datos.ultimaBusqueda) : '—'}</b></>}
            </p>
          )}
          <p>
            <b className="text-neutral-700">Traer ML</b>: ventas nuevas de MercadoLibre (solas cada hora) · {revisado
              ? <>recién {hora(revisado.at)}: <b className={revisado.nuevas ? 'text-emerald-700' : 'text-neutral-700'}>
                  {revisado.nuevas ? `${revisado.nuevas} ${revisado.nuevas === 1 ? 'nueva' : 'nuevas'}` : 'nada nuevo'}</b></>
              : <>última <b className="text-neutral-700">{datos.sincronizadas_at ? hora(datos.sincronizadas_at) : '—'}</b></>}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {datos.pagosME && (
            <button type="button" onClick={() => setBanco(true)} title="Sube los estados de cuenta y el sistema dice qué pagos llegaron de verdad"
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 shadow-sm hover:border-sky-400 hover:bg-sky-100">
              🏦 Comprobar con el banco
            </button>
          )}
          {datos.pagosME && !sinInventario && (
            <button type="button" onClick={traerME} disabled={buscandoME} title="Trae de MercadoEnvíos los pagos y guías (lo hace la PC de los pagos)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm hover:border-neutral-400 hover:bg-neutral-200 disabled:cursor-wait disabled:text-neutral-400">
              <IconoActualizar girando={buscandoME} />
              {buscandoME ? 'Buscando pagos…' : 'Traer ME'}
            </button>
          )}
          <button type="button" onClick={actualizar} disabled={actualizando} title="Trae de MercadoLibre las ventas nuevas"
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm hover:border-neutral-400 hover:bg-neutral-200 disabled:cursor-wait disabled:text-neutral-400">
            <IconoActualizar girando={actualizando} />
            {actualizando ? 'Trayendo…' : 'Traer ML'}
          </button>
        </div>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}
      {datos.pagosME && memoria.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <span>🏦 En memoria: estado de cuenta de <b>{[...new Set(memoria.map(m => m.estado.banco))].join(', ')}</b>
            {' '}(subido {new Date(memoria.map(m => m.at).sort().at(-1)!).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}).
            Los pagos que vayan llegando se comprueban solos.</span>
          <button type="button" onClick={() => { borrarMemoria(); cruzados.current.clear() }}
            className="ml-auto font-medium text-sky-800 underline hover:text-sky-950">Quitar</button>
        </div>
      )}
      {banco && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-neutral-50 shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b bg-white px-5 py-3">
              <h3 className="font-semibold">🏦 Comprobar con el banco</h3>
              <button onClick={() => { setBanco(false); onRecargar() }} className="btn-ghost !px-2 !py-1" aria-label="Cerrar">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><ComprobarBanco onAprobados={() => { onRecargar() }} /></div>
            <div className="flex justify-end border-t bg-white px-5 py-3">
              <button onClick={() => { setBanco(false); onRecargar() }} className="btn-primary text-sm">Listo, cerrar</button>
            </div>
          </div>
        </div>, document.body)}
      {avisoME && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{avisoME}</div>}
      {datos.filas.length > 0 && (
        <div className="flex items-center gap-2">
          <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre, apodo, número de venta o producto…"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm sm:max-w-md" />
          {q && <span className="shrink-0 text-xs text-neutral-500">{filas.length} de {datos.filas.length}</span>}
        </div>
      )}

      {!sinInventario && onVerificarCargada && cargadas.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
          <div className="flex items-baseline gap-2 border-b border-amber-100 bg-amber-50/70 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">Ya cargadas · pago por verificar</h3>
            <span className="text-xs font-medium text-amber-700">{cargadas.length}</span>
            <span className="hidden text-[11px] text-amber-800/70 sm:inline">· Cargadas antes de que llegara el pago: verifícalo y quedan procesadas</span>
          </div>
          <ul className="divide-y divide-neutral-100">
            {cargadas.map(c => <FilaCargada key={c.sale_id} c={c} onVerificar={onVerificarCargada} />)}
          </ul>
        </section>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        {vigentes.length ? (
          sinInventario ? <>
            <Grupo titulo="Por verificar" nota="Revisa cada pago contra el banco" filas={porVerificar} d={datos} onConfirmar={onConfirmar} onVerificar={onVerificar} />
            {!porVerificar.length && (
              <div className="px-4 py-6 text-center border-b border-neutral-100">
                <p className="text-sm font-medium text-neutral-700">Nada por verificar</p>
                <p className="mt-1 text-xs text-neutral-400">Cuando un cliente pague, su venta aparece aquí después de traer los pagos.</p>
              </div>
            )}
            <Grupo titulo="Listos para despachar" nota="Pago verificado: sus guías están en Despachos" filas={listos} d={datos} onConfirmar={onConfirmar} onVerificar={onVerificar} plegable />
            <Grupo titulo="Sin pago todavía" nota="El cliente no ha pagado, o el pago no se ha traído" filas={sinPago} d={datos} onConfirmar={onConfirmar} onVerificar={onVerificar} plegable />
          </> : datos.pagosME ? <>
            <Grupo titulo="Con pago" nota="Listas para revisar y confirmar" filas={conPago} d={datos} onConfirmar={onConfirmar} />
            {!conPago.length && (
              <div className="px-4 py-6 text-center border-b border-neutral-100">
                <p className="text-sm font-medium text-neutral-700">Nada con pago por confirmar</p>
                <p className="mt-1 text-xs text-neutral-400">Cuando un cliente pague, su venta aparece aquí después de buscar los pagos.</p>
              </div>
            )}
            <Grupo titulo="Sin pago todavía" nota="El cliente no ha pagado, o el pago no se ha buscado" filas={sinPago} d={datos} onConfirmar={onConfirmar} plegable />
          </> : (
            <ul className="divide-y divide-neutral-100">
              {vigentes.map(f => <FilaVenta key={f.numero} f={f} d={datos} onConfirmar={onConfirmar} />)}
            </ul>
          )
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-neutral-700">Todo al día</p>
            <p className="mt-1 text-xs text-neutral-400">No hay ventas de MercadoLibre sin registrar.</p>
          </div>
        )}
      </div>

      {vencidas.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50/60">
          <button type="button" onClick={() => setVerVencidas(v => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
            <span className="text-sm font-medium text-neutral-600">
              Vencidas <span className="text-neutral-400">{vencidas.length}</span>
            </span>
            <span className="text-xs text-neutral-400">
              Más de {datos.dias} días sin registrar: Calificaciones las toma como no concretadas · {verVencidas ? 'Ocultar' : 'Ver'}
            </span>
          </button>
          {verVencidas && (
            <ul className="divide-y divide-neutral-100 border-t border-neutral-200 bg-white">
              {vencidas.map(f => <FilaVenta key={f.numero} f={f} d={datos} onConfirmar={onConfirmar} onVerificar={onVerificar} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** Las que hay que trabajar: con pago (0 = al día). Sin Pagos ME, todas las vigentes. */
export function pendientesPorConfirmar(datos: Datos | null) {
  // + las ya cargadas cuyo pago trajo Pagos ME (22-10): también hay que trabajarlas.
  return (datos?.filas.filter(f => !f.vencida && (!datos.pagosME || (!!f.pago && f.pago.verificacion !== 'invalido'))).length ?? 0)
    + (datos?.cargadas?.length ?? 0)
}

/** Número dentro del botón "Por confirmar" (botón blanco): naranja si hay ventas por confirmar. */
export function NumeroBoton({ n, cargando = false }: { n: number; cargando?: boolean }) {
  return (
    <span className={`ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-semibold num ${
      n > 0 ? 'bg-orange-500 text-white' : 'bg-neutral-100 text-neutral-400'}`}>
      {cargando ? '·' : n}
    </span>
  )
}

/** Carga de la lista (la usan VentasClient y el Inicio para el conteo y la vista). */
export function usePorConfirmar(activo: boolean) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const cargar = useCallback(async () => {
    if (!activo) return
    const r = await fetch('/api/sales/por-confirmar', { cache: 'no-store' }).catch(() => null)
    if (r?.ok) setDatos(await r.json())
  }, [activo])
  useEffect(() => { cargar() }, [cargar])
  return { datos, cargar }
}
