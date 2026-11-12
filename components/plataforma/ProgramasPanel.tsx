'use client'
import { ESCALONES, PLANES, PLANES_PROXIMAMENTE, RECARGAS_IA, CREDITOS_PRUEBA, CUENTAS_INCLUIDAS, CUENTA_EXTRA,
  DESCUENTO_TRIMESTRAL, DESCUENTO_FUNDADOR, RADAR_PRO, precioRadarMes } from '@/lib/planes'
import { VisitasRegistro } from './ResumenPanel'
import DespegueCard from './DespegueCard'
import FundadoresPanel from './FundadoresPanel'

const usd = (n: number) => `$${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

/** Plataforma → Programas y promos (12-11, fase 2): arriba lo que está vigente (planes, precios, promos, prueba de 15
 *  días); abajo, plegado, el historial de los programas que ya pasaron (Despegue Grupo 1, Fundadores). Los precios se
 *  leen de lib/planes.ts (la misma fuente que /precios): aquí solo se miran. */
export default function ProgramasPanel({ hoy, visitas }: { hoy: string; visitas: unknown }) {
  const radar = precioRadarMes(hoy || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }))
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Vigente</h2>
          <p className="text-sm text-neutral-500">Lo que se ofrece hoy. Es lo mismo que muestra la página pública de precios.</p>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200">
                <th className="px-4 py-2.5 font-medium">Ventas al mes</th>
                {PLANES.map(p => (
                  <th key={p.id} className="px-3 py-2.5 font-medium text-right whitespace-nowrap">
                    {p.nombre}{PLANES_PROXIMAMENTE.includes(p.id) && <span className="ml-1 text-[10px] text-amber-700">próximamente</span>}
                  </th>
                ))}
                <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap" title="Se regalan una sola vez, con el primer plan">Créditos IA</th>
              </tr>
            </thead>
            <tbody>
              {ESCALONES.map(e => (
                <tr key={e.ventas} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2 text-neutral-800 whitespace-nowrap">{e.ventas}{e.nombre && <span className="ml-1 text-xs text-neutral-400">{e.nombre}</span>}</td>
                  {PLANES.map(p => <td key={p.id} className="px-3 py-2 text-right num">{usd(e.precios[p.id])}</td>)}
                  <td className="px-4 py-2 text-right num text-neutral-600">{e.creditos.toLocaleString('de-DE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-neutral-400 border-t border-neutral-100">
            {CUENTAS_INCLUIDAS} cuentas de ML incluidas, cada extra {usd(CUENTA_EXTRA)} · trimestral −{DESCUENTO_TRIMESTRAL}% · Fundadores −{DESCUENTO_FUNDADOR}% de por vida (no se suman)
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Tarjeta titulo="Radar mensual (solo Radar)"
            valor={radar.promo ? <>{usd(radar.precio)} <s className="text-sm font-normal text-neutral-400">{usd(radar.lista)}</s></> : usd(radar.precio)}
            detalle={radar.promo ? `Promo ${radar.promo.texto}, hasta el ${ddmm(radar.promo.hasta)} · PRO todos los días` : 'PRO todos los días del mes pagado'}
            resaltar={!!radar.promo} />
          <Tarjeta titulo="Radar PRO fines de semana" valor={`+${usd(RADAR_PRO.precio)}/mes`} detalle="Con Automatizaciones o Completo (1er mes gratis)" />
          <Tarjeta titulo="Recargas de créditos IA" valor={RECARGAS_IA.map(r => usd(r.precio)).join(' · ')}
            detalle={RECARGAS_IA.map(r => `${r.creditos.toLocaleString('de-DE')}`).join(' · ') + ' créditos · no vencen'} />
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Prueba gratis de 15 días (autoregistro)</h3>
            <p className="text-sm text-neutral-500">
              Desde /registro: Automatizaciones + Pagos ME y {CREDITOS_PRUEBA} créditos de IA. Los 15 días corren desde el alta; una prueba por cuenta de ML.
            </p>
          </div>
          <VisitasRegistro inicial={visitas} />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Historial</h2>
          <p className="text-sm text-neutral-500">Programas que ya pasaron. Quedan para consultar.</p>
        </div>
        <details className="group rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <summary className="cursor-pointer select-none text-sm font-semibold text-neutral-800">Programa Despegue · Grupo 1</summary>
          <div className="mt-3"><DespegueCard /></div>
        </details>
        <details className="group rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <summary className="cursor-pointer select-none text-sm font-semibold text-neutral-800">Programa Fundadores · lista, rondas y postulaciones</summary>
          <div className="mt-3"><FundadoresPanel /></div>
        </details>
      </section>
    </div>
  )
}

function Tarjeta({ titulo, valor, detalle, resaltar = false }: { titulo: string; valor: React.ReactNode; detalle: string; resaltar?: boolean }) {
  return (
    <div className={`rounded-xl border shadow-sm px-4 py-3 min-w-0 ${resaltar ? 'bg-lime-50 border-lime-200' : 'bg-white border-neutral-200'}`}>
      <div className="text-xs text-neutral-500">{titulo}</div>
      <div className="text-lg font-semibold text-neutral-900 num">{valor}</div>
      <div className="text-xs text-neutral-500">{detalle}</div>
    </div>
  )
}
