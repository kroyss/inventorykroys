import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionDb } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'

// Presupuestos (08-11-2026, mig 153, módulo `presupuestos`): cotización imprimible para un cliente. Los datos del
// negocio (logo, nombre, RIF, dirección, condiciones) se guardan en app_settings 'presupuesto'.

export const CLAVE_AJUSTES = 'presupuesto'

export const ItemPresupuesto = z.object({
  product_id: z.number().int().nullable(),
  descripcion: z.string().trim().min(1, 'Falta la descripción de un producto').max(200),
  cantidad: z.number().positive('La cantidad tiene que ser mayor que cero').max(1e6),
  precio: z.number().min(0).max(1e10),
})
export type ItemPresupuesto = z.infer<typeof ItemPresupuesto>

export const DatosPresupuesto = z.object({
  cliente: z.string().trim().min(1, 'Falta el cliente').max(120),
  cliente_doc: z.string().trim().max(40).nullable().optional(),
  cliente_contacto: z.string().trim().max(120).nullable().optional(),
  items: z.array(ItemPresupuesto).min(1, 'Agrega al menos un producto').max(200),
  descuento: z.number().min(0).max(100),
  moneda: z.enum(['USD', 'COP', 'VES']),
  validez_dias: z.number().int().min(1).max(365),
  notas: z.string().max(1000).nullable().optional(),
})

export interface AjustesPresupuesto { logo: string | null; nombre: string; datos: string; condiciones: string }
export const AjustesSchema = z.object({
  logo: z.string().max(400_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).nullable(),
  nombre: z.string().max(80),
  datos: z.string().max(400),          // RIF, dirección, teléfono (varias líneas)
  condiciones: z.string().max(1000),   // formas de pago, envíos, garantía
})

export function totalDe(items: ItemPresupuesto[], descuento: number) {
  const bruto = items.reduce((s, i) => s + i.cantidad * i.precio, 0)
  return Math.round(bruto * (1 - descuento / 100) * 100) / 100
}

export async function sesionPresupuestos() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) } as const
  if (!tieneModulo(session.user, 'presupuestos') || !puede(session.user, 'ver_ventas'))
    return { error: NextResponse.json({ error: 'Prohibido' }, { status: 403 }) } as const
  return { session, db } as const
}
