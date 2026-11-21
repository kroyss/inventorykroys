'use client'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { usePrimera } from '@/lib/primera'
import { PageHeader, EmptyState } from '@/components/ui'
import { EncabezadoInfo } from '@/components/ui/Info'
import Link from '@/components/ui/Link'
import { traidaCompleta } from './EstadoVigilante'
import VigilanteConConexion, { CodigoConexion, DESCARGA_PROGRAMA } from './ConexionME'
import { type PagoME } from '@/lib/pagosMEComun'
import { Monto, VERIF, bs, metodoPago } from './PagoME'
import PorConfirmar, { usePorConfirmar } from '@/components/ventas/PorConfirmar'
import VentasForm from '@/components/ventas/VentasForm'
import type { Country, InventoryItem, Sale } from '@/lib/types'
import { AYUDA_EXTENSION_TRABADA, AYUDA_SIN_SENAL, AYUDA_TRABADA, textoErrorME } from '@/lib/meTraida'

type Filtro = 'pendiente' | 'valido' | 'invalido' | 'todos'
interface Resultado { ok: boolean; cuenta: string | null; vistas: number; nuevas: number; error: string | null; at: string }
interface Datos {
  pagos: PagoME[]
  conteo: Partial<Record<'pendiente' | 'valido' | 'invalido', number>>
  vigilante: {
    clave: boolean
    latidos: { perfil: string; cuenta: string | null; cuenta_portal?: string | null; verificacion?: string | null; visto_at: string; conectado: boolean }[]
    pedido: { id: number; pedido_at: string; vigente: boolean; automatico: boolean; resultados: Record<string, Resultado> } | null
  }
  /** Sin ventas cargadas: las guías van solas a Despachos con las ventas de MercadoLibre. */
  desdeML: boolean
  conInventario?: boolean
  /** Cuentas de ML (VE) y si ya tienen su Chrome trayendo (29-10). */
  cuentasML?: { nickname: string; estado: string; con_navegador: boolean }[]
}


const hora = (s: string | null) => s ? new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}) : '—'
const FILTROS: { k: Filtro; t: string }[] = [
  { k: 'pendiente', t: 'Sin verificar' }, { k: 'valido', t: 'Verificados' },
  { k: 'invalido', t: 'Inválidos' }, { k: 'todos', t: 'Todos' },
]
const ERROR_PERFIL: Record<string, string> = {
  cuenta_no_conectada: 'tiene abierta en Chrome una cuenta de MercadoEnvíos que NO es de ninguna cuenta de MercadoLibre conectada: no se trajo nada. Entra al portal con la cuenta correcta',
  sin_sesion: 'no tiene la sesión de MercadoEnvíos iniciada: en la PC quedó abierta esa ventana; inicia sesión ahí y vuelve a traer',
}

/** `conexion` (18-11): con inventario y Ventas, la lista de pagos por confirmar vive en Ventas → Por confirmar; aquí queda
 *  la conexión (PC, cuentas, programa) y el historial de pagos. Sin inventario, esta pantalla ES la lista. */
