'use client'
// Línea de estado de Pagos ME (18-11, el dueño: «mucho ruido antes de los productos»): UNA línea con la PC, sus cuentas,
// la última traída si salió bien y ⚙ Conexión. Debajo, solo los avisos que piden hacer algo (cuenta desconectada, Chrome
// sin conectar, cuenta del portal equivocada). La MISMA en Pagos ME y en Ventas → Por confirmar.
import Link from '@/components/ui/Link'
import type { ReactNode } from 'react'

export interface Latido { perfil: string; cuenta: string | null; cuenta_portal?: string | null; verificacion?: string | null; visto_at: string; conectado: boolean }
interface Resultado { ok: boolean; nuevas: number; at: string }
export interface DatosVigilante {
  vigilante: {
    latidos: Latido[]
    pedido: { pedido_at: string; vigente: boolean; resultados: Record<string, Resultado> } | null
  }
  cuentasML?: { nickname: string; estado: string; con_navegador: boolean }[]
}

export const CONEXION_HREF = '/pagos-me?vista=conexion'

const hora = (s: string | null) => s ? new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit',
}) : '—'

/** ¿Trayendo ahora? Mismo cálculo que tenía Pagos ME. */
export function trayendo(d: DatosVigilante) {
  const pedido = d.vigilante.pedido
  const despertador = d.vigilante.latidos.find(l => l.perfil === 'DESPERTADOR')
  const perfiles = d.vigilante.latidos.filter(l => l.perfil !== 'DESPERTADOR')
  return !!pedido?.vigente && (despertador
    ? despertador.conectado && perfiles.some(l => !pedido.resultados[l.perfil])
    : perfiles.filter(l => l.conectado).some(l => !pedido.resultados[l.perfil]))
}

/** La última traída terminó completa y sin errores (entonces no hace falta la caja grande: va en la línea). */
export function traidaCompleta(d: DatosVigilante) {
  const pedido = d.vigilante.pedido
  if (!pedido || trayendo(d)) return false
  const res = Object.values(pedido.resultados)
  const perfiles = d.vigilante.latidos.filter(l => l.perfil !== 'DESPERTADOR')
  return res.length > 0 && res.every(r => r.ok) && perfiles.every(l => !!pedido.resultados[l.perfil])
}

