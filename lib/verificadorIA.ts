// Verificador de afirmaciones (31-10, meta del dueño: ~95% de acierto en lo que la IA dé por seguro, sin comprometer
// al vendedor con cosas que no sabe). La evaluación de octubre mostró que la confianza "alta" del borrador no alcanza:
// inventaba colores, ciudades y números técnicos con confianza alta. Aquí Haiku separa el borrador en afirmaciones y
// busca cada una en los mismos datos que vio la IA; si alguna no está escrita, o falta contestar una parte, el borrador
// baja a confianza "baja" (lo revisa una persona y nunca saldría solo). Solo se verifican los de confianza alta/media.
import { llamarClaude, MODELO_SIMPLE, type LlamadaIA } from '@/lib/ia'

const SISTEMA = `Verificas un BORRADOR de respuesta a una pregunta de MercadoLibre Venezuela antes de que se publique solo, sin que lo revise una persona. Tu trabajo es encontrar cualquier cosa afirmada que NO esté escrita en los DATOS.

1. Separa el borrador en afirmaciones concretas (hay disponible, color X, mide Y, envío gratis por Z, mínimo N unidades, retiro en tal zona, garantía, plazo, compatibilidad, qué incluye...). Saludos, despedidas y "el precio es el publicado" no son afirmaciones que verificar.
2. Para cada afirmación, busca dónde está escrita y marca respaldada:
   - Datos del producto (color, medida, números, compatibilidad, qué incluye): en el título, ficha técnica, descripción, VARIANTES, notas del vendedor, o en una respuesta anterior del vendedor en ESTA MISMA publicación. El número o el color debe ser el MISMO (75 no es 70; "rojo" no respalda "dorado").
   - Disponibilidad y cantidades: en STOCK REAL o VARIANTES (una cantidad pedida debe alcanzar).
   - Envío gratis, mínimos, agencias: en la línea ENVÍO GRATIS A ESTE PRECIO, las POLÍTICAS o las RESPUESTAS RÁPIDAS que aplican. Una respuesta anterior NO respalda montos ni mínimos de envío (pueden estar viejos).
   - Ubicación, retiro, garantía, factura, plazos, pagos: en POLÍTICAS o RESPUESTAS RÁPIDAS.
   - Si no la encuentras escrita, respaldada = false. No la deduzcas ni la des por obvia.
3. Separa la pregunta en sus partes y anota en partes_sin_contestar las que el borrador no contesta (o contesta con otra cosa).
4. Anota en mal_entendida = true si la pregunta no se entiende sola (no está claro a qué se refiere) y nada en los datos lo aclara.

Siempre termina llamando a la herramienta verificar.`

const HERRAMIENTA = {
  name: 'verificar',
  description: 'Entrega la verificación del borrador.',
  input_schema: {
    type: 'object',
    properties: {
      afirmaciones: {
        type: 'array',
        items: {
          type: 'object',
          properties: { afirmacion: { type: 'string' }, donde: { type: 'string', description: 'Dónde está escrita, o "ninguna".' }, respaldada: { type: 'boolean' } },
          required: ['afirmacion', 'donde', 'respaldada'],
        },
      },
      partes_sin_contestar: { type: 'array', items: { type: 'string' } },
      mal_entendida: { type: 'boolean' },
    },
    required: ['afirmaciones', 'partes_sin_contestar', 'mal_entendida'],
  },
}

// Versión 2 (07-11): el de arriba frenaba por detalles (el saludo, "colores claros", la conversión a Bs, "dos días" sin decir
// "el lunes"). Esto se suma y manda.
const SISTEMA_V2_EXTRA = `

AJUSTES (mandan sobre lo anterior):
- NO son afirmaciones que verificar: saludos y despedidas, frases de cortesía, "el precio es el publicado", "a tasa BCV", "lo hacemos en el menor tiempo posible", "el despacho se confirma al concretar la compra", "déjanos verificar", ni descripciones obvias de un dato que sí está (blanco o nude son colores claros; si VARIANTES dice 0 de una talla, "no la tenemos" está respaldado).
- Una conversión a bolívares sale de la línea PRECIO EN MERCADOLIBRE AHORA: respaldada.
- Lo que dice una RESPUESTA RÁPIDA del vendedor que aplica, o lo que el vendedor ya respondió igual en ESTA publicación, está respaldado.
- partes_sin_contestar: solo si una parte quedó SIN ninguna respuesta. Una respuesta general correcta o la frase segura de despacho cuenta como contestada ("¿si compro el lunes cuándo llega?" → "normalmente son dos días" está contestada).
- Sigue siendo NO respaldado: colores, tallas, medidas, números, plazos, mínimos, agencias, cobros o compatibilidades que no estén escritos.`

export interface Verificacion { ok: boolean; motivo: string | null; llamada: LlamadaIA }

/** `datos` = el mismo bloque de contexto que recibió la IA del borrador. */
export async function verificarBorrador(datos: string, pregunta: string, borrador: string, modeloV = MODELO_SIMPLE, v2 = false): Promise<Verificacion> {
  const { resultado: r, uso, modelo } = await llamarClaude<{
    afirmaciones?: { afirmacion: string; donde: string; respaldada: boolean }[]; partes_sin_contestar?: string[]; mal_entendida?: boolean
  }>({
    sistema: SISTEMA + (v2 ? SISTEMA_V2_EXTRA : ''), herramienta: HERRAMIENTA, modelo: modeloV, maxTokens: 700,
    contenido: `DATOS:\n${datos}\n\n────────\nPREGUNTA: ${pregunta}\n\nBORRADOR A VERIFICAR:\n${borrador}`,
  })
  const sinRespaldo = (r.afirmaciones ?? []).filter(a => !a.respaldada || /^ninguna/i.test(a.donde ?? ''))
  const faltan = r.partes_sin_contestar ?? []
  const motivo = sinRespaldo.length ? `No está en los datos: ${sinRespaldo.map(a => a.afirmacion).join('; ')}`
    : faltan.length ? `Falta contestar: ${faltan.join('; ')}`
    : r.mal_entendida ? 'La pregunta no se entiende sola' : null
  return { ok: !motivo, motivo: motivo?.slice(0, 300) ?? null, llamada: { modelo, uso } }
}
