// Datos del producto aprendidos (10-11-2026, el dueño; mig 160). Casi nadie usa «Anotar dato del producto» a mano
// (15 notas de clientes en un mes contra 700 respuestas), así que lo anota la IA: cuando el borrador quedó con
// «No encontré: …» (borrador_falta) y una PERSONA publicó su propia respuesta, Haiku saca de esa respuesta SOLO el dato
// fijo del producto («Material: PVC rígido») y lo guarda en ml_item_notas de esa publicación, como si el vendedor lo
// hubiera anotado. Sin dato fijo, no guarda nada. No descuenta créditos (ia_uso modulo 'fichas', fuera del cupo).
// Solo esa publicación: pasarlo a otras del mismo producto queda para después (ahí se puede equivocar).
import type { Pool } from 'pg'
import { iaConfigurada, llamarClaude, MODELO_SIMPLE, registrarUso } from '@/lib/ia'

const SISTEMA = `Un vendedor de MercadoLibre respondió a mano una pregunta que la IA no supo contestar.
Tu tarea: sacar de SU RESPUESTA solo los datos FIJOS del producto que contestan lo que faltaba, para guardarlos como "dato del producto" y usarlos en preguntas futuras.

Reglas:
- Solo datos que no cambian: material, medidas, peso, compatibilidad, qué incluye, cómo funciona, garantía del fabricante, origen.
- NUNCA: precios, tasas, stock, disponibilidad, envíos, agencias, tiempos, fechas, saludos, formas de pago ni nada del negocio que no sea del producto.
- Copia el dato tal como lo dijo el vendedor (mismo número, misma unidad). No agregues nada que él no dijo.
- Formato corto: "Material: PVC rígido". Varios datos, separados por " · ".
- Si la respuesta no trae ningún dato fijo del producto (p. ej. "déjame verificarlo", "sí, disponible"), devuelve dato vacío.`

const HERRAMIENTA = {
  name: 'guardar_dato',
  description: 'Devuelve el dato fijo del producto sacado de la respuesta del vendedor (vacío si no hay).',
  input_schema: {
    type: 'object',
    properties: { dato: { type: 'string', description: 'p. ej. "Material: PVC rígido"; vacío si no hay dato fijo' } },
    required: ['dato'],
  },
}

const normal = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

// En la respuesta automática, borrador_falta trae también los FRENOS (lib/iaAutomatica.ts → motivosRevisar), que no son
// datos que faltan («Habla como un tercero», «Da un monto»…). Queda solo lo que la IA dijo que le faltaba.
const FRENO = /^(La IA no propuso|Dice que no hay|Recomienda otra|Habla como un tercero|Da un monto|Pide muchas|Pregunta precio en divisa|Pregunta por un medio|Confirma compatibilidad|Menciona un fabricante|La publicación no está activa|MercadoLibre la borraría)/i
export function datoQueFalto(falta: string | null): string {
  return (falta ?? '').split(' · ').map(x => x.trim()).filter(x => x && !FRENO.test(x))
    .map(x => x.replace(/^Confianza (baja|media)(: )?/i, '').trim()).filter(Boolean).join(' · ')
}

/** Después de publicar a mano: si la IA no tenía el dato, lo aprende de la respuesta. Nunca hace fallar la publicación. */
export async function aprenderDatoDeRespuesta(db: Pool, preguntaId: string, respuesta: string, usuarioId: number | string | null | undefined) {
  if (!usuarioId || !iaConfigurada()) return
  try {
    const { rows: [q] } = await db.query(
      `SELECT item_id, texto, item_titulo, borrador, borrador_falta FROM ml_preguntas WHERE id = $1`, [preguntaId])
    const falta = datoQueFalto(q?.borrador_falta)
    if (!q?.item_id || !falta) return
    if (q.borrador && normal(q.borrador) === normal(respuesta)) return   // publicó lo de la IA: nada nuevo
    const { rows: [ya] } = await db.query(`SELECT 1 FROM ml_item_notas WHERE aprendida_de = $1 LIMIT 1`, [preguntaId])
    if (ya) return

    const r = await llamarClaude<{ dato: string }>({
      sistema: SISTEMA, herramienta: HERRAMIENTA, modelo: MODELO_SIMPLE, maxTokens: 200,
      contenido: `PRODUCTO: ${q.item_titulo ?? '—'}\nPREGUNTA: ${q.texto}\nLO QUE FALTABA: ${falta}\nRESPUESTA DEL VENDEDOR: ${respuesta}`,
    })
    await registrarUso(db, 'fichas', [{ modelo: r.modelo, uso: r.uso }], usuarioId)
    const dato = (r.resultado.dato ?? '').trim().slice(0, 500)
    if (dato.length < 3) return
    await db.query(
      `INSERT INTO ml_item_notas (item_id, texto, creada_por, aprendida_de) VALUES ($1, $2, $3, $4)`,
      [q.item_id, dato, Number(usuarioId), preguntaId])
  } catch (e) { console.error('[aprender dato]', e) }
}
