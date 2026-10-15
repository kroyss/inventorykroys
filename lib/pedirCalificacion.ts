// PEDIR CALIFICACIÓN, A MANO (2026-10-15, pedido de Beto; decisión del dueño): Mensajes → "Pedir
// calificación". Nada sale solo: la lista muestra las ventas donde conviene pedirla y una persona revisa
// el texto y lo envía. Reglas (las acordadas):
//   - nosotros ya la calificamos CONCRETADA y POSITIVA (la venta salió bien);
//   - el comprador todavía no nos calificó;
//   - dentro de su plazo: en MLV el comprador califica hasta ~7 días desde la COMPRA (medido 14-10:
//     corte brusco del día 7 al 8), así que se ofrece desde el día DESDE_DIAS hasta el HASTA_DIAS;
//   - sin mensajes del comprador sin responder (no se pide calificación a quien dejamos en visto);
//   - UNA vez por venta (cal_pedida_at) y se puede sacar con "No pedir" (cal_no_pedir).
// Migración 091. Cómo calificamos cada venta lo lee el cron (lib/reputacionML.ts): la búsqueda de ML
// solo dice "calificada".
import type { Pool } from 'pg'

export const DESDE_DIAS = 2
export const HASTA_DIAS = 7

export const TEXTO_INICIAL =
  '¡Hola {nombre}! Esperamos que tu compra haya llegado muy bien 😊 Si puedes, califícanos aquí: {link} Tu opinión nos ayuda mucho. ¡Gracias!'

/** El texto de la empresa (Mensajes → Pedir calificación → Cambiar texto). */
export async function textoPedido(db: Pick<Pool, 'query'>) {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = 'pedir_calificacion_texto'`)
  return (r?.value as string | undefined)?.trim() || TEXTO_INICIAL
}

export const linkCalificar = (orden: string, pais: string) =>
  `https://feedback.mercadolibre.com.${pais === 'CO' ? 'co' : 've'}/feedback?orderId=${orden}`

/** Primer nombre con mayúscula ("JOSE LUIS" → "Jose"); sin nombre, nada. */
const primerNombre = (n: string | null) => {
  const p = (n ?? '').trim().split(/\s+/)[0] ?? ''
  return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : ''
}

export function armarTexto(plantilla: string, v: { orden: string; nombre: string | null }, pais: string) {
  return plantilla
    .replace(/\{nombre\}/g, primerNombre(v.nombre))
    .replace(/\{link\}/g, linkCalificar(v.orden, pais))
    .replace(/ {2,}/g, ' ').replace(/ ([!,.])/g, '$1').trim()
}

/** Las ventas donde hoy conviene pedirla (la que menos plazo le queda, primero). */
export const SQL_PEDIBLES = `
  SELECT o.id::text AS orden, COALESCE(o.pack_id, o.id)::text AS pack, x.nickname AS cuenta, o.fecha,
         COALESCE(NULLIF(o.comprador_nombre, ''), NULLIF(c.comprador_nombre, '')) AS nombre, o.comprador AS nick, o.productos,
         ${HASTA_DIAS} - (CURRENT_DATE - o.fecha::date) AS dias_restantes,
         c.pack_id IS NOT NULL AND c.ultimo_at IS NOT NULL AS con_mensajes
  FROM ml_ordenes o
  JOIN ml_conexiones x ON x.id = o.conexion_id AND x.estado = 'activa'
  LEFT JOIN ml_conversaciones c ON c.pack_id = COALESCE(o.pack_id, o.id)
  WHERE o.cal_vendedor = 'positive' AND o.cal_concretada AND o.cal_comprador IS NULL
    AND COALESCE(o.estado, '') <> 'cancelled'
    AND o.fecha::date <= CURRENT_DATE - ${DESDE_DIAS} AND o.fecha::date > CURRENT_DATE - ${HASTA_DIAS}
    AND o.cal_pedida_at IS NULL AND NOT o.cal_no_pedir
    AND NOT COALESCE(c.ultimo_de_comprador, FALSE)
  ORDER BY o.fecha ASC`

/** Cuántas hay para pedir (la pestaña de Mensajes). */
export async function contarPedibles(db: Pick<Pool, 'query'>) {
  const { rows: [r] } = await db.query(`SELECT COUNT(*)::int AS n FROM (${SQL_PEDIBLES}) t`)
  return r.n as number
}
