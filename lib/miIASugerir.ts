// Mi IA, Parte C (06-11): prellenar el cuestionario con lo que el vendedor YA dice. Solo propone: la pantalla muestra lo
// sugerido en cada tema y no se guarda nada hasta que la persona pasa por ese paso y da Siguiente.
//   - Sus últimas respuestas a preguntas (saludo, despedida, tuteo/usted, agencias, pagos, despacho, garantía…).
//   - El bloque que repite en las descripciones de sus publicaciones (lo que copia y pega en todas: envíos, pagos,
//     horario, garantía). Se leen pocas descripciones de MercadoLibre y se queda con los renglones que aparecen en
//     la mitad o más.
//   - Sus "Políticas para la IA" de texto libre, si las tiene.
// Una sola llamada a la IA (no descuenta créditos del cliente: módulo 'simulacion'). Si algo se contradice entre
// las fuentes (p. ej. a veces "envío gratis por MRW" y otras "cobro a destino"), lo devuelve como aviso.
// 12-11 (el dueño: "esa lista es confusa, ¿no lo arregla el sistema?"): las contradicciones las RESUELVE la IA con un
// orden fijo (indicaciones escritas > respuestas más recientes > descripciones) y cada aviso va con su tema: la pantalla
// lo muestra como una línea chica DENTRO de ese tema ("Usé X (de…). En … dice Y."), no como lista aparte.
import type { Pool } from 'pg'
import { llamarClaude, registrarUso, MODELO_IA } from '@/lib/ia'
import { mlFetch } from '@/lib/ml'
import { EsquemaMiIA, type EntradaMiIA } from '@/lib/miIAEsquema'

const RESPUESTAS = 60
const DESCRIPCIONES = 10

export const TEMAS_AVISO = ['tono', 'oferta', 'pago', 'envio', 'despacho', 'ubicacion', 'factura', 'persona', 'postventa'] as const
export type AvisoMiIA = { tema: typeof TEMAS_AVISO[number]; texto: string }

export interface SugerenciaMiIA {
  sugerido: Partial<EntradaMiIA>
  avisos: AvisoMiIA[]
  fuentes: { respuestas: number; descripciones: number; bloque: string | null; politicas: boolean }
  fecha: string
}

/** Renglones que se repiten en la mitad o más de las descripciones (el "bloque fijo" del vendedor). */
export function bloqueRepetido(textos: string[]) {
  if (textos.length < 2) return null
  const norm = (l: string) => l.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const cuenta = new Map<string, number>()
  for (const t of textos) for (const k of new Set(t.split(/\n+/).map(norm).filter(l => l.length >= 12))) cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  const min = Math.max(2, Math.ceil(textos.length / 2))
  // En el orden de la primera descripción que los tenga, con su texto original.
  const vistos = new Set<string>(), out: string[] = []
  for (const t of textos) for (const l of t.split(/\n+/)) {
    const k = norm(l)
    if (k.length >= 12 && (cuenta.get(k) ?? 0) >= min && !vistos.has(k)) { vistos.add(k); out.push(l.trim()) }
  }
  const b = out.join('\n').slice(0, 2500)
  return b || null
}

async function descripciones(db: Pool) {
  const { rows } = await db.query(
    `SELECT item_id, conexion_id FROM ml_catalogo WHERE estado = 'active' ORDER BY NOT sin_movimiento DESC, actualizado_at DESC LIMIT $1`, [DESCRIPCIONES])
  const textos: string[] = []
  for (const r of rows) {
    try {
      const d = await mlFetch<{ plain_text?: string }>(db, r.conexion_id, `/items/${r.item_id}/description`)
      if (d?.plain_text?.trim()) textos.push(d.plain_text)
    } catch { /* sin descripción o ML no la deja leer: se sigue con las demás */ }
  }
  return textos
}

const SISTEMA = `Eres quien configura la IA de atención de un vendedor de MercadoLibre. Te paso cómo responde HOY (sus respuestas reales a preguntas), el texto que repite en las descripciones de sus publicaciones y sus indicaciones escritas. Llena la herramienta "mi_ia" SOLO con lo que esté claro en esos textos.

Reglas:
- No inventes. Si un tema no aparece, déjalo fuera (no lo pongas vacío ni con un valor por defecto).
- Saludo y despedida: los que más usa, tal cual (cortos, sin emojis). trato: "usted" si habla de usted (le, su, usted), "tu" si tutea.
- Agencias: las que nombra (MercadoEnvíos, ZOOM, TEALCA, MRW, Domesa, Liberty Express, PedidosYa, Yummy, delivery propio…), con ese nombre; gratis=true si dice que el envío por esa agencia es gratis, false si es cobro a destino.
- medios de pago: nombres cortos (Pago móvil, Transferencia, Zelle, Binance, Efectivo en divisas…).
- oferta: solo si repite SIEMPRE una frase comercial (un descuento, un regalo). Nunca teléfonos, correos ni links.
- despacho.corte en formato HH:MM de 24 horas.
- persona: temas que él siempre manda a hablar aparte o que deja para revisar (reclamos, al mayor…), solo si se ve.
- Si las fuentes se CONTRADICEN, decide tú y llena el tema con lo elegido, en este orden: 1) sus indicaciones escritas, 2) sus respuestas más recientes (vienen de la más nueva a la más vieja), 3) el texto de las descripciones. No dejes el tema vacío por una contradicción.
- avisos: SOLO las contradicciones que resolviste, una por tema, con el tema al que pertenece y una frase corta (máximo 120 caracteres, tuteando) que diga qué usaste y qué decía la otra fuente. Formato: "Usé <lo elegido> (de <fuente>). En <otra fuente> dice <lo otro>." Fuentes: "tus indicaciones", "tus respuestas", "tus descripciones". Ej.: {"tema":"envio","texto":"Usé MRW gratis (de tus respuestas). En tus descripciones dice cobro a destino."}. Nada de "confírmalo" ni consejos; si no hubo contradicciones, lista vacía.`