export default function EstadoVigilante({ d, conexion, onAgregar, extra }: {
  d: DatosVigilante
  /** Pagos ME: el botón despliega el panel ahí mismo. Por confirmar: lleva a la página de conexión. */
  conexion: { abierto: boolean; onToggle: () => void } | { href: string } | null
  /** «Agregar» en una cuenta sin su Chrome (si no se puede aquí, lleva a la conexión). */
  onAgregar?: (cuenta: string) => void
  /** Lo que va debajo (el panel de conexión desplegado, códigos, etc.). */
  extra?: ReactNode
}) {
  const despertador = d.vigilante.latidos.find(l => l.perfil === 'DESPERTADOR')
  const perfiles = d.vigilante.latidos.filter(l => l.perfil !== 'DESPERTADOR')
  const pedido = d.vigilante.pedido
  const completa = traidaCompleta(d)
  const res = pedido ? Object.entries(pedido.resultados) : []
  const nuevas = res.reduce((n, [, r]) => n + (r.nuevas ?? 0), 0)
  const fin = res.map(([, r]) => r.at).sort().pop() ?? pedido?.pedido_at ?? null
  const nombre = (perfil: string) => d.vigilante.latidos.find(l => l.perfil === perfil)?.cuenta ?? perfil
  const faltanCuentas = (d.cuentasML ?? []).filter(c => c.estado !== 'activa' || !c.con_navegador)
  const hrefConexion = conexion && 'href' in conexion ? conexion.href : CONEXION_HREF

  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs text-neutral-600">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {despertador ? (
          <span className="flex items-center gap-1.5">
            {/* 14-11: si el despertador no corre pero Chrome sí (la extensión tiene señal), igual trae: naranja. Rojo: ninguno. */}
            <span className={`h-2 w-2 rounded-full ${despertador.conectado ? 'bg-green-500' : perfiles.some(l => l.conectado) ? 'bg-orange-400' : 'bg-red-400'}`} />
            {despertador.conectado ? <span className="text-neutral-800">PC en espera</span>
              : perfiles.some(l => l.conectado)
                ? <span className="text-orange-700" title="Con Chrome abierto trae igual. Para que lo abra solo: reinicia la PC o abre instalar-despertador.cmd">Chrome conectado · el despertador no corre (reinicia la PC)</span>
                : <span className="text-red-700">PC sin señal desde {hora(despertador.visto_at)} (¿apagada?)</span>}
            {perfiles.length > 0 && <span className="text-neutral-400">· {perfiles.map(l => l.cuenta ?? l.perfil).join(' · ')}</span>}
          </span>
        ) : perfiles.length === 0 ? (
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /><span className="text-amber-700">ninguna PC conectada todavía</span></span>
        ) : perfiles.map(l => (
          <span key={l.perfil} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${l.conectado ? 'bg-green-500' : 'bg-red-400'}`} />
            {l.cuenta ?? l.perfil} <span className="text-neutral-400">{l.conectado ? 'conectado' : `sin señal desde ${hora(l.visto_at)}`}</span>
          </span>
        ))}
        {completa && (
          <span className="text-emerald-700" title={res.map(([p, r]) => `${nombre(p)}: ${r.nuevas} nuevas`).join(' · ')}>
            ✓ traído {hora(fin)} · {nuevas === 0 ? 'nada nuevo' : `${nuevas} pago${nuevas === 1 ? '' : 's'} nuevo${nuevas === 1 ? '' : 's'}`}
          </span>
        )}
        {conexion && ('href' in conexion
          ? <Link href={conexion.href} className="ml-auto font-medium text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline">⚙ Conexión</Link>
          : <button type="button" onClick={conexion.onToggle} aria-expanded={conexion.abierto}
              className={`ml-auto font-medium underline-offset-2 hover:underline ${conexion.abierto ? 'text-neutral-900' : 'text-neutral-500 hover:text-neutral-900'}`}>
              ⚙ Conexión {conexion.abierto ? '▴' : '▾'}</button>)}
      </div>
      {d.vigilante.latidos.filter(l => l.verificacion === 'distinta').map(l => (
        <div key={l.perfil} className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-red-800">
          ⚠ Un Chrome de la PC tiene abierta la cuenta de MercadoEnvíos <b>{l.cuenta_portal ?? l.perfil}</b>, que no corresponde a ninguna
          cuenta de MercadoLibre conectada. No se trae nada de ella: entra al portal con la cuenta correcta en ese Chrome.
        </div>
      ))}
      {/* Cuentas de ML sin su Chrome (o desconectadas): no se traen sus pagos ni sus guías (29-10). Solo si ya hay una PC. */}
      {perfiles.length > 0 && faltanCuentas.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {faltanCuentas.map(c => c.estado !== 'activa' ? (
            <span key={c.nickname} className="text-red-700">
              ⚠ <b>{c.nickname}</b> está desconectada de MercadoLibre: no se traen sus guías.{' '}
              <a href="/cuentas-ml" className="font-medium underline">Conectarla</a>
            </span>
          ) : (
            <span key={c.nickname} className="text-amber-700">
              ○ <b>{c.nickname}</b> no tiene su Chrome conectado: no se traen sus pagos ni guías.{' '}
              {onAgregar
                ? <button type="button" onClick={() => onAgregar(c.nickname)} className="font-medium underline">Agregar</button>
                : <Link href={hrefConexion} className="font-medium underline">Agregar</Link>}
            </span>
          ))}
        </div>
      )}
      {extra}
    </div>
  )
}
