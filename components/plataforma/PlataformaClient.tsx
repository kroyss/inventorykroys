'use client'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import CuentasPanel from './CuentasPanel'
import FundadoresPanel from './FundadoresPanel'
import InternoPanel from './InternoPanel'
import NovedadesCard from './NovedadesCard'
import AprendizajePanel from './AprendizajePanel'
import ResumenPanel from './ResumenPanel'
import AdopcionPanel from './AdopcionPanel'
import { DIAS_PRUEBA, ETIQUETA_ESTADO, estadoEfectivo, type EstadoCuenta } from '@/lib/cuenta'
import { corteDeAlta, corteISO } from '@/lib/fundadoresCortes'

interface Empresa {
  id: number
  nombre: string
  country: 'VE' | 'CO'
  modulos: string[]
  is_active: boolean
  created_at: string
  organizacion_id: number
  organizacion: string
  usuarios: number
  admins: string | null
  estado: EstadoCuenta
  prueba_hasta: string | null
  prueba_dias: number | null
  fundador: boolean
  origen?: string | null      // 'autoregistro' = se registró solo en /registro (26-10)
  registro?: { correo?: string; whatsapp?: string; telegram?: string | null } | null
  ia_limite_mes: number | null
  motivo_pausa: string | null
  pausa_fecha: string | null
  creada: string
  cuentas: string | null      // cuentas de MercadoLibre conectadas (null = ninguna)
  inventario?: UsoInventario | null   // solo con el módulo inventario (25-10)
}
interface UsoInventario { ultima: string | null; sin_registrar: number; sin_registrar_con_pago: number }

/** ¿Usa el inventario? (25-10) Última venta registrada y ventas de ML de los últimos 7 días sin registrar. */
function LineaInventario({ u, conPagos }: { u: UsoInventario; conPagos: boolean }) {
  // Con Pagos ME se cuentan solo las que trajeron pago (en VE muchas compras nunca se pagan).
  const n = conPagos ? u.sin_registrar_con_pago : u.sin_registrar
  const dias = u.ultima ? Math.floor((Date.now() - new Date(u.ultima).getTime()) / 86_400_000) : null
  const tono = dias == null || dias > 7 ? 'text-red-600' : dias > 2 || n > 5 ? 'text-amber-700' : 'text-emerald-700'
  const punto = dias == null || dias > 7 ? '🔴' : dias > 2 || n > 5 ? '🟡' : '🟢'
  return (
    <div className={`text-[11px] ${tono}`} title={`Ventas de MercadoLibre de los últimos 7 días${conPagos ? ' con pago' : ''} que no se registraron en Ventas: su stock no está al día`}>
      {punto} Inventario: {dias == null ? 'nunca registró una venta' : `última venta registrada ${dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`}`}
      {' · '}<b>{n}</b> {conPagos ? 'con pago ' : ''}sin registrar (7 días)
    </div>
  )
}

// Clientes (20-10, "los inactivos me hacen ruido"): a la vista solo los que PUEDEN ENTRAR (en prueba o pagando);
// las pausadas y las apagadas a mano quedan guardadas y plegadas al final ("Inactivos guardados"), con su motivo y
// el botón Reactivar. El buscador las encuentra igual.
const puedeEntrar = (e: Empresa, hoy: string) => e.is_active && estadoEfectivo(e.estado, e.prueba_hasta, hoy) !== 'vencido'
const diasHasta = (f: string, hoy: string) => Math.round((Date.parse(`${f}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000)

/** El estado de la cuenta en una frase (lo que se lee en la lista). */
function fraseCuenta(e: Empresa, hoy: string): { icono: string; texto: string; extra?: string; alerta?: boolean } {
  const est = estadoEfectivo(e.estado, e.prueba_hasta, hoy)
  if (!e.is_active) return { icono: '⛔', texto: 'Apagada a mano', extra: 'nadie puede entrar' }
  if (est === 'propietario') return { icono: '🏠', texto: 'Tu empresa' }
  if (est === 'activo') return { icono: '✅', texto: 'Pagando', extra: e.cuentas ? 'ML conectado' : 'sin ML' }
  if (est === 'vencido') {
    if (e.motivo_pausa === 'corte_fundadores') return { icono: '⏸', texto: 'Pausada', extra: `no conectó ML (corte ${e.pausa_fecha ? ddmm(e.pausa_fecha) : ''})` }
    if (e.motivo_pausa === 'plan') return { icono: '⏸', texto: 'Pausada', extra: 'venció su plan' }
    if (e.motivo_pausa === 'manual') return { icono: '⏸', texto: 'Pausada por ti', extra: e.pausa_fecha ? `el ${ddmm(e.pausa_fecha)}` : undefined }
    return { icono: '⏸', texto: 'Pausada', extra: e.prueba_hasta ? `terminó su prueba el ${ddmm(e.prueba_hasta)}` : 'terminó su prueba' }
  }
  // En prueba
  const partes: string[] = []
  let alerta = false
  if (e.prueba_dias != null) partes.push(`sus ${e.prueba_dias} días empiezan al conectar ML`)
  else if (e.prueba_hasta) {
    const d = diasHasta(e.prueba_hasta, hoy)
    partes.push(`vence ${ddmm(e.prueba_hasta)}${d <= 5 ? ` · quedan ${d} día${d === 1 ? '' : 's'}` : ''}`)
    alerta = d <= 5
  }
  if (!e.cuentas) {
    const c = e.fundador ? corteDeAlta(e.creada) : null
    const pendiente = !!c && Date.parse(corteISO(c)) > Date.now()
    partes.push(pendiente ? `sin ML · corte ${ddmm(c!.fecha)} ${c!.hora > 12 ? `${c!.hora - 12} pm` : `${c!.hora} am`}` : 'sin ML')
    alerta = alerta || pendiente
  } else partes.push('ML conectado')
  return { icono: alerta ? '⚠️' : '🟢', texto: 'En prueba', extra: partes.join(' · '), alerta }
}

function FraseCuenta({ e, hoy }: { e: Empresa; hoy: string }) {
  const f = fraseCuenta(e, hoy)
  return (
    <div className="min-w-[10rem]">
      <div className="whitespace-nowrap text-xs font-medium text-neutral-800">{f.icono} {f.texto}{e.fundador && <span className="ml-1 text-amber-700" title="Fundador">⭐</span>}
        {e.origen === 'autoregistro' && <span className="ml-1.5 rounded-full bg-sky-50 px-1.5 py-px text-[10px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-200" title="Se registró solo en /registro (prueba de 15 días)">Autoregistro</span>}</div>
      {f.extra && <div className={`text-[11px] ${f.alerta ? 'text-amber-700' : 'text-neutral-500'}`}>{f.extra}</div>}
      {e.origen === 'autoregistro' && e.registro && (
        <div className="text-[11px] text-neutral-500">
          {e.registro.whatsapp && <a href={`https://wa.me/${e.registro.whatsapp.replace(/\D/g, '').replace(/^0/, '58')}`} target="_blank" rel="noreferrer" className="underline" onClick={ev => ev.stopPropagation()}>WhatsApp {e.registro.whatsapp}</a>}
          {e.registro.telegram && <> · <a href={`https://t.me/${e.registro.telegram}`} target="_blank" rel="noreferrer" className="underline" onClick={ev => ev.stopPropagation()}>@{e.registro.telegram}</a></>}
          {e.registro.correo && <> · {e.registro.correo}</>}
        </div>
      )}
    </div>
  )
}

const input = 'mt-1 w-full border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white'

// Encender Inventario cambia cómo trabaja Despachos: deja de armar con las ventas de MercadoLibre
// y exige cada venta cargada en Ventas. Regla (2026-10-06): todos arrancan sin Inventario y se
// enciende en la sesión de configuración, después de la serie de videos de Automatizaciones.
const AVISO_INVENTARIO = 'Al encender Inventario, Despachos deja de usar las ventas de MercadoLibre: cada venta debe '
  + 'estar cargada en Ventas (con sus productos) para poder imprimir su etiqueta. Hazlo en la sesión de configuración, '
  + 'con el cliente ya listo para cargar productos y ventas.'

// Clave inicial legible (sin 0/O/1/l): el cliente la cambia al entrar.
function claveInicial() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'
  const r = crypto.getRandomValues(new Uint32Array(10))
  return Array.from(r, n => abc[n % abc.length]).join('')
}

