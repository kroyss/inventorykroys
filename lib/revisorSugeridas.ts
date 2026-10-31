// Revisor IA de las respuestas ya escritas (31-10, pedido del dueño tras comparar con Mercasist): la sugerida sale de
// reglas (lib/sugerenciasPreguntas.ts) y no razona. Antes de mostrarla, Haiku separa la pregunta en partes y revisa
// que la respuesta las conteste TODAS:
//   - todas contestadas → se muestra igual (y puede publicarse sola si el vendedor activó esa respuesta);
//   - falta una parte y el dato está en la publicación → se muestra con UNA frase agregada (nunca sale sola);
//   - falta una parte sin dato → no hay sugerida (queda para una persona).
// Una sola vez por pregunta: el resultado queda en ml_preguntas.sugerida_revision (migración 136). No cuenta como
// crédito de IA del cliente (ia_uso.modulo = 'revisor', gasto del sistema).
import type { Pool } from 'pg'
import { llamarClaude, registrarUso, iaConfigurada, MODELO_SIMPLE } from '@/lib/ia'
import { mlFetch } from '@/lib/ml'
import { parecido } from '@/lib/sugerenciasPreguntas'
import { problemasDelTexto } from '@/lib/preguntasTexto'
import { variantesDe, textoVariantes, type VariacionML } from '@/lib/variantesML'

export interface Revision {
  plantilla: string
  ok: boolean
  texto?: string | null          // con la frase agregada (solo si ok = false y el dato estaba en la publicación)
  partes?: { parte: string; contestada: boolean }[]
  motivo?: string | null
  modelo?: string
  fecha: string
}

// Revisiones nuevas por carga de la pantalla (el resto, en la siguiente). Se esperan todas: seguir escribiendo
// después de responder usaría una conexión que ya puede ser de otra empresa.
const POR_PASADA = 8

const SISTEMA = `Revisas una respuesta YA ESCRITA de un vendedor de MercadoLibre Venezuela antes de que se publique.

La RESPUESTA PROPUESTA es una respuesta estándar del vendedor: lo que dice de precio, envío, agencias y pagos es su política vigente y vale para todo el país. Así se leen:
- "el precio es el publicado" (o "publicado BCV") contesta cualquier pregunta de precio, también en bolívares o a tasa BCV: el precio se ve en la publicación. No hace falta la cifra.
- "disponible" contesta la disponibilidad. No hace falta decir cuántas hay, salvo que pida un número de unidades o pregunte cuántas tiene.
- Si la respuesta ofrece envío gratis por ciertas agencias, eso contesta "¿envían a <ciudad o estado de Venezuela>?" y "¿hay envío gratis por una sola unidad?". No evalúes si la agencia llega a esa ciudad.
- En MercadoLibre Venezuela "ofertar" o "hacer la oferta" es comprar (el botón se llama Ofertar), no regatear: "¿disponible para ofertar?" se contesta con "disponible".

1. Separa la pregunta del comprador en sus partes: cada cosa distinta que pregunta. Saludos, gracias y "quiero comprar" no son partes.
2. Para cada parte, decide si la RESPUESTA PROPUESTA la contesta de verdad.
3. Si contesta todas: cubre_todo = true y texto_final vacío.
4. Si falta alguna parte:
   - Si esa parte es sobre el producto (color, material, medida, qué incluye, para qué sirve) y el dato está ESCRITO en el Título, la Ficha o la Descripción, escribe en texto_final la respuesta propuesta COPIADA IGUAL con UNA frase corta agregada que repite ese dato (máximo 20 palabras, mismo tono, sin saludo nuevo).
   - Si pregunta por una talla, color o modelo (o por N unidades de uno) y hay tabla VARIANTES: solo si esa variante existe y sus disponibles alcanzan para lo que pide (1 si no dice cantidad), agrega la frase confirmándola ("en talla M negro sí tenemos"). Un "disponible" genérico NO contesta por una variante: aunque tenga stock, cubre_todo = false y va la frase. Si no existe, no alcanza, no queda claro cuál pide, o pide unidades sin decir de qué variante: texto_final vacío. Nunca sumes variantes distintas.
   - En cualquier otro caso texto_final vacío: el dato no está escrito, o la parte es sobre envíos, ciudades, tiempos, precios, pagos, descuentos, cantidades, ubicación, garantía, factura u otro producto. Eso lo contesta el vendedor.
   - Nunca inventes, supongas ni pidas datos al comprador. Ante la duda, texto_final vacío.
5. Si la respuesta propuesta contradice la pregunta (por ejemplo, ofrece una agencia distinta a la que pide el comprador, o dice "disponible" cuando pregunta otra cosa), esa parte NO está contestada.

Siempre termina llamando a la herramienta revisar_respuesta.`