export default function PagosMEClient({ isAdmin, inicial = null, conexion = false, registrar = null }: {
  isAdmin: boolean; inicial?: unknown; conexion?: boolean
  /** 21-11: con inventario y permiso de Ventas, «Registrar venta» abre aquí el formulario de Ventas (sin ir a otro espacio). */
  registrar?: { country: Country; procesaDirecto: boolean } | null
}) {
  const [form, setForm] = useState<{ numero: string | null; editing: Sale | null } | null>(null)
  const [productos, setProductos] = useState<InventoryItem[] | null>(null)
  // Los productos del formulario se piden al abrirlo (la lista de pagos no los necesita).
  const abrirForm = async (f: { numero: string | null; editing: Sale | null }) => {
    if (!productos) {
      const rows: InventoryItem[] = await fetch('/api/sales/products', { cache: 'no-store' }).then(r => r.json()).catch(() => [])
      setProductos(Array.isArray(rows) ? rows : [])
    }
    setForm(f)
  }
  const [filtro, setFiltro] = useState<Filtro>('pendiente')
  const [datos, setDatos] = useState<Datos | null>(null)
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ver, setVer] = useState<PagoME | null>(null)
  const [buscar, setBuscar] = useState('')
  const [codigo, setCodigo] = useState<{ codigo: string; vence_at: string } | null>(null)
  // Sin inventario (Fundadores, 19-10): la lista por VENTA, como "Por confirmar"; la tabla queda como Historial.
  const [vista, setVista] = useState<'ventas' | 'historial'>('ventas')
  const pc = usePorConfirmar(!conexion && !!datos?.desdeML)

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/pagos-me?estado=${filtro}`)
    if (r.ok) setDatos(await r.json())
  }, [filtro])
  const primera = usePrimera(inicial as Datos | null)   // 12-11 (rapidez): la primera carga viene en el HTML
  useEffect(() => {
    let vivo = true
    const pre = primera()
    if (pre && filtro === 'pendiente') { setDatos(pre); return }
    fetch(`/api/pagos-me?estado=${filtro}`).then(r => (r.ok ? r.json() : null)).then(d => { if (vivo && d) setDatos(d) }).catch(() => {})
    return () => { vivo = false }
  }, [filtro, primera])

  // Mientras el vigilante trabaja (pedido vigente sin el resultado de todos los perfiles), se refresca solo.
  const pedido = datos?.vigilante.pedido
  // Con despertador (despertador.ps1) Chrome está cerrado: la señal es la de la PC, y los perfiles
  // solo se abren al traer. Sin despertador, cada perfil (Chrome abierto) manda su propia señal.
  const despertador = datos?.vigilante.latidos.find(l => l.perfil === 'DESPERTADOR')
  const perfiles = (datos?.vigilante.latidos ?? []).filter(l => l.perfil !== 'DESPERTADOR')
  const trabajando = !!pedido?.vigente && (despertador
    ? despertador.conectado && perfiles.some(l => !pedido.resultados[l.perfil])
    : perfiles.filter(l => l.conectado).some(l => !pedido.resultados[l.perfil]))
  useEffect(() => {
    if (!trabajando) return
    const t = setInterval(cargar, 8000)
    return () => clearInterval(t)
  }, [trabajando, cargar])

  // Después de "Traer pagos y guías" (23-10): la pantalla se refresca sola hasta que llega el resultado de ESE pedido,
  // aunque al abrirla no hubiera ningún perfil conectado (antes quedaba mostrando la traída vieja y parecía que no trajo).
  const [pedidoEn, setPedidoEn] = useState<number | null>(null)
  const [demo, setDemo] = useState(false)   // cuenta Demo: la traída termina en segundos, se mira cada 1 s
  const recargarVentas = pc.cargar
  const llego = !!pedidoEn && !!pedido && new Date(pedido.pedido_at).getTime() >= pedidoEn - 60_000
    && Object.keys(pedido.resultados).length > 0 && !trabajando
  const esperandoTraida = !!pedidoEn && !llego
  useEffect(() => {
    if (!esperandoTraida || !pedidoEn) return
    const t = setInterval(() => {
      if (Date.now() - pedidoEn > 5 * 60_000) { setPedidoEn(null); return }   // a los 5 min deja de insistir
      cargar(); recargarVentas()
    }, demo ? 1000 : 5000)
    return () => clearInterval(t)
  }, [esperandoTraida, pedidoEn, cargar, recargarVentas, demo])
  // Cuando llega, trae también las ventas nuevas de MercadoLibre (24-10: un solo botón para todo, como «Traer ME» de
  // Por confirmar; antes el pago llegaba y la venta recién a la hora) y recarga la lista de Ventas.
  useEffect(() => {
    if (!llego) return
    fetch('/api/sales/por-confirmar', { method: 'POST' }).catch(() => null).finally(() => { recargarVentas() })
    const t = setTimeout(() => setPedidoEn(null), 0)
    return () => clearTimeout(t)
  }, [llego, recargarVentas])

  const traer = async () => {
    setBusy('traer'); setError(null); setAviso(null)
    const r = await fetch('/api/pagos-me/traer', { method: 'POST' })
    setBusy(null)
    if (!r.ok) { setError('No se pudo pedir'); return }
    const d = await r.json().catch(() => ({}))
    setDemo(!!d.demo)
    if (!d.demo) setAviso('Pedido enviado: el vigilante lo toma en menos de 1 minuto. Esta pantalla se actualiza sola.')
    setPedidoEn(Date.now())
    cargar()
  }

  const marcar = async (verificacion: 'valido' | 'invalido' | 'pendiente', ids = [...marcados]) => {
    if (ids.length === 0) return
    setBusy(verificacion); setError(null); setAviso(null)
    const r = await fetch('/api/pagos-me/verificar', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, verificacion }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    setAviso(verificacion === 'valido'
      ? `${d.marcados} pago(s) verificados${d.ventas_verificadas ? ` · ${d.ventas_verificadas} venta(s) pasaron a Pago verificado` : ''}.`
      : verificacion === 'invalido' ? `${d.marcados} pago(s) marcados inválidos.` : `${d.marcados} pago(s) volvieron a Sin verificar.`)
    setMarcados(new Set())
    cargar()
  }

  const conectar = async () => {
    setError(null)
    const r = await fetch('/api/pagos-me/conexion', { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    if (r.ok) setCodigo(d); else setError(d.error ?? 'Error')
  }
  // Nombre a mostrar de cada perfil: la cuenta de MercadoEnvíos (si ya la dijo) o el nombre técnico.
  const nombre = (perfil: string) => datos?.vigilante.latidos.find(l => l.perfil === perfil)?.cuenta ?? perfil
  // Los pasos se ven hasta que hay al menos un perfil de Chrome conectado (23-10: antes desaparecían apenas se
  // conectaba el programa, y si faltaba el Asistente nadie sabía qué faltaba).
  const sinConectar = !!datos && perfiles.length === 0

  const pagos = datos?.pagos ?? []
  // Buscador del Historial (12-11): cliente, apodo, producto, nº de venta, referencia o monto; palabras en cualquier orden, sin acentos.
  const sinAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const palabras = sinAcento(buscar.trim()).split(/\s+/).filter(Boolean)
  const visibles = !palabras.length ? pagos : pagos.filter(p => {
    const texto = sinAcento([p.comprador, p.nick, p.venta, p.referencia, p.cuenta, p.monto_pagado != null ? String(p.monto_pagado) : '',
      p.monto_pagado != null ? bs(p.monto_pagado) : '', ...(p.detalle ?? []).map(d => `${d.titulo} ${d.variante ?? ''}`)].join(' '))
    return palabras.every(w => texto.includes(w))
  })
  const todos = visibles.length > 0 && visibles.every(p => marcados.has(p.id))
  const toggle = (id: number) => setMarcados(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // Mientras carga no se muestra nada a medias (23-10: sin datos se veía unos segundos la vista con inventario).
  if (!datos) return (
    <div className="space-y-4">
      <PageHeader title="Pagos MercadoEnvíos" subtitle={conexion ? 'Conexión e historial de pagos' : 'Verifica los pagos de MercadoEnvíos contra el banco'} />
      <p className="text-sm text-neutral-400">Cargando…</p>
    </div>
  )

  // La lista por VENTA (como Por confirmar) va en la pestaña Ventas: sin inventario, o con inventario sin acceso a Ventas.
  const conLista = !conexion && !!datos?.desdeML
  // Con inventario la lista trae su propio «Traer pagos y ventas»: arriba no se repite (18-11).
  const botonArriba = !(conLista && datos?.conInventario)
  const B = 'font-medium text-neutral-800'
  return (
    <div className="space-y-4">
      {/* 18-11 (el dueño: «mucho ruido antes de los productos»): ⓘ, una línea de estado y ⚙ Conexión desplegable. */}
      <EncabezadoInfo title="Pagos MercadoEnvíos"
        subtitle={conexion ? 'Conexión de la PC y el historial de pagos' : 'Verifica los pagos de MercadoEnvíos contra el banco'}
        info={<>
          {conexion && <li>Los pagos se verifican en <Link href="/ventas?vista=confirmar" className="underline">Ventas → Por confirmar</Link>; aquí queda la conexión y el <b className={B}>historial de pagos</b>.</li>}
          <li><b className={B}>Traer pagos y guías</b>: la PC abre Chrome y trae de MercadoEnvíos los pagos, las guías y las ventas nuevas (1 a 3 min). También se trae sola durante el día.</li>
          {!conexion && <li>Verifica cada pago contra el banco, uno por uno o con <b className={B}>Comprobar con el banco</b> (subes el estado de cuenta).</li>}
          <li>Las guías de las ventas pagadas pasan solas a <b className={B}>Despachos</b>.</li>
          <li>La línea de arriba dice si la PC está lista y cómo salió la última traída. <b className={B}>⚙ Conexión</b>: agregar cuentas, el programa, la extensión y conectar la PC.</li>
          <li>Si una cuenta no toma la traída, el aviso dice qué hacer: <b className={B}>extensión trabada</b> (recarga la pestaña de MercadoEnvíos con F5 o cierra y abre ese Chrome) o <b className={B}>Chrome sin señal</b> (ábrelo y revisa que el Asistente diga «Conectado»). No uses la pestaña de MercadoEnvíos mientras trae.</li>
        </>}
        actions={<>
          {conexion && <Link href="/ventas?vista=confirmar" className="btn-secondary text-sm whitespace-nowrap">Ir a Por confirmar →</Link>}
          {botonArriba && (
            <button onClick={traer} disabled={busy === 'traer' || trabajando} className="btn-primary text-sm whitespace-nowrap">
              {trabajando ? 'Trayendo…' : 'Traer pagos y guías'}
            </button>
          )}
        </>} />

      {sinConectar && <PrimerosPasos isAdmin={isAdmin} onConectar={conectar} programaListo={!!despertador} />}

      {/* Primeros pasos: el código que pidió «Genera tu código» va justo debajo. */}
      {sinConectar && codigo && <CodigoConexion codigo={codigo.codigo} vence={codigo.vence_at} onCerrar={() => setCodigo(null)} />}

      {datos && <VigilanteConConexion d={datos} isAdmin={isAdmin} desdeML={!!datos.desdeML} onCambio={cargar} abiertoInicial={conexion} />}

      {/* La caja grande de la traída solo cuando hay que mirarla (trayendo, falla, incompleta); si salió bien va en la línea. */}
      {pedido && datos && (despertador || perfiles.length > 0) && !traidaCompleta(datos) && <EstadoTraida pedido={pedido} perfiles={perfiles.map(l => l.perfil)} nombre={nombre} trabajando={trabajando} desdeML={!!datos?.desdeML}
        pcPrendida={!!despertador?.conectado} vivos={perfiles.filter(l => l.conectado).map(l => l.perfil)} />}

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      {aviso && <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">{aviso}</div>}

      {conLista && (
        <div className="flex gap-1 border-b border-neutral-200">
          {([['ventas', 'Ventas'], ['historial', 'Historial de pagos']] as const).map(([k, t]) => (
            <button key={k} onClick={() => setVista(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${vista === k ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>
              {t}
            </button>
          ))}
        </div>
      )}
      {conexion && <h2 className="pt-1 text-sm font-semibold text-neutral-800">Historial de pagos</h2>}
      {conLista && vista === 'ventas' && !datos.conInventario && (
        <PorConfirmar datos={pc.datos} onRecargar={pc.cargar} onConfirmar={() => {}} enPagosME
          onVerificar={async (id, v) => {
            const r = await fetch('/api/pagos-me/verificar', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: [id], verificacion: v }) }).catch(() => null)
            if (!r?.ok) setError('No se pudo guardar la verificación')
            await Promise.all([pc.cargar(), cargar()])
          }} />
      )}
      {/* Con inventario y SIN acceso a Ventas (18-11): la misma lista que Por confirmar, aquí. Con acceso a Ventas, la lista
          vive allá (esta pantalla es la conexión). */}
      {conLista && vista === 'ventas' && datos.conInventario && registrar && <AvisoConInventario />}
      {conLista && vista === 'ventas' && datos.conInventario && (
        <PorConfirmar datos={pc.datos} onRecargar={pc.cargar} enPagosME
          onConfirmar={n => { if (registrar) abrirForm({ numero: n, editing: null }); else window.location.href = `/ventas?vista=confirmar&registrar=${n}` }}
          onVerificarPago={async (id, v) => {
            const r = await fetch('/api/pagos-me/verificar', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: [id], verificacion: v }) }).catch(() => null)
            if (!r?.ok) setError('No se pudo guardar la verificación')
            await Promise.all([pc.cargar(), cargar()])
          }}
          onVerificarCargada={async id => {
            if (!registrar) { window.location.href = '/ventas?vista=confirmar'; return }
            // Ya cargada con pago: la MISMA venta en Editar venta (como en Ventas → Por confirmar).
            const fresh: Sale | null = await fetch(`/api/sales/${id}`).then(r => r.json()).catch(() => null)
            if (fresh?.id) abrirForm({ numero: null, editing: fresh })
          }} />
      )}
      {form && registrar && productos && (
        <VentasForm editing={form.editing} products={productos} country={registrar.country} procesaDirecto={registrar.procesaDirecto}
          numeroInicial={form.editing ? undefined : form.numero ?? undefined}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); pc.cargar(); cargar() }}
          onContinue={() => { setForm(null); pc.cargar(); cargar() }} />
      )}

      {(!conLista || vista === 'historial') && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map(f => (
            <button key={f.k} onClick={() => { setFiltro(f.k); setMarcados(new Set()) }}
              className={`px-3 py-1 rounded-full text-sm border ${filtro === f.k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-700'}`}>
              {f.t}{f.k !== 'todos' && datos?.conteo[f.k] ? <span className="ml-1 opacity-60">{datos.conteo[f.k]}</span> : null}
            </button>
          ))}
        </div>
        {marcados.size > 0 && (
          <div className="flex flex-wrap gap-2">
            {filtro !== 'valido' && (
              <button onClick={() => marcar('valido')} disabled={!!busy} className="btn-primary text-sm">✓ Verificar ({marcados.size})</button>
            )}
            {filtro !== 'invalido' && (
              <button onClick={() => marcar('invalido')} disabled={!!busy} className="btn-secondary text-sm text-red-700">✗ Inválido</button>
            )}
            {filtro !== 'pendiente' && (
              <button onClick={() => marcar('pendiente')} disabled={!!busy} className="btn-secondary text-sm">Volver a sin verificar</button>
            )}
          </div>
        )}
      </div>

      {/* 12-11 (el dueño): Historial compacto. Una línea por pago (foto, cliente, producto, monto, estado) y buscador; el
          detalle completo (pago, banco, referencia, envío, guía, comprobante) se abre en una ventana al tocar la fila. */}
      {pagos.length > 0 && (
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar cliente, producto, nº de venta, referencia o monto…"
          aria-label="Buscar en el historial" className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm sm:max-w-md" />
      )}
      {datos && visibles.length === 0 ? (
        <EmptyState message={buscar.trim() ? 'Nada coincide con la búsqueda' : filtro === 'pendiente'
          ? 'No hay pagos por verificar. Toca "Traer pagos y guías" para buscar los nuevos en MercadoEnvíos.'
          : 'Sin pagos'} />
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">
          <div className="flex items-center gap-3 px-3 py-1.5 text-[11px] text-neutral-500 bg-neutral-50 rounded-t-xl">
            <input type="checkbox" checked={todos} aria-label="Marcar todos"
              onChange={() => setMarcados(todos ? new Set() : new Set(visibles.map(p => p.id)))} />
            <span>{visibles.length} pago{visibles.length === 1 ? '' : 's'} · toca uno para ver el detalle</span>
          </div>
          {visibles.map(p => {
            const v = VERIF[p.verificacion]
            const prod = (p.detalle ?? []).map(d => `${d.cantidad > 1 ? `${d.cantidad}× ` : ''}${d.titulo}${d.variante ? ` (${d.variante})` : ''}`).join(' · ')
            return (
              <div key={p.id} role="button" tabIndex={0} onClick={() => setVer(p)} onKeyDown={e => { if (e.key === 'Enter') setVer(p) }}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${marcados.has(p.id) ? 'bg-emerald-50/70' : 'hover:bg-neutral-50'}`}>
                <input type="checkbox" checked={marcados.has(p.id)} aria-label="Marcar" onClick={e => e.stopPropagation()} onChange={() => toggle(p.id)} />
                {p.foto
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.foto} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md border border-neutral-200 object-cover" />
                  : <div className="h-10 w-10 shrink-0 rounded-md bg-neutral-100" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <b className="text-neutral-900">{p.comprador ?? p.nick ?? 'Comprador'}</b>
                    {p.nick && p.comprador && <span className="ml-1.5 text-xs text-neutral-400">@{p.nick}</span>}
                    <span className="ml-1.5 text-xs text-neutral-400">{hora(p.fecha_orden)}{p.cuenta ? ` · ${p.cuenta}` : ''}</span>
                  </p>
                  <p className="truncate text-xs text-neutral-600" title={prod}>{prod || <span className="font-mono text-neutral-400">{p.venta}</span>}</p>
                </div>
                <div className="hidden sm:flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-sm font-medium whitespace-nowrap">{bs(p.monto_pagado)}</span>
                  <Monto p={p} />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px]">
                  <span className={`inline-block px-2 py-0.5 rounded-full ${v.c}`}>{v.t}</span>
                  {!!p.ref_en_otras?.length && <span className="text-amber-700" title="La misma referencia aparece en otra venta">⚠️ ref. repetida</span>}
                  {p.ml_estado === 'cancelled' && <span className="text-red-700">cancelada en ML</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      </>}

      {/* Detalle del pago (12-11): todo lo que antes iba en la tabla, más el comprobante, sin salir de la sección. */}
      {ver && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={() => setVer(null)}>
          <div className="bg-white w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              {ver.foto
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={ver.foto} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-neutral-200 object-cover" />
                : <div className="h-14 w-14 shrink-0 rounded-lg bg-neutral-100" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-neutral-900">{ver.comprador ?? ver.nick ?? 'Comprador'}
                  {ver.nick && ver.comprador && <span className="ml-1.5 text-xs font-normal text-neutral-400">@{ver.nick}</span>}</p>
                <p className="text-xs text-neutral-500"><span className="font-mono">{ver.venta}</span> · {hora(ver.fecha_orden)}{ver.cuenta ? ` · ${ver.cuenta}` : ''}</p>
              </div>
              <button onClick={() => setVer(null)} className="text-neutral-400 hover:text-neutral-700" aria-label="Cerrar">✕</button>
            </div>
            {!!ver.detalle?.length && (
              <ul className="space-y-0.5 text-sm text-neutral-800">
                {ver.detalle.map((d, k) => <li key={k}>{d.cantidad}× {d.titulo}{d.variante ? <span className="text-neutral-500"> · {d.variante}</span> : null}</li>)}
              </ul>
            )}
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 rounded-xl bg-neutral-50 px-3 py-2.5 text-xs">
              <dt className="text-neutral-500">Pago</dt><dd>{metodoPago(ver.metodo_pago)} · {ver.banco_emisor ?? '?'} → {ver.banco_receptor ?? '?'}{ver.fecha_pago ? ` · ${ver.fecha_pago}` : ''}</dd>
              <dt className="text-neutral-500">Referencia</dt><dd className="font-mono">{ver.referencia ?? '—'}
                {!!ver.ref_en_otras?.length && <span className="block font-sans text-amber-700">⚠️ También en {ver.ref_en_otras.join(', ')} (¿pagó dos compras juntas?)</span>}</dd>
              <dt className="text-neutral-500">Pagado</dt><dd><b>{bs(ver.monto_pagado)}</b> <span className="text-neutral-500">· orden {bs(ver.total_orden)}</span> <Monto p={ver} /></dd>
              <dt className="text-neutral-500">Envío</dt><dd>{ver.envio_metodo ?? '—'}{[ver.envio_opcion, ver.carrier].filter(Boolean).length ? ` · ${[ver.envio_opcion, ver.carrier].filter(Boolean).join(' · ')}` : ''}
                {ver.guia && <span className="block">Guía <span className="font-mono">{ver.guia}</span></span>}
                {ver.tiene_guia
                  ? <a href={`/api/pagos-me/${ver.id}/archivo?tipo=guia`} target="_blank" rel="noreferrer" className="underline text-sky-700">📄 Ver guía</a>
                  : <span className="block text-neutral-400">sin guía todavía</span>}</dd>
              <dt className="text-neutral-500">En el sistema</dt><dd>
                {ver.ml_estado === 'cancelled' && <span className="block text-red-700 font-medium">cancelada en ML</span>}
                {ver.apartado && <span className="block font-medium text-amber-700">{ver.apartado === 'espera' ? '⏸ apartado: en espera' : ver.apartado === 'enviada' ? '✓ ya enviada por fuera' : '✕ envío cancelado'}</span>}
                {!datos?.desdeML && (ver.sale_status ? <span className="block">{ver.sale_status}</span> : <span className="block text-neutral-400">no registrada</span>)}
                {ver.en_despachos ? <a href="/despachos" className="underline underline-offset-2 hover:text-sky-700">{ver.guia_impresa ? '✓ guía ya impresa' : 'en Despachos, sin imprimir'} →</a>
                  : datos?.desdeML && <span className="text-neutral-400">{ver.tiene_guia ? 'todavía no en Despachos' : 'sin guía todavía'}</span>}</dd>
              <dt className="text-neutral-500">Estado</dt><dd><span className={`inline-block px-2 py-0.5 rounded-full ${VERIF[ver.verificacion].c}`}>{VERIF[ver.verificacion].t}</span>
                {ver.verificado_por && <span className="ml-1.5 text-neutral-500">por {ver.verificado_por}{ver.verificado_at ? ` · ${hora(ver.verificado_at)}` : ''}</span>}</dd>
            </dl>
            {ver.tiene_comprobante && <ComprobanteImgOPdf key={ver.id} url={`/api/pagos-me/${ver.id}/archivo?tipo=comprobante`} />}
            <div className="flex flex-wrap gap-2">
              {ver.verificacion !== 'valido' && <button onClick={() => { marcar('valido', [ver.id]); setVer(null) }} className="btn-primary text-sm flex-1">✓ Verificar</button>}
              {ver.verificacion !== 'invalido' && <button onClick={() => { marcar('invalido', [ver.id]); setVer(null) }} className="btn-secondary text-sm text-red-700">✗ Inválido</button>}
              {ver.verificacion !== 'pendiente' && <button onClick={() => { marcar('pendiente', [ver.id]); setVer(null) }} className="btn-secondary text-sm">Volver a sin verificar</button>}
              <button onClick={() => setVer(null)} className="btn-ghost text-sm ml-auto">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Cómo terminó la última traída, bien a la vista: trayendo / listo (ya puede despachar) / con problemas. */
function EstadoTraida({ pedido, perfiles, nombre, trabajando, desdeML, pcPrendida, vivos = [] }: {
  pedido: NonNullable<Datos['vigilante']['pedido']>; perfiles: string[]; nombre: (perfil: string) => string
  trabajando: boolean; desdeML: boolean; pcPrendida: boolean
  /** Perfiles cuyo Chrome da señal ahora (20-11): si no respondieron, la extensión quedó trabada (no es la luz). */
  vivos?: string[]
}) {
  const res = Object.entries(pedido.resultados)
  const faltan = perfiles.filter(p => !pedido.resultados[p])
  const fallas = res.filter(([, r]) => !r.ok)
  const nuevas = res.reduce((s, [, r]) => s + (r.ok ? r.nuevas : 0), 0)
  const dia = (s: string) => new Date(s).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' })
  const cuando = `${dia(pedido.pedido_at) === dia(new Date().toISOString()) ? 'hoy' : dia(pedido.pedido_at)} ${
    new Date(pedido.pedido_at).toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit' })}`
  const detalle = res.map(([perfil, r]) => (
    <span key={perfil} className="mr-3 whitespace-nowrap">
      <b>{nombre(perfil) !== perfil ? nombre(perfil) : (r.cuenta ?? perfil)}</b>{' '}
      {r.ok ? `${r.nuevas} nuevas (${r.vistas} revisadas)` : <span className="text-red-700">{ERROR_PERFIL[r.error ?? ''] ?? textoErrorME(r.error)}</span>}
    </span>
  ))
  const caja = (c: string, titulo: ReactNode, cuerpo?: ReactNode) => (
    <div className={`rounded-xl border px-4 py-3 text-sm space-y-1 ${c}`}>
      <div className="font-medium">{titulo}</div>
      {cuerpo && <div className="text-xs opacity-90">{cuerpo}</div>}
    </div>
  )
  const origen = pedido.automatico ? 'automática' : 'pedida a mano'

  if (trabajando) return caja('bg-sky-50 border-sky-200 text-sky-900',
    <>⏳ Trayendo pagos y guías ({origen}, {cuando})… no apagues la PC.</>,
    <>{detalle}{faltan.map(p => <span key={p} className="mr-3 whitespace-nowrap"><b>{nombre(p)}</b> trabajando…</span>)}</>)
  // La PC responde pero ningún perfil de Chrome tiene el Asistente conectado: no es la luz (23-10).
  if (res.length === 0 && pcPrendida && perfiles.length === 0) return caja('bg-amber-50 border-amber-200 text-amber-900',
    <>⚠️ La PC está prendida, pero ningún perfil de Chrome tiene el Asistente de envíos conectado.</>,
    'Abre Chrome en el perfil de tu cuenta de MercadoLibre, agrega el Asistente y escribe el código (pasos 3 y 4 de arriba). Después toca "Traer pagos y guías".')
  // 20-11 (el dueño, caso Ainy): la PC SÍ estaba prendida (Chrome o programa dan señal) y ninguna cuenta tomó la traída:
  // decir «¿apagada o sin luz?» confundía. Chrome vivo = extensión trabada; solo el programa vivo = Chrome no abrió.
  if (res.length === 0 && perfiles.length > 0 && (vivos.length > 0 || pcPrendida)) return caja('bg-amber-50 border-amber-200 text-amber-900',
    <>⚠️ La traída {origen} de {cuando} no se hizo: la PC está prendida, pero {vivos.length ? 'la extensión no tomó la traída' : 'Chrome no respondió'}.</>,
    <>{perfiles.map(p => <span key={p} className="mr-3"><b>{nombre(p)}</b>: {vivos.includes(p) ? AYUDA_EXTENSION_TRABADA : AYUDA_SIN_SENAL}.</span>)}
      {' '}No se pierde nada: después dale a "Traer pagos y guías".</>)
  if (res.length === 0) return caja('bg-amber-50 border-amber-200 text-amber-900',
    <>⚠️ La traída {origen} de {cuando} no se hizo: la PC no respondió (¿apagada o sin luz?).</>,
    'No se pierde nada: cuando la prendas, dale a "Traer pagos y guías" y trae todo lo que faltaba.')
  if (fallas.length || faltan.length) return caja('bg-red-50 border-red-200 text-red-900',
    <>❌ La traída de {cuando} quedó incompleta: revisa antes de despachar.</>,
    <>{detalle}{faltan.map(p => <span key={p} className="mr-3 whitespace-nowrap"><b>{nombre(p)}</b> no respondió: {vivos.includes(p) ? AYUDA_EXTENSION_TRABADA : AYUDA_TRABADA}.</span>)}</>)
  // Completa y sin errores (18-11): va en la línea de estado, no en una caja.
  return null
}

/** Primera vez: qué es y cómo se conecta. Es LA guía de los Fundadores (23-10): cada paso una sola acción, y los
 *  pasos 1-2 (programa) y 3-4 (Asistente en Chrome) se marcan solos cuando el sistema los ve conectados. Se ve hasta
 *  que hay un perfil de Chrome conectado. Mismo texto que tools/vigilante-pagos-me/guia (PDF). */
function PrimerosPasos({ isAdmin, onConectar, programaListo }: { isAdmin: boolean; onConectar: () => void; programaListo: boolean }) {
  const paso = 'flex gap-3 items-start'
  const num = (listo: boolean, falta = false) => `shrink-0 w-6 h-6 rounded-full text-white text-xs font-semibold flex items-center justify-center ${
    listo ? 'bg-emerald-600' : falta ? 'bg-amber-500 ring-4 ring-amber-200' : 'bg-emerald-600/70'}`
  const sub = 'block text-xs text-neutral-500 mt-0.5'
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4 space-y-3 text-sm text-neutral-700">
      <div>
        <p className="font-semibold text-neutral-900">Tus pagos y guías de MercadoEnvíos, solos</p>
        <p className="text-xs text-neutral-500 mt-0.5">
          Un programa en tu PC lee el portal de MercadoEnvíos con <b>tu</b> sesión y trae los pagos con su comprobante y las
          guías. Tu contraseña nunca sale de tu PC. Si se va la luz no se pierde nada: al prenderla trae lo que faltaba.
        </p>
      </div>
      {isAdmin ? (<>
        {/* Paso 0 (23-10, pedido del dueño): lo que tiene que haber antes, para que todo fluya. */}
        <div className="rounded-lg bg-white/70 px-3 py-2 text-xs text-neutral-600 ring-1 ring-inset ring-emerald-200">
          <b className="text-neutral-800">Antes de empezar:</b> una <b>PC con Windows</b> (la misma donde imprimes las guías) con{' '}
          <b>Google Chrome</b>, y en Chrome <b>la sesión de MercadoEnvíos iniciada</b> con tu cuenta de MercadoLibre (un perfil de
          Chrome por cada cuenta). Ser administrador de tu empresa aquí.
        </div>
        <ol className="space-y-2.5">
          <li className={paso}><span className={num(programaListo)}>{programaListo ? '✓' : '1'}</span>
            <span><a href={DESCARGA_PROGRAMA} className="font-medium text-emerald-700 underline">Descarga el programa</a> en la PC donde imprimes las guías e instálalo (Siguiente → Instalar).
              <span className={sub}>
                Si Windows muestra «Windows protegió su PC», toca <b>Más información</b> → <b>Ejecutar de todas formas</b>. Sale porque el
                programa es nuevo y no tiene firma comprada; es el nuestro.
              </span></span></li>
          <li className={paso}><span className={num(programaListo)}>{programaListo ? '✓' : '2'}</span>
            <span>Cuando el programa pida el código: toca <button onClick={onConectar} className="font-medium text-emerald-700 underline">Genera tu código</button> → <b>Copiar</b> y pégalo ahí.
              Al terminar deja marcadas las dos casillas y toca <b>Finalizar</b>.
              {programaListo && <span className="block text-xs font-medium text-emerald-700 mt-0.5">✓ El programa ya está conectado.</span>}</span></li>
          <li className={paso}><span className={num(false, programaListo)}>3</span>
            <span><b>Agrega el Asistente de envíos a Chrome:</b> al finalizar la instalación se abre solo en la tienda de Chrome → <b>Añadir a Chrome</b> → <b>Añadir extensión</b>.
              <span className={sub}><b>Asegúrate de que esa ventana de Chrome sea la del perfil donde tienes iniciada la sesión de MercadoEnvíos.</b> Si se
                abrió en otro perfil, no se abrió o quieres agregarlo a mano: en el perfil correcto entra a{' '}
                <a href="/extension" target="_blank" className="font-medium text-emerald-700 underline">app.elcomerciantedigital.com/extension</a>. No hace falta «Iniciar sesión en Chrome».</span></span></li>
          <li className={paso}><span className={num(false, programaListo)}>4</span>
            <span><b>Conecta el Asistente:</b> toca la <b>pieza de rompecabezas</b> (arriba a la derecha de Chrome) → 📌 fija «Asistente de envíos» →
              ábrelo, <b>pega el mismo código</b> y toca <b>Conectar</b>. Debe decir <b>«Conectado al sistema»</b>.
              <span className={sub}>¿Otra cuenta de MercadoLibre en otro perfil de Chrome? Repite los pasos 3 y 4 ahí. Si el código venció, genera otro: lo ya conectado sigue funcionando.</span>
              {programaListo && <span className="block text-xs font-medium text-amber-700 mt-0.5">Falta este paso: ningún perfil de Chrome tiene el Asistente conectado todavía.</span>}</span></li>
          <li className={paso}><span className={num(false)}>5</span>
            <span>Listo: toca <b>Traer pagos y guías</b> y espera el aviso verde <b>✅ Listo</b>. Chrome se abre solo, trabaja y se cierra: no lo toques.</span></li>
        </ol>
      </>) : (
        <p className="text-xs">Pídele a un administrador de tu empresa que conecte la PC.</p>
      )}
    </div>
  )
}

/** 12-11: el comprobante puede venir en PDF (el comprador lo subió así): si no carga como imagen, se muestra como PDF. */
function ComprobanteImgOPdf({ url }: { url: string }) {
  const [esPdf, setEsPdf] = useState(false)
  if (esPdf) return <iframe src={url} title="Comprobante" className="w-full h-[60vh] rounded-lg border bg-white" />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Comprobante de pago" onError={() => setEsPdf(true)} className="w-full rounded-lg border" />
}

/** 21-11: la primera vez que se ve la lista con inventario, qué cambia al registrar (se cierra y no vuelve). */
function AvisoConInventario() {
  const [visto, setVisto] = useState(true)
  useEffect(() => {
    let v = true
    try { v = localStorage.getItem('aviso:pagosme_inventario') === '1' } catch { /* sin almacenamiento: no se muestra */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee del navegador después de montar
    setVisto(v)
  }, [])
  if (visto) return null
  const cerrar = () => { try { localStorage.setItem('aviso:pagosme_inventario', '1') } catch { /* nada */ } setVisto(true) }
  return (
    <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-sm text-sky-900">
      <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white">i</span>
      <p className="min-w-0 flex-1 leading-snug">
        <b className="font-semibold">Ahora con Inventario:</b> al tocar <b className="font-semibold">Registrar venta</b> la venta queda en
        Ventas y se descuenta del stock. Es la misma lista que ves en <Link href="/ventas?vista=confirmar" className="underline underline-offset-2">Ventas → Por confirmar</Link>:
        lo que hagas aquí aparece allá.
      </p>
      <button type="button" onClick={cerrar} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100">Entendido</button>
    </div>
  )
}