export default function PlataformaClient({ empresaActual }: { empresaActual: number }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [modulos, setModulos]   = useState<Record<string, string>>({})
  const [nueva, setNueva]       = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [aviso, setAviso]       = useState<string | null>(null)
  // 5 pestañas (17-10, cada cosa en un solo lugar): Hoy (resumen + los más activos) · Clientes (por actividad,
  // ficha al tocar) · Fundadores (la lista arriba, el programa plegado) · Contenido (Novedades y videos, lo que
  // ven los clientes) · Interno (IA, Telegram, cuentas de personas).
  const [vista, setVista]       = useState<'hoy' | 'clientes' | 'fundadores' | 'contenido' | 'interno'>('hoy')
  const [interno, setInterno]   = useState<'ia' | 'personas'>('ia')
  const [hoy, setHoy]           = useState('')
  const [borrar, setBorrar]     = useState<Empresa | null>(null)
  const [abierta, setAbierta]   = useState<number | null>(null)
  const [verInactivos, setVerInactivos] = useState(false)
  const [reactivar, setReactivar] = useState<Empresa | null>(null)
  const [buscar, setBuscar]     = useState('')
  const confirm = useConfirm()

  const cargar = useCallback(async () => {
    const r = await fetch('/api/plataforma/empresas')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    setEmpresas(d.empresas); setModulos(d.modulos); setHoy(d.hoy)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (e: Empresa, cambios: Partial<Pick<Empresa, 'nombre' | 'modulos' | 'is_active' | 'ia_limite_mes'>>) => {
    setError(null); setAviso(null)
    const r = await fetch(`/api/plataforma/empresas/${e.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    setAviso(`${e.nombre}: cambios guardados. Sus usuarios los ven en su próximo clic.`)
    cargar()
  }

  const pausar = async (e: Empresa) => {
    if (!await confirm({
      title: `Pausar ${e.organizacion}`, confirmText: 'Pausar',
      message: 'Sus usuarios no podrán entrar desde su próximo clic (verán que su cuenta está pausada, con el botón de Telegram). Los datos se conservan y la reactivas cuando quieras.',
    })) return
    setError(null); setAviso(null)
    const r = await fetch(`/api/plataforma/organizaciones/${e.organizacion_id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'vencido' }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo pausar'); return }
    setAviso(`${e.organizacion}: pausada. Queda en "Inactivos guardados".`)
    cargar()
  }

  const renombrar = (e: Empresa) => {
    const nombre = window.prompt(`Nuevo nombre para "${e.nombre}"`, e.nombre)?.trim()
    if (nombre && nombre !== e.nombre) actualizar(e, { nombre })
  }

  const alternarModulo = async (e: Empresa, m: string) => {
    const enciende = !e.modulos.includes(m)
    if (m === 'inventario' && enciende && !await confirm({
      title: `Encender Inventario en ${e.nombre}`, message: AVISO_INVENTARIO, confirmText: 'Encender Inventario',
    })) return
    actualizar(e, { modulos: enciende ? [...e.modulos, m] : e.modulos.filter(x => x !== m) })
  }

  const sel = empresas.find(e => e.id === abierta) ?? null
  // Escape cierra el panel
  useEffect(() => {
    if (abierta == null) return
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setAbierta(null) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [abierta])
  const q = buscar.trim().toLowerCase()
  const coincide = (e: Empresa) => !q || e.nombre.toLowerCase().includes(q) || (e.admins ?? '').toLowerCase().includes(q) || e.organizacion.toLowerCase().includes(q)
  const activas = empresas.filter(e => puedeEntrar(e, hoy) && coincide(e))
  const inactivas = empresas.filter(e => !puedeEntrar(e, hoy) && coincide(e))
  const totalInactivas = empresas.filter(e => !puedeEntrar(e, hoy))
  const clientesActivos = empresas.filter(e => puedeEntrar(e, hoy) && e.estado !== 'propietario').length
  const mostrarInactivas = verInactivos || (!!q && inactivas.length > 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Plataforma"
        subtitle="Tus clientes, cómo usan el sistema y lo interno de El Comerciante Digital. Solo lo ves tú."
        actions={vista === 'clientes'
          ? <button onClick={() => { setNueva(true); setError(null) }} className="btn-primary text-sm">+ Nueva empresa</button>
          : undefined}
      />

      {/* En celular las 6 pestañas no caben: se deslizan de lado dentro de su línea (antes ensanchaban la página). */}
      <div className="flex gap-1 shadow-[inset_0_-1px_0_#e5e5e5] overflow-x-auto [scrollbar-width:none]">
        {([['hoy', 'Hoy'], ['clientes', `Clientes${empresas.length ? ` (${clientesActivos})` : ''}`], ['fundadores', 'Fundadores'],
           ['contenido', 'Contenido'], ['interno', 'Interno']] as const).map(([v, t]) => (
          <button key={v} onClick={() => setVista(v)}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm border-b-2 ${vista === v ? 'border-neutral-900 font-semibold' : 'border-transparent text-neutral-500'}`}>
            {t}
          </button>
        ))}
      </div>

      {vista === 'hoy' ? <ResumenPanel onIr={setVista} /> : vista === 'fundadores' ? <FundadoresPanel />
        : vista === 'contenido' ? <div className="space-y-8"><NovedadesCard /><AprendizajePanel /></div>
        : vista === 'interno' ? <>
          <div className="flex gap-1.5">
            {([['ia', 'IA y Telegram'], ['personas', 'Cuentas de personas']] as const).map(([k, t]) => (
              <button key={k} onClick={() => setInterno(k)}
                className={`px-3 py-1 rounded-full text-sm border ${interno === k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-600'}`}>{t}</button>
            ))}
          </div>
          {interno === 'ia' ? <InternoPanel /> : <CuentasPanel />}
        </> : <>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
      {aviso && <div className="bg-neutral-50 border border-neutral-200 text-neutral-700 px-4 py-2 rounded text-sm">{aviso}</div>}

      {nueva && (
        <NuevaEmpresa modulos={modulos}
          onCancelar={() => setNueva(false)}
          onCreada={msg => { setNueva(false); setAviso(msg); cargar() }} />
      )}

      {/* Lista corta: lo que se mira seguido. El detalle (módulos, IA, acciones) va en el panel lateral. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">
          <b className="text-neutral-900">{clientesActivos}</b> clientes pueden entrar
          {totalInactivas.length > 0 && <span className="text-neutral-400"> · {totalInactivas.length} inactivos guardados abajo</span>}
        </p>
        <input type="search" value={buscar} onChange={ev => setBuscar(ev.target.value)} placeholder="Buscar empresa o admin…"
          className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-64" />
      </div>

      {/* Una sola lista (2026-10-15): cada empresa con su estado de cuenta y su uso del sistema; la ficha
          (módulos, IA, acciones) se abre al tocarla, como antes. */}
      <AdopcionPanel abierta={abierta} onAbrir={id => { setError(null); setAviso(null); setAbierta(id) }}
        base={activas.map(e => ({
          id: e.id, nombre: e.nombre, activa: true,
          porVencer: e.estado === 'prueba' && e.prueba_dias == null && !!e.prueba_hasta && diasHasta(e.prueba_hasta, hoy) <= 5,
          detalle: `${e.country}${e.organizacion !== e.nombre ? ` · ${e.organizacion}` : ''}${e.admins ? ` · ${e.admins}` : ''}`,
          cuenta: <FraseCuenta e={e} hoy={hoy} />,
          extra: e.inventario ? <LineaInventario u={e.inventario} conPagos={e.modulos.includes('pagos_me')} /> : undefined,
        }))} />

      {/* Inactivos: guardados, fuera de la vista rápida. Con la búsqueda se abren solos si hay coincidencias. */}
      {totalInactivas.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white">
          <button onClick={() => setVerInactivos(v => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-neutral-600 hover:bg-neutral-50">
            <span>
              {mostrarInactivas ? '▾' : '▸'} Inactivos guardados:{' '}
              <b className="text-neutral-800">{totalInactivas.filter(e => e.is_active).length}</b> pausados ·{' '}
              <b className="text-neutral-800">{totalInactivas.filter(e => !e.is_active).length}</b> apagados a mano
            </span>
            <span className="text-xs text-neutral-400">{mostrarInactivas ? 'Ocultar' : 'Ver todos'}</span>
          </button>
          {mostrarInactivas && (
            <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
              {inactivas.length === 0 && <li className="px-4 py-3 text-sm text-neutral-400">Ninguno coincide con la búsqueda.</li>}
              {inactivas.map(e => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                  <button onClick={() => { setError(null); setAviso(null); setAbierta(e.id) }} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-medium text-neutral-800 hover:underline">{e.nombre}</div>
                    <div className="truncate text-[11px] text-neutral-400">{e.country}{e.admins ? ` · ${e.admins}` : ''}{e.cuentas ? ` · ${e.cuentas}` : ' · sin ML'}</div>
                  </button>
                  <FraseCuenta e={e} hoy={hoy} />
                  {e.is_active
                    ? <button onClick={() => { setError(null); setAviso(null); setReactivar(e) }} className="btn-secondary text-xs">Reactivar…</button>
                    : <button onClick={() => actualizar(e, { is_active: true })} className="btn-secondary text-xs">Encender</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {reactivar && (
        <Reactivar e={reactivar} hoy={hoy} onCancelar={() => setReactivar(null)} onError={msg => { setReactivar(null); setError(msg) }}
          onListo={msg => { setReactivar(null); setAviso(msg); cargar() }} />
      )}

      {/* Panel lateral con todo el detalle de la empresa */}
      {sel && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/20" onClick={() => setAbierta(null)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b flex items-start justify-between gap-3">
              <div className="min-w-0">
                <button onClick={() => renombrar(sel)} title="Cambiar el nombre" className="font-semibold text-lg text-left hover:underline">
                  {sel.nombre} <span className="text-neutral-400 text-xs">✏️</span>
                </button>
                <div className="text-xs text-neutral-500">
                  {sel.country} · {sel.organizacion} · {sel.usuarios} usuario{sel.usuarios === 1 ? '' : 's'}
                </div>
                {sel.admins && <div className="text-xs text-neutral-500 font-mono mt-0.5">Admin: {sel.admins}</div>}
              </div>
              <button onClick={() => setAbierta(null)} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-sm">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
              {aviso && <div className="bg-neutral-50 border border-neutral-200 text-neutral-700 px-3 py-2 rounded text-sm">{aviso}</div>}

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">Cuenta</h3>
                <div className="mb-2"><FraseCuenta e={sel} hoy={hoy} /></div>
                {sel.estado !== 'propietario' && sel.is_active && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {puedeEntrar(sel, hoy)
                      ? <button onClick={() => pausar(sel)} className="btn-secondary text-xs">Pausar (no podrá entrar)</button>
                      : <button onClick={() => setReactivar(sel)} className="btn-primary text-xs">Reactivar…</button>}
                  </div>
                )}
                {sel.estado !== 'propietario' && (
                  <details className="text-xs text-neutral-500">
                    <summary className="cursor-pointer select-none">Cambiar estado, fecha o Fundador a mano</summary>
                    <div className="mt-2"><Cuenta e={sel} hoy={hoy} onGuardada={msg => { setAviso(msg); cargar() }} onError={setError} /></div>
                  </details>
                )}
              </section>

              {sel.estado !== 'propietario' && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">Historia</h3>
                  <Historia key={`${sel.organizacion_id}-${sel.estado}-${sel.prueba_hasta}-${sel.is_active}`} organizacionId={sel.organizacion_id} />
                </section>
              )}

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">Módulos</h3>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(modulos).map(([m, desc]) => (
                    <button key={m} onClick={() => alternarModulo(sel, m)} title={desc}
                      className={`px-2 py-0.5 rounded-full text-xs border ${
                        sel.modulos.includes(m) ? 'bg-green-100 border-green-200 text-green-800' : 'bg-white border-neutral-200 text-neutral-400'
                      }`}>
                      {sel.modulos.includes(m) ? '✓ ' : ''}{m}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-400 mt-1.5">Tocar un módulo lo prende o lo apaga (pasa el mouse encima para ver qué es).</p>
              </section>

              <section className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Créditos de IA por mes</h3>
                  <p className="text-xs text-neutral-400">1 por borrador (buscar en internet, hasta 4). Vacío = sin límite.</p>
                </div>
                <LimiteIA key={`${sel.id}-${sel.ia_limite_mes}`} valor={sel.ia_limite_mes} onGuardar={v => actualizar(sel, { ia_limite_mes: v })} />
              </section>

              {/* Acciones delicadas: al fondo y separadas */}
              <section className="border-t border-neutral-100 pt-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Acciones</h3>
                <div className="flex flex-wrap gap-2">
                  <button disabled={sel.id === empresaActual}
                    onClick={() => actualizar(sel, { is_active: !sel.is_active })}
                    title={sel.id === empresaActual ? 'Es la empresa en la que estás' : undefined}
                    className="btn-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed">
                    {sel.is_active ? 'Desactivar (saca a sus usuarios)' : 'Activar'}
                  </button>
                  {sel.estado !== 'propietario' && (
                    <button onClick={() => { setError(null); setAviso(null); setBorrar(sel) }}
                      className="btn-secondary text-xs text-red-600">Eliminar con todos sus datos…</button>
                  )}
                </div>
                <p className="text-xs text-neutral-400">
                  Desactivar saca a sus usuarios; los datos se conservan. Eliminar la borra con TODOS sus datos (primero hay que desactivarla).
                </p>
                {/* 26-10: el cuadro de eliminar va aquí, donde se tocó el botón (antes salía arriba de la página y no se veía). */}
                {borrar?.id === sel.id && (
                  <EliminarEmpresa e={sel} onCancelar={() => setBorrar(null)}
                    onDesactivar={() => actualizar(sel, { is_active: false })}
                    onEliminada={msg => { setBorrar(null); setAbierta(null); setAviso(msg); cargar() }} />
                )}
              </section>
            </div>
          </aside>
        </div>
      )}
      </>}
    </div>
  )
}

function NuevaEmpresa({ modulos, onCancelar, onCreada }: {
  modulos: Record<string, string>; onCancelar: () => void; onCreada: (msg: string) => void
}) {
  const [f, setF] = useState({
    nombre: '', country: 'VE' as 'VE' | 'CO', modulos: ['despachos', 'reportador', 'preguntas', 'alertas_stock'],   // un Fundador: Automatizaciones, sin Inventario
    alta: 'fundador' as 'fundador' | 'prueba' | 'activo' | 'demo',
    username: '', full_name: '', password: claveInicial(),
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const crear = async () => {
    setGuardando(true); setError(null)
    const r = await fetch('/api/plataforma/empresas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: f.nombre, country: f.country, modulos: f.modulos, alta: f.alta,
        admin: { username: f.username, full_name: f.full_name, password: f.password },
      }),
    })
    const d = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    onCreada(`Empresa "${f.nombre}" creada. Su administrador entra con el usuario "${f.username}" y la contraseña ${f.password}.`)
  }

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <h2 className="text-sm font-semibold text-neutral-800">Nueva empresa</h2>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-neutral-600">Nombre de la empresa
          <input className={input} value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="p.ej. Tienda Pérez" />
        </label>
        <label className="text-xs text-neutral-600">País
          <select className={input} value={f.country} onChange={e => setF({ ...f, country: e.target.value as 'VE' | 'CO' })}>
            <option value="VE">Venezuela</option>
            <option value="CO">Colombia</option>
          </select>
        </label>
        <label className="text-xs text-neutral-600">Cuenta
          <select className={input} value={f.alta} onChange={e => setF({ ...f, alta: e.target.value as typeof f.alta })}>
            <option value="fundador">⭐ Fundador: {DIAS_PRUEBA.fundador} días gratis desde que conecte ML</option>
            <option value="prueba">Prueba: {DIAS_PRUEBA.normal} días gratis desde que conecte ML</option>
            <option value="activo">Activo (ya paga)</option>
            <option value="demo">🎬 Demo para videos: datos ficticios, nada sale a MercadoLibre</option>
          </select>
          {f.alta === 'demo' && <span className="block mt-1 text-[11px] text-neutral-500">Se crea con 2 cuentas de ML ficticias y todo pendiente (Automatiza). Se restaura desde el menú de la cuenta → Demo.</span>}
        </label>
        <label className="text-xs text-neutral-600">Administrador: nombre completo
          <input className={input} value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} />
        </label>
        <label className="text-xs text-neutral-600">Administrador: usuario (para entrar)
          <input className={`${input} font-mono`} value={f.username} autoComplete="off"
            onChange={e => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} placeholder="p.ej. perez" />
        </label>
        <label className="text-xs text-neutral-600">Contraseña inicial (se la pasas; la puede cambiar)
          <div className="flex gap-2">
            <input className={`${input} font-mono`} value={f.password} autoComplete="new-password"
              onChange={e => setF({ ...f, password: e.target.value })} />
            <button type="button" onClick={() => setF({ ...f, password: claveInicial() })} className="btn-secondary text-xs mt-1">Otra</button>
          </div>
        </label>
        <div className="text-xs text-neutral-600">Módulos
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Object.entries(modulos).map(([m, desc]) => (
              <label key={m} className="flex items-center gap-1 border border-neutral-200 rounded px-2 py-1" title={desc}>
                <input type="checkbox" checked={f.modulos.includes(m)}
                  onChange={() => setF({ ...f, modulos: f.modulos.includes(m) ? f.modulos.filter(x => x !== m) : [...f.modulos, m] })} />
                {m}
              </label>
            ))}
          </div>
          {f.modulos.includes('inventario') && <p className="mt-1.5 text-amber-700">⚠ {AVISO_INVENTARIO}</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="btn-secondary text-sm">Cancelar</button>
        <button onClick={crear} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Creando…' : 'Crear empresa'}</button>
      </div>
    </section>
  )
}

const COLOR_ESTADO: Record<EstadoCuenta, string> = {
  propietario: 'bg-neutral-900 text-white',
  prueba:      'bg-sky-100 text-sky-800',
  activo:      'bg-green-100 text-green-800',
  vencido:     'bg-red-100 text-red-700',
}
const ddmm = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')

/** Estado de la cuenta de la organización (lib/cuenta.ts): pastilla + editor al tocarla. */
/** Límite de borradores de IA por mes: se guarda al salir del campo (vacío = sin límite). Se
 *  rearma (key) cuando cambia el valor guardado. */
function LimiteIA({ valor, onGuardar }: { valor: number | null; onGuardar: (v: number | null) => void }) {
  const [v, setV] = useState(valor == null ? '' : String(valor))
  const guardar = () => {
    const n = v.trim() === '' ? null : Math.max(0, Math.round(Number(v)))
    if (n !== null && !Number.isFinite(n)) { setV(valor == null ? '' : String(valor)); return }
    if (n !== valor) onGuardar(n)
  }
  return (
    <input value={v} onChange={ev => setV(ev.target.value.replace(/[^0-9]/g, ''))} onBlur={guardar}
      onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }}
      inputMode="numeric" placeholder="sin límite" title="Créditos de IA por mes (vacío = sin límite)"
      className="w-20 border border-neutral-200 rounded px-1.5 py-0.5 text-xs text-right num" />
  )
}

function Cuenta({ e, hoy, onGuardada, onError }: {
  e: Empresa; hoy: string; onGuardada: (msg: string) => void; onError: (msg: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [f, setF] = useState({ estado: e.estado, prueba_hasta: e.prueba_hasta ?? '', fundador: e.fundador })
  const ef = estadoEfectivo(e.estado, e.prueba_hasta, hoy)
  const esperando = ef === 'prueba' && e.prueba_dias != null      // aún no conecta ML (migración 067)
  const dias = e.prueba_hasta && ef === 'prueba' && !esperando
    ? Math.round((Date.parse(`${e.prueba_hasta}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000) : null

  const pastilla = (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${COLOR_ESTADO[ef]}`}>
        {ETIQUETA_ESTADO[ef]}
        {esperando ? ` · ${e.prueba_dias} días al conectar ML` : ef === 'prueba' && e.prueba_hasta ? ` · hasta ${ddmm(e.prueba_hasta)}` : ''}
        {ef === 'vencido' && e.estado === 'prueba' && e.prueba_hasta ? ` · el ${ddmm(e.prueba_hasta)}` : ''}
      </span>
      {esperando && e.prueba_hasta && <span className="text-[11px] text-neutral-500 whitespace-nowrap"
        title={`Si no conecta su cuenta de MercadoLibre, los días corren igual: vence a más tardar el ${ddmm(e.prueba_hasta)}`}>
        tope {ddmm(e.prueba_hasta)}</span>}
      {e.fundador && <span className="text-xs text-amber-700 whitespace-nowrap" title="Programa Fundadores: precio especial">⭐ Fundador</span>}
      {dias != null && dias <= 5 && <span className="text-[11px] text-amber-700 whitespace-nowrap">quedan {dias} día{dias === 1 ? '' : 's'}</span>}
    </span>
  )
  if (e.estado === 'propietario') return pastilla

  const guardar = async () => {
    const r = await fetch(`/api/plataforma/organizaciones/${e.organizacion_id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: f.estado, fundador: f.fundador, prueba_hasta: f.estado === 'prueba' ? (f.prueba_hasta || null) : undefined }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { onError(d.error ?? 'No se pudo guardar'); return }
    setEditando(false)
    onGuardada(`${e.organizacion}: cuenta actualizada. Sus usuarios lo notan en su próximo clic.`)
  }
  const sumar = (n: number) => {
    const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n)
    setF({ ...f, estado: 'prueba', prueba_hasta: d.toISOString().slice(0, 10) })
  }

  if (!editando) {
    return (
      <button onClick={() => { setF({ estado: e.estado, prueba_hasta: e.prueba_hasta ?? '', fundador: e.fundador }); setEditando(true) }}
        title="Cambiar la cuenta" className="text-left hover:opacity-80">{pastilla}</button>
    )
  }
  return (
    <div className="space-y-1.5 min-w-[13rem] text-xs">
      <select className={input} value={f.estado} onChange={ev => setF({ ...f, estado: ev.target.value as EstadoCuenta })}>
        <option value="prueba">En prueba</option>
        <option value="activo">Activo (paga)</option>
        <option value="vencido">Vencido (no entra)</option>
      </select>
      {f.estado === 'prueba' && (
        <div className="space-y-1">
          <input type="date" className={input} value={f.prueba_hasta} onChange={ev => setF({ ...f, prueba_hasta: ev.target.value })} />
          <div className="flex gap-1">
            {[DIAS_PRUEBA.normal, DIAS_PRUEBA.fundador].map(n => (
              <button key={n} type="button" onClick={() => sumar(n)} className="btn-ghost px-1.5 py-0.5 text-[11px]">hoy + {n}</button>
            ))}
          </div>
        </div>
      )}
      <label className="flex items-center gap-1.5 text-neutral-600">
        <input type="checkbox" checked={f.fundador} onChange={ev => setF({ ...f, fundador: ev.target.checked })} /> ⭐ Fundador
      </label>
      <div className="flex gap-1.5">
        <button onClick={guardar} className="btn-primary text-xs px-2 py-1">Guardar</button>
        <button onClick={() => setEditando(false)} className="btn-secondary text-xs px-2 py-1">Cancelar</button>
      </div>
    </div>
  )
}

/** Eliminar una empresa: muestra lo que se pierde y pide escribir su nombre (api DELETE, migración 068). */
function EliminarEmpresa({ e, onCancelar, onDesactivar, onEliminada }: {
  e: Empresa; onCancelar: () => void; onDesactivar: () => void; onEliminada: (msg: string) => void
}) {
  const [filas, setFilas] = useState<Record<string, number> | null>(null)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)

  useEffect(() => {
    fetch(`/api/plataforma/empresas/${e.id}`).then(r => r.json()).then(d => d.error ? setError(d.error) : setFilas(d.filas ?? {}))
      .catch(() => setError('No se pudo revisar la empresa'))
  }, [e.id])

  const NOMBRES: Record<string, string> = {
    sales: 'ventas', products: 'productos', purchase_orders: 'compras', import_orders: 'importaciones',
    inventory_movements: 'movimientos de inventario', ml_conexiones: 'cuentas de MercadoLibre conectadas',
    ml_preguntas: 'preguntas', ml_mensajes: 'mensajes', despacho_lotes: 'despachos', reportador_ordenes: 'órdenes reportadas',
    invoices: 'facturas', finance_movements: 'movimientos de finanzas', ia_uso: 'usos de IA (salen de Interno)',
  }
  const importantes = filas ? Object.entries(NOMBRES).filter(([t]) => filas[t]).map(([t, n]) => `${filas[t].toLocaleString('de-DE')} ${n}`) : []

  const eliminar = async () => {
    setBorrando(true); setError(null)
    const r = await fetch(`/api/plataforma/empresas/${e.id}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmar: texto }),
    })
    const d = await r.json().catch(() => ({}))
    setBorrando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo eliminar'); return }
    onEliminada(`"${e.nombre}" eliminada con todos sus datos.` +
      (d.usuarios_borrados ? ` Se borraron ${d.usuarios_borrados} usuario(s).` : '') +
      (d.usuarios_desactivados ? ` ${d.usuarios_desactivados} usuario(s) quedaron desactivados (tenían registros globales).` : ''))
  }

  return (
    <section className="bg-white rounded-xl border-2 border-red-200 shadow-sm p-4 space-y-3">
      <h2 className="text-sm font-semibold text-red-800">Eliminar “{e.nombre}”</h2>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
      {e.is_active ? (
        <p className="text-sm text-neutral-700">Primero hay que <b>desactivarla</b>: sus usuarios dejan de entrar. Si solo quieres que no entre más, con eso basta y sus datos se conservan.</p>
      ) : !filas ? <p className="text-sm text-neutral-400">Revisando sus datos…</p> : (
        <>
          <p className="text-sm text-neutral-700">
            Se borra <b>para siempre</b> la empresa con todo lo suyo
            {importantes.length ? <>: {importantes.join(' · ')}</> : ' (no tiene ventas, productos ni cuentas de ML)'}.
            También sus usuarios que no entren a otra empresa. <b>No se puede deshacer.</b>
          </p>
          <label className="text-xs text-neutral-600 block">Para confirmar escribe el nombre exacto: <b>{e.nombre}</b>
            <input className={input} value={texto} onChange={ev => setTexto(ev.target.value)} autoComplete="off" />
          </label>
        </>
      )}
      <div className="flex gap-2">
        {e.is_active && (
          <button onClick={onDesactivar} className="px-3 py-1.5 rounded text-sm bg-red-600 text-white">Desactivar ahora</button>
        )}
        {!e.is_active && filas && (
          <button onClick={eliminar} disabled={borrando || texto.trim() !== e.nombre}
            className="px-3 py-1.5 rounded text-sm bg-red-600 text-white disabled:opacity-40">{borrando ? 'Eliminando…' : 'Eliminar para siempre'}</button>
        )}
        <button onClick={onCancelar} className="btn-secondary text-sm">Cancelar</button>
      </div>
    </section>
  )
}

/** Reactivar una cuenta pausada (20-10): cuántos días le das, en un paso. Vuelve a "en prueba" hasta esa fecha. */
function Reactivar({ e, hoy, onCancelar, onListo, onError }: {
  e: Empresa; hoy: string; onCancelar: () => void; onListo: (msg: string) => void; onError: (msg: string) => void
}) {
  const sumar = (n: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
  const [hasta, setHasta] = useState(sumar(7))
  const [enviando, setEnviando] = useState(false)
  const guardar = async () => {
    setEnviando(true)
    const r = await fetch(`/api/plataforma/organizaciones/${e.organizacion_id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'prueba', prueba_hasta: hasta }),
    })
    const d = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { onError(d.error ?? 'No se pudo reactivar'); return }
    onListo(`${e.organizacion}: reactivada hasta el ${ddmm(hasta)}. Ya puede entrar.`)
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onCancelar} />
      <div className="relative w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-2xl">
        <h3 className="font-semibold">Reactivar {e.organizacion}</h3>
        <p className="text-sm text-neutral-600">¿Cuántos días le das? Puede entrar desde ya y vuelve a pausarse sola al vencer.</p>
        <div className="flex gap-2">
          {[7, 15, 30].map(n => (
            <button key={n} type="button" onClick={() => setHasta(sumar(n))}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${hasta === sumar(n) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700'}`}>
              {n} días
            </button>
          ))}
        </div>
        <label className="block text-xs text-neutral-500">O hasta el día
          <input type="date" value={hasta} min={hoy} onChange={ev => setHasta(ev.target.value)} className={input} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancelar} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={guardar} disabled={enviando || !hasta || hasta < hoy} className="btn-primary text-sm disabled:opacity-50">
            {enviando ? 'Reactivando…' : `Reactivar hasta el ${hasta ? ddmm(hasta) : '—'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Historia de la cuenta (mig. 106): creada, conectó ML, pausas y reactivaciones, de la más vieja a la más nueva. */
function Historia({ organizacionId }: { organizacionId: number }) {
  const [d, setD] = useState<{ creada: string; conectada: string | null; eventos: { fecha: string; tipo: string; detalle: string | null; por: string | null }[] } | null>(null)
  useEffect(() => {
    let vivo = true
    fetch(`/api/plataforma/organizaciones/${organizacionId}`).then(r => r.ok ? r.json() : null).then(x => { if (vivo) setD(x) })
    return () => { vivo = false }
  }, [organizacionId])
  if (!d) return <p className="text-xs text-neutral-400">Cargando…</p>
  const fecha = (f: string) => new Date(f).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Caracas' })
  const MOTIVO: Record<string, string> = { corte_fundadores: 'no conectó MercadoLibre a tiempo (corte)', manual: 'la pausaste tú', plan: 'venció su plan' }
  const texto = (t: string, det: string | null) =>
    t === 'pausada' ? `⏸ Pausada: ${MOTIVO[det ?? ''] ?? 'terminó su prueba'}`
    : t === 'reactivada' ? `▶️ Reactivada${det ? ` hasta el ${ddmm(det)}` : ''}`
    : t === 'activa' ? '✅ Pasó a pagar'
    : t === 'fecha' ? `📅 Vencimiento cambiado al ${det ? ddmm(det) : '—'}`
    : t === 'apagada' ? `⛔ Apagada a mano${det ? ` (${det})` : ''}`
    : t === 'encendida' ? `🔌 Encendida de nuevo${det ? ` (${det})` : ''}`
    : t
  const filas: { f: string; t: string; por?: string | null }[] = [
    { f: d.creada, t: '🆕 Creada' },
    ...(d.conectada ? [{ f: d.conectada, t: '🔗 Conectó MercadoLibre' }] : []),
    ...d.eventos.map(v => ({ f: v.fecha, t: texto(v.tipo, v.detalle), por: v.por })),
  ].sort((a, b) => a.f.localeCompare(b.f))
  return (
    <ol className="space-y-1 text-xs">
      {filas.map((x, i) => (
        <li key={i} className="flex gap-2">
          <span className="w-20 shrink-0 tabular-nums text-neutral-400">{fecha(x.f)}</span>
          <span className="text-neutral-700">{x.t}{x.por ? <span className="text-neutral-400"> · {x.por}</span> : null}</span>
        </li>
      ))}
      {!d.conectada && <li className="text-neutral-400">Todavía no conecta MercadoLibre.</li>}
    </ol>
  )
}
