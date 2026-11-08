// Mi IA = un solo lugar (08-11, el dueño): las "Políticas para la IA" de texto libre repetían casi todo lo del
// cuestionario y ya chocaban (garantía 30 días en Políticas, 15 en Mi IA). "Pasar mis Políticas a Mi IA" reparte
// ese texto en los temas, la pantalla muestra lo que choca para elegir, y lo que no encaja en ningún tema queda
// como "Otras indicaciones" (el mismo campo preguntas_politicas, ahora solo con el resto).
// Una llamada a la IA como la del prellenado (módulo 'simulacion': no descuenta créditos del cliente).
import type { Pool } from 'pg'
import { llamarClaude, registrarUso, MODELO_IA } from '@/lib/ia'
import { HERRAMIENTA as BASE, limpiar } from '@/lib/miIASugerir'
import type { EntradaMiIA } from '@/lib/miIAEsquema'

export interface PasePoliticas { propuesto: Partial<EntradaMiIA>; resto: string; politicas: string }

const SISTEMA = `Eres quien ordena la configuración de la IA de atención de un vendedor de MercadoLibre. Te paso sus "indicaciones escritas para la IA" (texto libre). Tienes que repartirlas en los temas de la herramienta "mi_ia".

Reglas:
- No inventes. Solo lo que el texto dice. Si un tema no aparece, déjalo fuera.
- Agencias: con su nombre (ZOOM, TEALCA, MRW, MercadoEnvíos…); gratis=true si el envío por esa agencia es gratis. Si dice "envío gratis desde $X" y "por debajo mínimo N unidades": envio.minimo = { precioMenor: X, unidades: N }.
- Despacho: despacho.dias = texto corto con los días y cuándo sale (ej. "Lunes a viernes, al día siguiente de confirmar el pago y el formulario"); despacho.sabados si lo dice; despacho.corte (HH:MM) solo si da una hora.
- Garantía: factura.garantiaDias y factura.garantiaNoCubre (lo que no cubre, corto).
- Cambios y devoluciones: cambios.acepta = "si" (por cualquier motivo), "falla" (solo en algunos casos; motivos: "falla" falla de fábrica, "error" error del vendedor en el envío, "cambio" el comprador pide otro producto/talla/color) o "no". cambios.dias si lo dice. cambios.envio = "comprador" si el comprador paga los gastos de devolución, "nosotros" o "depende".
- Retiro: ubicacion.retiro = "acuerdo" si es previo acuerdo, "horario" si tiene horario, "no" si no hay.
- Si no sabe algo o no puede afirmar stock: desconocido con "verificar" (decir que lo verificamos), "preguntar", "recomendar" o "persona", en el orden que se entienda.
- Saludo y despedida tal cual (cortos). trato "usted" o "tu".
- extras: SOLO textos largos de un tema puntual (compatibilidades, modo de uso, garantía muy detallada) que no caben en un campo; título corto y palabras clave separadas por coma.
- resto: los renglones ORIGINALES (copiados tal cual) que no quedaron en ningún campo de arriba. No incluyas lo que ya repartiste. No incluyas la prohibición de dar teléfono, WhatsApp, correo o redes (eso ya es regla fija del sistema). Si todo encajó, resto vacío.
- Revisa al final: CADA renglón del texto tiene que haber quedado en algún campo o en resto. Nada se pierde.`

const HERRAMIENTA = {
  name: 'mi_ia',
  description: 'Las indicaciones del vendedor repartidas por tema, y lo que no encaja en ninguno.',
  input_schema: {
    type: 'object',
    properties: {
      ...Object.fromEntries(Object.entries(BASE.input_schema.properties).filter(([k]) => k !== 'avisos')),
      cambios: { type: 'object', properties: {
        acepta: { type: 'string', enum: ['si', 'falla', 'no'] }, motivos: { type: 'array', items: { type: 'string', enum: ['falla', 'error', 'cambio'] } },
        dias: { type: 'integer' }, envio: { type: 'string', enum: ['comprador', 'nosotros', 'depende'] } } },
      negocio: { type: 'object', properties: {
        mayor: { type: 'string', enum: ['escribir', 'mismo'] }, mayorDesde: { type: 'integer' }, regateo: { type: 'string', enum: ['fijo', 'consultar'] },
        apartar: { type: 'string', enum: ['no', 'si'] }, apartarHoras: { type: 'integer' } } },
      atencion: { type: 'object', properties: { horario: { type: 'string' } } },
      desconocido: { type: 'array', items: { type: 'string', enum: ['verificar', 'preguntar', 'recomendar', 'persona'] } },
      extras: { type: 'array', items: { type: 'object', properties: { titulo: { type: 'string' }, texto: { type: 'string' }, palabras: { type: 'string' } }, required: ['titulo', 'texto'] } },
      resto: { type: 'string' },
    },
  },
}

export async function leerPoliticas(db: Pick<Pool, 'query'>) {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = 'preguntas_politicas'`)
  return String(r?.value ?? '').trim()
}

export async function pasarPoliticas(db: Pool, usuarioId: number | string | null): Promise<PasePoliticas> {
  const politicas = await leerPoliticas(db)
  if (!politicas) return { propuesto: {}, resto: '', politicas }
  const { resultado, uso, modelo } = await llamarClaude<Record<string, unknown>>({
    sistema: SISTEMA, contenido: `SUS INDICACIONES ESCRITAS PARA LA IA:\n${politicas.slice(0, 6000)}`, herramienta: HERRAMIENTA, modelo: MODELO_IA, maxTokens: 2500 })
  await registrarUso(db, 'simulacion', [{ modelo, uso }], usuarioId)
  return { propuesto: limpiar(resultado), resto: typeof resultado.resto === 'string' ? resultado.resto.trim() : '', politicas }
}
