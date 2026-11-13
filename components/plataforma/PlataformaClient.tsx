'use client'
import { useCallback, useEffect, useState } from 'react'
import { usePrimera } from '@/lib/primera'
import { useSession } from 'next-auth/react'
import { PageHeader } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import PersonasEmpresa from './CuentasPanel'
import ProgramasPanel from './ProgramasPanel'
import AvisosTelegramCard from './AvisosTelegramCard'
import InternoPanel from './InternoPanel'
import IaClientesPanel from './IaClientesPanel'
import NovedadesCard from './NovedadesCard'
import AprendizajePanel from './AprendizajePanel'
import AdopcionPanel, { type FiltroUso, type ResumenCobro } from './AdopcionPanel'
import PlanCliente from './PlanCliente'
import SoportePanel from './SoportePanel'
import CobrosPanel from './CobrosPanel'
import { soloRadar as soloRadarModulos } from '@/lib/modulos'
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
  personas?: string | null   // usuario, nombre y correo de su gente (para el buscador)
  estado: EstadoCuenta
  prueba_hasta: string | null
  prueba_dias: number | null
  fundador: boolean
  interna?: boolean          // mig. 172: cuenta interna (EmpresaPruebas, DEMO): no paga ni vence
  origen?: string | null      // 'autoregistro' = se registró solo en /registro (26-10); 'radar' = desde el Radar (29-10)
  registro?: { correo?: string; whatsapp?: string; telegram?: string | null } | null
  ia_limite_mes: number | null
  motivo_pausa: string | null
  pausa_fecha: string | null
  plan: 'esencial' | 'automatizaciones' | 'completo' | null   // plan pagado (mig 138, Plataforma → Plan y pagos)
  escalon: number | null
  ciclo: 'mensual' | 'trimestral' | null
  plan_hasta: string | null
  radar_pro_hasta: string | null
  radar_mes_hasta?: string | null
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
const puedeEntrar = (e: Empresa, hoy: string) => e.is_active && (!!e.interna || estadoEfectivo(e.estado, e.prueba_hasta, hoy) !== 'vencido')
const diasHasta = (f: string, hoy: string) => Math.round((Date.parse(`${f}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000)

/** El estado de la cuenta en una frase (lo que se lee en la lista). */
function fraseCuenta(e: Empresa, hoy: string): { icono: string; texto: string; extra?: string; alerta?: boolean } {
  const est = estadoEfectivo(e.estado, e.prueba_hasta, hoy)
  if (!e.is_active) return { icono: '⛔', texto: 'Apagada a mano', extra: 'nadie puede entrar' }
  if (est === 'propietario') return { icono: '🏠', texto: 'Tu empresa' }
  if (e.interna) return { icono: '🧪', texto: 'Interna', extra: 'no paga ni vence' }
  if (est === 'activo') {
    // Con plan registrado (mig 138): hasta cuándo pagó; al día siguiente del vencimiento el cron la pausa.
    const d = e.plan_hasta ? diasHasta(e.plan_hasta, hoy) : null
    const pago = e.plan_hasta ? `pagado hasta ${ddmm(e.plan_hasta)}${d! <= 3 ? ` · ${d! < 0 ? 'vencido' : d === 0 ? 'vence hoy' : `quedan ${d} día${d === 1 ? '' : 's'}`}` : ''}` : null
    return { icono: d != null && d <= 3 ? '⚠️' : '✅', texto: 'Pagando', extra: [pago, e.cuentas ? 'ML conectado' : 'sin ML'].filter(Boolean).join(' · '), alerta: d != null && d <= 3 }
  }
  // Se registró desde el Radar (29-10): solo el módulo Radar; qué días entra lo decide su grupo en el Radar.
  if (e.origen === 'radar' && est === 'prueba' && soloRadarModulos(e.modulos)) return { icono: '📡', texto: 'Solo Radar', extra: 'se registró desde el Radar' }
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
      {(e.origen === 'autoregistro' || e.origen === 'radar') && e.registro && (
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

export default function PlataformaClient({ empresaActual, inicial = null }: { empresaActual: number
  /** 12-11 (rapidez): empresas y el resumen de Hoy, ya en el HTML. */
  inicial?: { empresas: unknown; cobros: unknown; visitas: unknown } | null }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [modulos, setModulos]   = useState<Record<string, string>>({})
  const [nueva, setNueva]       = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [aviso, setAviso]       = useState<string | null>(null)
  // 5 pestañas (17-10, cada cosa en un solo lugar): Hoy (resumen + los más activos) · Clientes (por actividad,
  // ficha al tocar) · Fundadores (la lista arriba, el programa plegado) · Contenido (Novedades y videos, lo que
  // ven los clientes) · Interno (IA, Telegram, cuentas de personas).
  // ?soporte=ID (el botón del aviso de Telegram) abre la bandeja de Soporte en ese caso.
  const [casoSoporte, setCasoSoporte] = useState<number | null>(null)
  // 12-11 (el dueño, fase 1): Uso (quién usa y cuánto: antes Hoy + Clientes) y Cuentas y cobros (vencimientos, quién paga
  // y los pagos: antes repartido en Hoy, Clientes y Cobros).
  // 12-11 (fase 2): Novedades y cursos (antes Contenido), Programas y promos (precios vigentes + historial de Fundadores
  // y Despegue) e Interno con todo lo técnico adentro (IA, Soporte, Telegram, cuentas de personas).
  const [vista, setVista]       = useState<'uso' | 'novedades' | 'programas' | 'interno'>('uso')
  const [interno, setInterno]   = useState<'ia' | 'auto' | 'soporte' | 'telegram'>('ia')
  // 13-11 (el dueño, un solo panel por cliente): «Clientes» junta Uso y Cuentas y cobros. Los pagos por revisar se abren
  // desde «Por atender»; Vencen/Pagando son filtros de la lista; las personas viven en la ficha y el buscador las encuentra.
  const [filtroUso, setFiltroUso] = useState<FiltroUso>('todos')
  const [verPagos, setVerPagos] = useState(false)
  const verSoporte = () => { setVista('interno'); setInterno('soporte') }
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('soporte'))
    if (id) { setCasoSoporte(id); setVista('interno'); setInterno('soporte') }
    // ?vista=cobros: el botón del aviso de Telegram de un pago reportado (mig. 141).
    if (new URLSearchParams(window.location.search).get('vista') === 'cobros') setVerPagos(true)
  }, [])
  const [hoy, setHoy]           = useState('')
  const [borrar, setBorrar]     = useState<Empresa | null>(null)
  const [abierta, setAbierta]   = useState<number | null>(null)
  const [eligiendoRadar, setEligiendoRadar] = useState<number | null>(null)   // empresa a la que se le está prendiendo el Radar
  const [verInactivos, setVerInactivos] = useState(false)
  const [verRadar, setVerRadar] = useState(false)
  const [reactivar, setReactivar] = useState<Empresa | null>(null)
  const [buscar, setBuscar]     = useState('')
  const confirm = useConfirm()

  // Lo que espera por ti (franja de Uso y número en las pestañas): pagos reportados y casos de soporte abiertos.
  const [pendientes, setPendientes] = useState<{ pagos: number; casos: number }>(() => ({
    pagos: ((inicial?.cobros as { pendientes?: unknown[] } | null)?.pendientes ?? []).length, casos: 0 }))
  const [cobro, setCobro] = useState<ResumenCobro | null>(() => resumenCobro(inicial?.cobros))
  const leerPendientes = useCallback(() => {
    Promise.all([
      fetch('/api/plataforma/cobros').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/plataforma/casos-soporte').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([c, s]) => {
      setPendientes(p => ({
        pagos: c?.pendientes ? c.pendientes.length : p.pagos,
        casos: s?.casos ? s.casos.filter((x: { estado: string }) => x.estado === 'abierto').length : p.casos,
      }))
      const r = resumenCobro(c)
      if (r) setCobro(r)
    })
  }, [])
  useEffect(() => { leerPendientes(); const t = setInterval(leerPendientes, 120_000); return () => clearInterval(t) }, [leerPendientes])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const primera = usePrimera(inicial?.empresas as any)
  const cargar = useCallback(async () => {
    let d = primera() as any // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!d) {
      const r = await fetch('/api/plataforma/empresas')
      d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    }
    setEmpresas(d.empresas); setModulos(d.modulos); setHoy(d.hoy)
  }, [primera])
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

  // 12-11 (mig. 172): interna = no paga ni vence y no suma en pagos, ingresos ni clientes.
  const marcarInterna = async (e: Empresa, interna: boolean) => {
    if (!await confirm({
      title: interna ? `${e.organizacion}: marcar como interna` : `${e.organizacion}: quitar «Interna»`, confirmText: interna ? 'Marcar' : 'Quitar',
      message: interna ? 'No paga ni vence, y no suma en pagos, ingresos ni clientes. Por dentro se ve igual que un cliente.'
        : 'Vuelve a contar como cliente: vence según su plan o su prueba.',
    })) return
    setError(null); setAviso(null)
    const r = await fetch(`/api/plataforma/organizaciones/${e.organizacion_id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interna }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo guardar'); return }
    setAviso(interna ? `${e.organizacion}: interna.` : `${e.organizacion}: ya no es interna.`)
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
    // Radar: al prenderlo se elige si es acceso completo o solo el día de prueba (radar_dia); al apagarlo se va todo.
    if (m === 'radar') {
      if (!enciende) return actualizar(e, { modulos: e.modulos.filter(x => x !== 'radar' && x !== 'radar_dia') })
      return setEligiendoRadar(e.id)
    }
    actualizar(e, { modulos: enciende ? [...e.modulos, m] : e.modulos.filter(x => x !== m) })
  }
  const prenderRadar = (e: Empresa, soloDia: boolean) => {
    setEligiendoRadar(null)
    actualizar(e, { modulos: [...e.modulos.filter(x => x !== 'radar' && x !== 'radar_dia'), 'radar', ...(soloDia ? ['radar_dia'] : [])] })
  }

  const sel = empresas.find(e => e.id === abierta) ?? null
  // Cobros trae la organización: se abre su primera empresa (la ficha muestra plan, usuarios y pagos de la cuenta).
  const abrirEmpresa = (id: number) => { setError(null); setAviso(null); setAbierta(id) }
  const abrirOrganizacion = (orgId: number) => {
    const e = empresas.filter(x => x.organizacion_id === orgId).sort((a, b) => a.id - b.id)[0]
    if (e) abrirEmpresa(e.id)
  }
  // Escape cierra el panel
  useEffect(() => {
    if (abierta == null) return
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setAbierta(null) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [abierta])
  const q = buscar.trim().toLowerCase()
  const coincide = (e: Empresa) => !q || e.nombre.toLowerCase().includes(q) || (e.admins ?? '').toLowerCase().includes(q) || e.organizacion.toLowerCase().includes(q)
    || (e.personas ?? '').toLowerCase().includes(q)
  // 12-11 (el dueño): los de solo Radar no piden seguimiento: van plegados aparte, como los inactivos.
  // 13-11: con la prueba de 15 días (más módulos que el Radar) ya no cuenta como «Solo Radar».
  const soloRadar = (e: Empresa) => e.origen === 'radar' && e.estado === 'prueba' && soloRadarModulos(e.modulos)
  const activas = empresas.filter(e => puedeEntrar(e, hoy) && !soloRadar(e) && coincide(e))
  const radares = empresas.filter(e => puedeEntrar(e, hoy) && soloRadar(e) && coincide(e))
  const totalRadar = empresas.filter(e => puedeEntrar(e, hoy) && soloRadar(e))
  const mostrarRadar = verRadar || (!!q && radares.length > 0)
  const inactivas = empresas.filter(e => !puedeEntrar(e, hoy) && coincide(e))
  const totalInactivas = empresas.filter(e => !puedeEntrar(e, hoy))
  const clientesActivos = empresas.filter(e => puedeEntrar(e, hoy) && !soloRadar(e) && e.estado !== 'propietario' && !e.interna).length
  const mostrarInactivas = verInactivos || (!!q && inactivas.length > 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Plataforma"
        subtitle="Tus clientes, cómo usan el sistema y lo interno de El Comerciante Digital. Solo lo ves tú."
        actions={vista === 'uso'
          ? <button onClick={() => { setNueva(true); setError(null) }} className="btn-primary text-sm">+ Nueva empresa</button>
          : undefined}
      />

      {/* En celular las 6 pestañas no caben: se deslizan de lado dentro de su línea (antes ensanchaban la página). */}
      <div className="flex gap-1 shadow-[inset_0_-1px_0_#e5e5e5] overflow-x-auto [scrollbar-width:none]">
        {([['uso', `Clientes${empresas.length ? ` (${clientesActivos})` : ''}${pendientes.pagos ? ` · 💳 ${pendientes.pagos}` : ''}`],
           ['novedades', 'Novedades y cursos'], ['programas', 'Programas y promos'], ['interno', `Interno${pendientes.casos ? ` (${pendientes.casos})` : ''}`]] as const).map(([v, t]) => (
          <button key={v} onClick={() => setVista(v)}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm border-b-2 ${vista === v ? 'border-neutral-900 font-semibold' : 'border-transparent text-neutral-500'}`}>
            {t}
          </button>
        ))}
      </div>

      {vista === 'novedades' ? <div className="space-y-8"><NovedadesCard /><AprendizajePanel /></div>
        : vista === 'programas' ? <ProgramasPanel hoy={hoy} visitas={inicial?.visitas ?? null} />
        : vista === 'interno' ? <>
          <div className="flex flex-wrap gap-1.5">
            {([['ia', 'Gasto de IA'], ['auto', 'IA automática por cliente'],
               ['soporte', `Soporte${pendientes.casos ? ` (${pendientes.casos})` : ''}`], ['telegram', 'Telegram']] as const).map(([k, t]) => (
              <button key={k} onClick={() => setInterno(k)}
                className={`px-3 py-1 rounded-full text-sm border ${interno === k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-600'}`}>{t}</button>
            ))}
          </div>
          {interno === 'ia' ? <InternoPanel /> : interno === 'auto' ? <IaClientesPanel />
            : interno === 'soporte' ? <SoportePanel inicial={casoSoporte} /> : <AvisosTelegramCard />}
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
          {totalRadar.length > 0 && <span className="text-neutral-400"> · {totalRadar.length} solo Radar</span>}
          {totalInactivas.length > 0 && <span className="text-neutral-400"> · {totalInactivas.length} inactivos guardados abajo</span>}
        </p>
        <input type="search" value={buscar} onChange={ev => setBuscar(ev.target.value)} placeholder="Buscar empresa, usuario, nombre o correo…"
          className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-80" />
      </div>

      {/* Lo que espera por ti: solo aparece si hay algo. */}
      {(() => {
        const vencenYa = activas.filter(e => e.estado !== 'propietario' && !e.interna && (() => {
          const f = e.estado === 'activo' ? e.plan_hasta : e.prueba_dias == null ? e.prueba_hasta : null
          return !!f && diasHasta(f, hoy) <= 1
        })())
        const items: [string, () => void][] = []
        if (pendientes.pagos) items.push([`💳 ${pendientes.pagos} pago${pendientes.pagos === 1 ? '' : 's'} por revisar`, () => setVerPagos(v => !v)])
        if (pendientes.casos) items.push([`🆘 ${pendientes.casos} caso${pendientes.casos === 1 ? '' : 's'} de soporte abierto${pendientes.casos === 1 ? '' : 's'}`, verSoporte])
        if (vencenYa.length) items.push([`⏳ ${vencenYa.length} vence${vencenYa.length === 1 ? '' : 'n'} hoy o mañana`, () => setFiltroUso('por_vencer')])
        if (!items.length) return null
        return (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            <span className="font-medium">Por atender:</span>
            {items.map(([t, ir]) => (
              <button key={t} onClick={ir} className="rounded-full bg-white px-3 py-1 text-xs font-medium ring-1 ring-inset ring-amber-200 hover:bg-amber-100">{t} →</button>
            ))}
          </div>
        )
      })()}

      {/* Una sola lista (2026-10-15): cada empresa con su estado de cuenta y su uso del sistema; la ficha
          (módulos, IA, acciones) se abre al tocarla, como antes. */}
      {verPagos && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
          <div className="mb-2 flex justify-end"><button onClick={() => setVerPagos(false)} className="text-xs text-neutral-500 hover:text-neutral-800">Ocultar ✕</button></div>
          <CobrosPanel modo="pendientes" inicial={inicial?.cobros ?? null} onCambio={() => { leerPendientes(); cargar() }} onAbrir={abrirOrganizacion} />
        </div>
      )}

      <AdopcionPanel filtro={filtroUso} onFiltro={setFiltroUso} cobro={cobro} abierta={abierta} onAbrir={id => { setError(null); setAviso(null); setAbierta(id) }}
        base={activas.map(e => ({
          id: e.id, nombre: e.nombre, activa: true, pagando: e.estado === 'activo', prueba: e.estado === 'prueba',
          porVencer: (e.estado === 'prueba' && e.prueba_dias == null && !!e.prueba_hasta && diasHasta(e.prueba_hasta, hoy) <= 5)
            || (e.estado === 'activo' && !!e.plan_hasta && diasHasta(e.plan_hasta, hoy) <= 3),
          detalle: `${e.country}${e.organizacion !== e.nombre ? ` · ${e.organizacion}` : ''}${e.admins ? ` · ${e.admins}` : ''}`,
          cuenta: <FraseCuenta e={e} hoy={hoy} />,
          extra: e.inventario ? <LineaInventario u={e.inventario} conPagos={e.modulos.includes('pagos_me')} /> : undefined,
        }))} />

      {/* Solo Radar (12-11): plegados como los inactivos. Con la búsqueda se abren solos si hay coincidencias. */}
      {totalRadar.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white">
          <button onClick={() => setVerRadar(v => !v)} aria-expanded={mostrarRadar}
            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-neutral-600 hover:bg-neutral-50">
            <span>{mostrarRadar ? '▾' : '▸'} 📡 Solo Radar: <b className="text-neutral-800">{totalRadar.length}</b></span>
            <span className="text-xs text-neutral-400">{mostrarRadar ? 'Ocultar' : 'Ver todos'}</span>
          </button>
          {mostrarRadar && (
            <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
              {radares.length === 0 && <li className="px-4 py-3 text-sm text-neutral-400">Ninguno coincide con la búsqueda.</li>}
              {radares.map(e => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                  <button onClick={() => { setError(null); setAviso(null); setAbierta(e.id) }} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-medium text-neutral-800 hover:underline">{e.nombre}</div>
                    <div className="truncate text-[11px] text-neutral-400">{e.country}{e.admins ? ` · ${e.admins}` : ''}</div>
                  </button>
                  <FraseCuenta e={e} hoy={hoy} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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

      {/* Lo de cobros que se mira poco: plegado al final. */}
      <CobrosPanel modo="extras" inicial={inicial?.cobros ?? null} onCambio={leerPendientes} onAbrir={abrirOrganizacion} />
      </>}

      {/* 13-11: la ficha se abre desde la lista, los pagos por revisar y el buscador. */}
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
                    <button onClick={() => marcarInterna(sel, !sel.interna)} className="btn-secondary text-xs"
                      title="Interna: no paga ni vence y no suma en pagos, ingresos ni clientes. Por dentro se ve igual que un cliente.">
                      {sel.interna ? 'Quitar «Interna»' : '🧪 Marcar como interna'}</button>
                    {sel.interna ? null : puedeEntrar(sel, hoy)
                      ? <button onClick={() => pausar(sel)} className="btn-secondary text-xs">Pausar (no podrá entrar)</button>
                      : <button onClick={() => setReactivar(sel)} className="btn-primary text-xs">Reactivar…</button>}
                  </div>
                )}
                {/* 13-11 (el dueño): prueba de 15 días para quien entró por otro lado (Radar) o ya la venció. */}
                {sel.estado !== 'propietario' && sel.estado !== 'activo' && !sel.interna && sel.is_active && (
                  <DarPrueba key={sel.organizacion_id} e={sel} hoy={hoy} onListo={msg => { setError(null); setAviso(msg); cargar() }} onError={setError} />
                )}
                {sel.estado !== 'propietario' && (
                  <details className="text-xs text-neutral-500">
                    <summary className="cursor-pointer select-none">Cambiar estado, fecha o Fundador a mano</summary>
                    <div className="mt-2"><Cuenta e={sel} hoy={hoy} onGuardada={msg => { setAviso(msg); cargar() }} onError={setError} /></div>
                  </details>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">Personas ({sel.usuarios})</h3>
                <PersonasEmpresa key={sel.id} empresaId={sel.id} />
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">Plan y pagos</h3>
                <PlanCliente key={sel.organizacion_id} hoy={hoy}
                  d={{ organizacion_id: sel.organizacion_id, fundador: sel.fundador, estado: sel.estado, plan: sel.plan, escalon: sel.escalon,
                    ciclo: sel.ciclo, plan_hasta: sel.plan_hasta, radar_pro_hasta: sel.radar_pro_hasta, radar_mes_hasta: sel.radar_mes_hasta ?? null,
                    empresas: empresas.filter(x => x.organizacion_id === sel.organizacion_id).map(x => ({ id: x.id, nombre: x.nombre })) }}
                  onCambio={msg => { setError(null); setAviso(msg); cargar() }} onError={msg => { setAviso(null); setError(msg) }} />
              </section>


              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1.5">Módulos</h3>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(modulos).filter(([m]) => m !== 'radar_dia').map(([m, desc]) => (
                    <button key={m} onClick={() => alternarModulo(sel, m)} title={desc}
                      className={`px-2 py-0.5 rounded-full text-xs border ${
                        sel.modulos.includes(m) ? 'bg-green-100 border-green-200 text-green-800' : 'bg-white border-neutral-200 text-neutral-400'
                      }`}>
                      {sel.modulos.includes(m) ? '✓ ' : ''}{m}{m === 'radar' && sel.modulos.includes('radar_dia') ? ' (solo día de prueba)' : ''}
                    </button>
                  ))}
                </div>
                {eligiendoRadar === sel.id && (
                  <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-xs space-y-2">
                    <p className="font-medium text-neutral-700">¿Cómo entra al Radar?</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => prenderRadar(sel, true)} className="btn-primary text-xs">Solo el día de prueba</button>
                      <button onClick={() => prenderRadar(sel, false)} className="btn-secondary text-xs">Acceso completo (pagado)</button>
                      <button onClick={() => setEligiendoRadar(null)} className="text-neutral-500 hover:text-neutral-800 px-2">Cancelar</button>
                    </div>
                    <p className="text-neutral-500">Día de prueba: sus usuarios entran solo los días del grupo de prueba vigente del Radar (Admin → Grupos). Para pasarlo a completo, apaga y vuelve a prender radar.</p>
                  </div>
                )}
                <p className="text-xs text-neutral-400 mt-1.5">Tocar un módulo lo prende o lo apaga (pasa el mouse encima para ver qué es).</p>
              </section>

              <section className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Créditos de IA</h3>
                  <p className="text-xs text-neutral-400">Vacío = sin límite. Con un número, el cliente usa su saldo (no vence; se suma en Plan y pagos → Recargar, $0 = regalo). En tu empresa, el número es el tope del mes.</p>
                </div>
                <LimiteIA key={`${sel.id}-${sel.ia_limite_mes}`} valor={sel.ia_limite_mes} onGuardar={v => actualizar(sel, { ia_limite_mes: v })} />
              </section>

              {/* Lo que se mira poco: plegado. */}
              {sel.estado !== 'propietario' && (
                <details className="group border-t border-neutral-100 pt-3">
                  <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-neutral-500">Historia</summary>
                  <div className="mt-2"><Historia key={`${sel.organizacion_id}-${sel.estado}-${sel.prueba_hasta}-${sel.is_active}`} organizacionId={sel.organizacion_id} /></div>
                </details>
              )}
              {sel.id !== empresaActual && sel.is_active && (
                <details className="group border-t border-neutral-100 pt-3">
                  <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-neutral-500">Ver como cliente</summary>
                  <div className="mt-2"><VerComoCliente key={sel.id} empresaId={sel.id} /></div>
                </details>
              )}

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
    </div>
  )
}

/** Lo cobrado para las cifras de Clientes (de /api/plataforma/cobros): este mes y lo que entra al mes con los planes de hoy. */
function resumenCobro(c: unknown): ResumenCobro | null {
  const d = c as { ingresos?: { mes: number; pagos_mes: number; anterior: number }; pagando?: { monto: number | null; ciclo: string | null }[] } | null
  if (!d?.ingresos) return null
  const recurrente = (d.pagando ?? []).reduce((a, p) => a + (p.monto ?? 0) / (p.ciclo === 'trimestral' ? 3 : 1), 0)
  return { ...d.ingresos, recurrente }
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
            {Object.entries(modulos).filter(([m]) => m !== 'radar_dia').map(([m, desc]) => (
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
      inputMode="numeric" placeholder="sin límite" title="Vacío = sin límite; con número = usa su saldo (la propietaria: tope del mes)"
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
    : t === 'activa' ? `✅ Pasó a pagar${det ? `: ${det.replace(/(\d{4})-(\d{2})-(\d{2})$/, '$3/$2')}` : ''}`
    : t === 'renovada' ? `🔁 Renovó${det ? `: ${det.replace(/(\d{4})-(\d{2})-(\d{2})$/, '$3/$2')}` : ''}`
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

/** "Ver como cliente" (28-10): entrar a la empresa tal como la ve uno de sus usuarios, en solo lectura (lib/auth.ts,
 *  proxy.ts). Cada entrada queda registrada; el registro solo se ve aquí (el cliente no lo ve). */
function VerComoCliente({ empresaId }: { empresaId: number }) {
  const { update } = useSession()
  const [d, setD] = useState<{ usuarios: { id: number; username: string; nombre: string | null; role: string }[]
                               accesos: { inicio_at: string; fin_at: string | null; como_nombre: string | null; quien: string }[] } | null>(null)
  const [entrando, setEntrando] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    fetch(`/api/plataforma/soporte?empresa=${empresaId}`).then(r => r.ok ? r.json() : null).then(x => { if (vivo) setD(x) })
    return () => { vivo = false }
  }, [empresaId])
  const entrar = async (usuarioId: number) => {
    setEntrando(usuarioId)
    await update({ soporte: { empresaId, usuarioId } })
    window.location.assign('/')
  }
  if (!d) return <p className="text-xs text-neutral-400">Cargando…</p>
  const cuando = (f: string) => new Date(f).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' })
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">Entras a su cuenta y ves lo mismo que esa persona, en <b>solo lectura</b> (no se guarda nada). Queda registrado; el cliente no lo ve.</p>
      {d.usuarios.length === 0 ? <p className="text-xs text-neutral-400">No tiene usuarios activos.</p> : (
        <div className="flex flex-wrap gap-2">
          {d.usuarios.map(u => (
            <button key={u.id} onClick={() => entrar(u.id)} disabled={entrando !== null} className="btn-secondary text-xs disabled:opacity-60"
              title={`Ver el sistema como ${u.username} (${u.role === 'admin' ? 'administrador' : 'empleado'})`}>
              {entrando === u.id ? 'Entrando…' : `👁 ${u.nombre ?? u.username}`}
              <span className="ml-1 text-neutral-400">{u.role === 'admin' ? 'admin' : 'empleado'}</span>
            </button>
          ))}
        </div>
      )}
      {d.accesos.length > 0 && (
        <details className="text-xs text-neutral-500">
          <summary className="cursor-pointer select-none">Últimas entradas ({d.accesos.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {d.accesos.map((a, i) => (
              <li key={i}>{cuando(a.inicio_at)}{a.fin_at ? ` – ${cuando(a.fin_at).slice(-5)}` : ''} · {a.quien} como {a.como_nombre ?? '—'}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** 13-11 (el dueño): «Dar prueba de 15 días» a una cuenta del Radar (u otra sin plan): los módulos de la prueba gratis,
 *  con o sin Inventario, sin quitarle el Radar; 500 créditos de IA si nunca los recibió. */
function DarPrueba({ e, hoy, onListo, onError }: { e: Empresa; hoy: string; onListo: (m: string) => void; onError: (m: string) => void }) {
  // Prueba vigente (no Solo Radar): el botón la REINICIA (15 días desde hoy); los créditos no se repiten.
  const vigente = e.estado === 'prueba' && !!e.prueba_hasta && e.prueba_hasta >= hoy && !soloRadarModulos(e.modulos)
  const [abierto, setAbierto] = useState(false)
  const [inventario, setInventario] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const dar = async () => {
    setOcupado(true)
    const r = await fetch(`/api/plataforma/organizaciones/${e.organizacion_id}/prueba`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inventario }),
    })
    const d = await r.json().catch(() => ({}))
    setOcupado(false)
    if (!r.ok) { onError(d.error ?? 'No se pudo dar la prueba'); return }
    setAbierto(false)
    onListo(`${e.organizacion}: prueba de ${DIAS_PRUEBA.normal} días hasta el ${String(d.hasta).split('-').reverse().slice(0, 2).join('/')}${inventario ? ', con Inventario' : ''}. Ya puede entrar al Sistema.`)
  }
  if (!abierto) return vigente ? (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
      <span>Vence el {ddmm(e.prueba_hasta!)}</span>
      <button onClick={() => setAbierto(true)} className="btn-secondary text-xs"
        title="Vuelve a empezar la prueba: 15 días desde hoy. Los créditos de IA no se repiten.">
        🔄 Reiniciar prueba ({DIAS_PRUEBA.normal} días desde hoy)</button>
    </div>
  ) : (
    <button onClick={() => setAbierto(true)} className="btn-secondary mb-2 text-xs"
      title="Prueba gratis de 15 días con los módulos de Automatizaciones (y si quieres Inventario). Lo que ya tiene (Radar) sigue.">
      🎁 Dar prueba de {DIAS_PRUEBA.normal} días</button>
  )
  return (
    <div className="mb-2 space-y-2 rounded-lg border border-lime-300 bg-lime-50/50 p-3 text-xs text-neutral-700">
      {vigente && <p className="text-neutral-500">Ya tiene prueba hasta el {ddmm(e.prueba_hasta!)}: se reinicia y vence {DIAS_PRUEBA.normal} días desde hoy.</p>}
      <p><b>Prueba de {DIAS_PRUEBA.normal} días desde hoy</b>: Preguntas, Mensajes, Despachos, Reportador, Stock, Pagos ME y la IA
        (500 créditos si nunca los tuvo). Lo que ya tiene, como el Radar, sigue igual.</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={inventario} onChange={ev => setInventario(ev.target.checked)} />
        Con Inventario <span className="text-neutral-400">(productos, ventas, compras)</span>
      </label>
      {inventario && <p className="text-amber-700">{AVISO_INVENTARIO}</p>}
      <div className="flex gap-2">
        <button onClick={dar} disabled={ocupado} className="btn-primary text-xs disabled:opacity-50">{ocupado ? 'Guardando…' : vigente ? 'Reiniciar prueba' : 'Dar prueba'}</button>
        <button onClick={() => setAbierto(false)} disabled={ocupado} className="btn-secondary text-xs">Cancelar</button>
      </div>
    </div>
  )
}