const HERRAMIENTA = {
  name: 'revisar_respuesta',
  description: 'Entrega la revisión de la respuesta ya escrita.',
  input_schema: {
    type: 'object',
    properties: {
      partes: {
        type: 'array',
        items: { type: 'object', properties: { parte: { type: 'string' }, contestada: { type: 'boolean' } }, required: ['parte', 'contestada'] },
      },
      cubre_todo: { type: 'boolean' },
      texto_final: { type: 'string', description: 'La respuesta propuesta con una frase agregada, o vacío.' },
      motivo: { type: 'string', description: 'Qué falta o por qué no se puede, en una frase corta (vacío si cubre todo).' },
    },
    required: ['partes', 'cubre_todo', 'texto_final', 'motivo'],
  },
}

interface ItemML { title?: string; attributes?: { name: string; value_name: string | null }[]; variations?: VariacionML[] }

async function revisarUna(db: Pool, q: { id: string; texto: string; conexion_id: number; item_id: string; item_titulo: string | null },
  plantilla: string, propuesta: string, stock: number | null): Promise<Revision> {
  let item: ItemML | null = null, descripcion: string | null = null
  try {
    item = await mlFetch<ItemML>(db, q.conexion_id, `/items/${q.item_id}?attributes=title,attributes,variations`)
  } catch { /* sin datos de ML: revisa con el título guardado */ }
  try {
    descripcion = (await mlFetch<{ plain_text?: string }>(db, q.conexion_id, `/items/${q.item_id}/description`)).plain_text?.trim() || null
  } catch { /* sin descripción */ }
  const ficha = (item?.attributes ?? []).filter(a => a.value_name).slice(0, 40).map(a => `${a.name}: ${a.value_name}`)
  const variantes = await variantesDe(db, q.item_id, item?.variations).catch(() => [])
  const contenido = [
    `PREGUNTA DEL COMPRADOR:\n${q.texto}`,
    `\nRESPUESTA PROPUESTA:\n${propuesta}`,
    `\nDATOS DE LA PUBLICACIÓN:`,
    `Título: ${item?.title ?? q.item_titulo ?? '—'}`,
    variantes.length ? textoVariantes(variantes) : 'Variantes: no tiene',
    stock !== null ? `Stock: ${stock}` : '',
    ficha.length ? `Ficha:\n${ficha.join('\n')}` : 'Ficha: —',
    descripcion ? `Descripción:\n${descripcion.slice(0, 1500)}` : 'Descripción: —',
  ].filter(Boolean).join('\n')
  const { resultado: r, uso, modelo } = await llamarClaude<{ partes?: Revision['partes']; cubre_todo?: boolean; texto_final?: string; motivo?: string }>(
    { sistema: SISTEMA, contenido, herramienta: HERRAMIENTA, modelo: MODELO_SIMPLE, maxTokens: 600 })
  await registrarUso(db, 'revisor', [{ modelo, uso }])
  const ok = r.cubre_todo === true && (r.partes ?? []).every(p => p.contestada)
  let texto = ok ? null : String(r.texto_final ?? '').trim() || null
  // La frase agregada no puede cambiar la respuesta: casi el mismo texto, una frase más y nada que ML borre.
  if (texto && (parecido(propuesta, texto) < 0.75 || texto.length > propuesta.length + 180 || problemasDelTexto(texto).length)) texto = null
  return { plantilla, ok, texto, partes: r.partes ?? [], motivo: r.motivo || null, modelo, fecha: new Date().toISOString() }
}

/**
 * Revisa las sugeridas de estas preguntas (las ya revisadas salen de la base). Devuelve la revisión de cada pregunta
 * revisada; las que no se alcanzaron a revisar (o sin IA configurada) no aparecen.
 */
export async function revisarSugeridas(db: Pool, sugeridas: { id: string; plantilla: string; texto: string; stock: number | null }[]) {
  const out = new Map<string, Revision>()
  if (!sugeridas.length) return out
  const { rows } = await db.query(
    `SELECT id::text, texto, conexion_id, item_id, item_titulo, sugerida_revision AS rev FROM ml_preguntas WHERE id::text = ANY($1::text[])`,
    [sugeridas.map(s => s.id)])
  const porId = new Map(rows.map(r => [r.id as string, r]))
  const pendientes: typeof sugeridas = []
  for (const s of sugeridas) {
    const rev = porId.get(s.id)?.rev as Revision | null
    if (rev && rev.plantilla === s.plantilla) out.set(s.id, rev)
    else if (porId.has(s.id)) pendientes.push(s)
  }
  if (!pendientes.length || !iaConfigurada()) return out
  await Promise.all(pendientes.slice(0, POR_PASADA).map(async s => {
    try {
      const rev = await revisarUna(db, porId.get(s.id), s.plantilla, s.texto, s.stock)
      await db.query(`UPDATE ml_preguntas SET sugerida_revision = $2 WHERE id::text = $1`, [s.id, JSON.stringify(rev)])
      out.set(s.id, rev)
    } catch (e) { console.error('[revisor sugeridas]', s.id, e instanceof Error ? e.message : e) }
  }))
  return out
}
