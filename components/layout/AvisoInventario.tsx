import Link from '@/components/ui/Link'
import { currentDate } from '@/lib/tz'
import { PLANES } from '@/lib/planes'
import {
  AVISAR_INVENTARIO_DESDE, DIAS_DATOS_INVENTARIO, DIAS_PRUEBA_INVENTARIO, datosHasta, fmtUsd, infoInventario, pasarACompleto, puedeActivar,
} from '@/lib/pruebaInventario'
import AvisoInventarioOferta from './AvisoInventarioOferta'
import AvisoCerrable from './AvisoCerrable'
import type { ItemAviso } from './AvisosLista'

// Prueba de Inventario (21-11-2026, mig. 193) en «Avisos de tu cuenta» (AvisosArriba). Solo al admin de la organización:
//  · oferta (Plataforma → «Ofrecer Inventario»): rota con las otras ofertas (Radar PRO); ✕ la cierra por la semana;
//  · prueba corriendo: línea gris con los días que quedan; desde 3 días antes, ámbar con el monto para pasar a Completo;
//  · pago de Completo en revisión: verde;
//  · prueba terminada sin Completo: hasta cuándo se guardan los datos (se cierra por la semana).
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
function lunes(hoy: string) {
  const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10)
}
function sumarDias(f: string, n: number) {
  const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

export async function avisoInventario(organizacionId: number, esAdmin: boolean): Promise<ItemAviso | null> {
  if (!esAdmin) return null
  const i = await infoInventario(organizacionId)
  if (!i) return null
  const hoy = currentDate()
  const semana = lunes(hoy)

  if (puedeActivar(i)) {
    const hasta = sumarDias(hoy, DIAS_PRUEBA_INVENTARIO)
    // Lo que pagaría al terminar la prueba (si su plan sigue después de ella).
    const m = pasarACompleto({ ...i, hasta }, hoy)
    const incluye = PLANES.find(p => p.id === 'completo')?.incluye ?? []
    const cerrar = `oferta-inventario:${semana}`
    return { id: 'oferta-inventario', nivel: 'info', orden: 78, oferta: true, cerrar, nodo: (
      <AvisoInventarioOferta llave={cerrar} hasta={ddmm(hasta)} incluye={incluye} dias={DIAS_PRUEBA_INVENTARIO} diasDatos={DIAS_DATOS_INVENTARIO}
        monto={m ? fmtUsd(m.monto) : null} planHasta={i.planHasta ? ddmm(i.planHasta) : null} />
    ) }
  }

  if (!i.hasta || i.quedan == null || i.plan === 'completo') return null

  if (i.quedan >= 0) {
    if (i.completoEnRevision) return { id: 'inventario-revision', nivel: 'verde', orden: 46, nodo: (
      <div className="bg-lime-50 border-b border-lime-200 text-lime-900 text-center text-sm py-2 px-4">
        ✓ Recibimos tu pago del plan Completo, lo estamos confirmando. Inventario sigue activo.
      </div>
    ) }
    if (i.quedan > AVISAR_INVENTARIO_DESDE) return { id: 'inventario-prueba', nivel: 'gris', orden: 72, nodo: (
      <div className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 text-center text-xs py-1.5 px-4">
        Prueba de Inventario: quedan <b className="num">{i.quedan} días</b> (hasta el {ddmm(i.hasta)}).{' '}
        <Link href="/mi-plan" className="underline underline-offset-2 hover:text-neutral-900 whitespace-nowrap">Ver en Mi plan</Link>
      </div>
    ) }
    const m = pasarACompleto(i, hoy)
    const cuando = i.quedan === 0 ? <b>termina HOY</b> : i.quedan === 1 ? <b>termina mañana</b> : <>termina en <b>{i.quedan} días</b> (el {ddmm(i.hasta)})</>
    return { id: 'inventario-vence', nivel: 'ambar', orden: 42, nodo: (
      <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-center text-sm py-2 px-4">
        Tu prueba de Inventario {cuando}. Para seguir con él, pasa a Completo{m ? <> por <b>{fmtUsd(m.monto)}</b></> : ' al renovar tu plan'};
        si no, se apaga solo y tus datos se guardan {DIAS_DATOS_INVENTARIO} días.{' '}
        <Link href="/mi-plan" className="underline font-semibold whitespace-nowrap">Pasar a Completo →</Link>
      </div>
    ) }
  }

  // Terminó sin Completo: mientras se guardan los datos, un recordatorio discreto que se cierra por la semana.
  const guarda = datosHasta(i.hasta)
  if (i.conInventario || guarda < hoy) return null
  const cerrar = `fin-inventario:${semana}`
  return { id: 'inventario-fin', nivel: 'gris', orden: 74, cerrar, nodo: (
    <AvisoCerrable llave={cerrar} clase="bg-neutral-50 border-neutral-200 text-neutral-600 text-xs py-1.5">
      Tu prueba de Inventario terminó. Tus productos y movimientos se guardan hasta el {ddmm(guarda)}:{' '}
      <Link href="/mi-plan" className="underline underline-offset-2 hover:text-neutral-900 whitespace-nowrap">pasa a Completo</Link> para recuperarlos.
    </AvisoCerrable>
  ) }
}
