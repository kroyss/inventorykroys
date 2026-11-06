import { z } from 'zod'

// Mi IA (06-11): el esquema del cuestionario (lo valida el PUT de /api/mi-ia y la sugerencia de la IA, lib/miIASugerir.ts).
const txt = (max = 300) => z.string().trim().max(max).optional()
export const EsquemaMiIA = z.object({
  version: z.literal(1),
  tono: z.object({ saludo: txt(60), despedida: txt(60), trato: z.enum(['tu', 'usted']).optional() }).optional(),
  oferta: z.object({ texto: txt(300), cuando: z.enum(['siempre', 'primera', 'precio']).optional() }).optional(),
  pago: z.object({
    tasa: txt(80), medios: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
    divisas: z.object({ pct: z.number().min(0).max(90), medios: z.array(z.string().trim().max(40)).max(12).optional() }).nullable().optional(),
  }).optional(),
  envio: z.object({
    agencias: z.array(z.object({ nombre: z.string().trim().min(1).max(40), gratis: z.boolean() })).max(12).optional(),
    minimo: z.object({ precioMenor: z.number().positive().max(1000), unidades: z.number().int().min(2).max(50) }).nullable().optional(),
  }).optional(),
  despacho: z.object({ dias: txt(80), corte: z.string().regex(/^\d{1,2}:\d{2}( ?[ap]m)?$/i).nullable().optional(), sabados: z.boolean().optional() }).optional(),
  ubicacion: z.object({ zona: txt(80), decir: z.boolean().optional(), retiro: z.enum(['no', 'acuerdo', 'horario']).optional(), retiroHorario: txt(80) }).optional(),
  factura: z.object({ tipo: z.enum(['fiscal', 'nota', 'no']).optional(), garantiaDias: z.number().int().min(0).max(3650).nullable().optional(), garantiaNoCubre: txt(150) }).optional(),
  desconocido: z.array(z.enum(['verificar', 'preguntar', 'recomendar', 'persona'])).max(4).optional(),
  persona: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  postventa: z.object({ pasos: z.array(z.string().trim().min(1).max(80)).max(6).optional(), datosPago: txt(400) }).optional(),
})
export type EntradaMiIA = z.infer<typeof EsquemaMiIA>