export const HERRAMIENTA = {
  name: 'mi_ia',
  description: 'Lo que se entiende de cómo trabaja el vendedor, para prellenar su configuración.',
  input_schema: {
    type: 'object',
    properties: {
      tono: { type: 'object', properties: { saludo: { type: 'string' }, despedida: { type: 'string' }, trato: { type: 'string', enum: ['tu', 'usted'] } } },
      oferta: { type: 'object', properties: { texto: { type: 'string' }, cuando: { type: 'string', enum: ['siempre', 'primera', 'precio'] } } },
      pago: { type: 'object', properties: { tasa: { type: 'string' }, medios: { type: 'array', items: { type: 'string' } },
        divisas: { type: 'object', properties: { pct: { type: 'number' } } } } },
      envio: { type: 'object', properties: {
        agencias: { type: 'array', items: { type: 'object', properties: { nombre: { type: 'string' }, gratis: { type: 'boolean' } }, required: ['nombre', 'gratis'] } },
        minimo: { type: 'object', properties: { precioMenor: { type: 'number' }, unidades: { type: 'integer' } } } } },
      despacho: { type: 'object', properties: { dias: { type: 'string' }, corte: { type: 'string' }, sabados: { type: 'boolean' } } },
      ubicacion: { type: 'object', properties: { zona: { type: 'string' }, retiro: { type: 'string', enum: ['no', 'acuerdo', 'horario'] }, retiroHorario: { type: 'string' } } },
      factura: { type: 'object', properties: { tipo: { type: 'string', enum: ['fiscal', 'nota', 'no'] }, garantiaDias: { type: 'integer' }, garantiaNoCubre: { type: 'string' } } },
      persona: { type: 'array', items: { type: 'string' } },
      postventa: { type: 'object', properties: { pasos: { type: 'array', items: { type: 'string' } } } },
      avisos: { type: 'array', items: { type: 'object', properties: {
        tema: { type: 'string', enum: [...TEMAS_AVISO] }, texto: { type: 'string' } }, required: ['tema', 'texto'] } },
    },
  },
}

/** Cada tema por separado: si la IA mandó algo inválido en uno, se descarta ese tema y no todo. */
export function limpiar(x: Record<string, unknown>): Partial<EntradaMiIA> {
  const out: Record<string, unknown> = {}
  const campos = EsquemaMiIA.shape
  for (const k of Object.keys(campos) as (keyof typeof campos)[]) {
    if (k === 'version' || x[k] == null) continue
    const v = campos[k].safeParse(x[k])
    if (v.success && v.data !== undefined && !(typeof v.data === 'object' && v.data !== null && !Array.isArray(v.data) && !Object.keys(v.data).length)
        && !(Array.isArray(v.data) && !v.data.length)) out[k] = v.data
  }
  return out as Partial<EntradaMiIA>
}

export async function sugerirMiIA(db: Pool, usuarioId: number | string | null): Promise<SugerenciaMiIA> {
  const { rows: resp } = await db.query(
    `SELECT texto, respuesta FROM ml_preguntas
     WHERE estado = 'ANSWERED' AND respuesta IS NOT NULL AND length(respuesta) > 15
       AND COALESCE(ia_auto->>'publicada', 'false') <> 'true'
     ORDER BY respuesta_fecha DESC NULLS LAST, fecha DESC LIMIT $1`, [RESPUESTAS])
  const { rows: [pol] } = await db.query(`SELECT value FROM app_settings WHERE key = 'preguntas_politicas'`)
  const textos = await descripciones(db).catch(() => [] as string[])
  const bloque = bloqueRepetido(textos)
  const politicas = String(pol?.value ?? '').trim()
  const fuentes = { respuestas: resp.length, descripciones: textos.length, bloque, politicas: !!politicas }
  if (!resp.length && !bloque && !politicas) return { sugerido: {}, avisos: [], fuentes, fecha: new Date().toISOString() }

  const contenido = [
    resp.length ? `SUS RESPUESTAS REALES (pregunta → respuesta):\n${resp.map(r => `- ${String(r.texto).slice(0, 200)} → ${String(r.respuesta).slice(0, 400)}`).join('\n')}` : '',
    bloque ? `TEXTO QUE REPITE EN SUS DESCRIPCIONES:\n${bloque}` : '',
    politicas ? `SUS INDICACIONES ESCRITAS PARA LA IA:\n${politicas.slice(0, 3000)}` : '',
  ].filter(Boolean).join('\n\n')
  const { resultado, uso, modelo } = await llamarClaude<Record<string, unknown>>({ sistema: SISTEMA, contenido, herramienta: HERRAMIENTA, modelo: MODELO_IA, maxTokens: 2000 })
  await registrarUso(db, 'simulacion', [{ modelo, uso }], usuarioId)
  const avisos: AvisoMiIA[] = Array.isArray(resultado.avisos)
    ? (resultado.avisos as { tema?: unknown; texto?: unknown }[])
        .filter(a => a && TEMAS_AVISO.includes(a.tema as AvisoMiIA['tema']) && typeof a.texto === 'string' && a.texto.trim())
        .map(a => ({ tema: a.tema as AvisoMiIA['tema'], texto: String(a.texto).trim().slice(0, 200) })).slice(0, 9)
    : []
  return { sugerido: limpiar(resultado), avisos, fuentes, fecha: new Date().toISOString() }
}
