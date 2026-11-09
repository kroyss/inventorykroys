// Promociones en la cola de MercadoLibre (08-11-2026, lib/colaML.ts, mig 155): agregar publicaciones a una campaña
// (o cambiarles el precio) en segundo plano. Cada una se registra igual que antes (ml_promociones_acciones).
//
// datos de cada publicación: { conexionId, campana: { id, tipo, nombre }, precio, precioAntes, cambio? }
// Flujo: se agrega y se comprueba. Si ML dijo que sí pero todavía no se ve, vuelve a la cola y se comprueba a los
// ~15 s y a los ~30 s (intentos 1 y 2); si sigue sin verse, error. Si quedó "procesando" por un corte, la cola la
// devuelve con intentos ≥ 1: primero se COMPRUEBA (pudo haber entrado) en vez de mandarla dos veces.
import type { Pool } from 'pg'
import { agregarACampana, cambiarPrecioEnCampana, verificarEnCampana } from '@/lib/promocionesML'
import type { ItemTarea, LoteTarea, ResultadoTarea } from '@/lib/colaML'

export interface DatosPromo {
  conexionId: number
  campana: { id: string; tipo: string; nombre: string | null }
  precio: number
  precioAntes: number
  cambio?: boolean
}

const NO_APARECIO = 'MercadoLibre respondió que sí, pero el precio no apareció en la publicación: no entró a la campaña. Reintenta.'

export async function procesarItemPromocion(db: Pool, l: LoteTarea, it: ItemTarea): Promise<ResultadoTarea> {
  const d = it.datos as unknown as DatosPromo
  if (!d?.conexionId || !d.campana?.id || !(d.precio > 0)) return { estado: 'error', mensaje: 'Datos incompletos' }
  const precio = Math.round(d.precio * 100) / 100
  if (it.intentos > 0) {
    const v = await verificarEnCampana(db, d.conexionId, { id: it.item_id, precio }, d.campana, it.intentos >= 2)
    if (v === 'ok') return { estado: 'ok', resultado: { precio } }
    if (v === 'pendiente') return { estado: 'pendiente', reintentarEn: 15_000 }
    return { estado: 'error', mensaje: NO_APARECIO }
  }
  const usuario = l.user_id as number   // null si el usuario se borró: el registro queda sin usuario
  const r = d.cambio
    ? await cambiarPrecioEnCampana(db, d.conexionId, usuario, { id: it.item_id, precio, precioAntes: d.precioAntes }, d.campana)
    : await agregarACampana(db, d.conexionId, usuario, { id: it.item_id, precio, precioAntes: d.precioAntes }, d.campana)
  if (!r.ok) return { estado: 'error', mensaje: r.error, resultado: { noCreible: /rebaja real/.test(r.error) } }
  const datos = r.datos as { precio: number; manda?: number | null; porConfirmar?: boolean }
  if (datos.porConfirmar) return { estado: 'pendiente', reintentarEn: 15_000, resultado: { precio: datos.precio } }
  return { estado: 'ok', resultado: { precio: datos.precio, manda: datos.manda ?? null } }
}
