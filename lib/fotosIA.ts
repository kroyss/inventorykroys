// Lo que se ve en las FOTOS de una publicación (migración 146, 06-11-2026, pedido del dueño).
//
// Mirar fotos es lo caro: se hace UNA vez por publicación y se guarda en texto. La IA de Preguntas y de
// Mensajes lee después solo ese texto. Se vuelve a mirar únicamente si cambia la HUELLA (ficha técnica +
// descripción + ids de las fotos): cuando el vendedor modifica la publicación. Comparar la huella no cuesta.
// En la misma lectura anota las CONTRADICCIONES (p. ej. ficha 5V y descripción 12V) para que el vendedor
// las corrija en ML. Solo publicaciones donde se usa la IA (nunca todo el catálogo). Módulo `fotos_ia`.
import { createHash } from 'crypto'
import type { Pool } from 'pg'
import { llamarClaude, registrarUso, MODELO_SIMPLE } from '@/lib/ia'
import { mlFetch } from '@/lib/ml'

const MAX_FOTOS = 6

export interface FotoML { id: string; secure_url?: string; url?: string }
export interface ContextoFotos { texto: string | null; contradicciones: string | null }

const SISTEMA = `Miras las fotos de UNA publicación de MercadoLibre de un vendedor venezolano, junto con su ficha técnica y su descripción, para que otra IA responda después las preguntas de los compradores SIN volver a mirar las fotos.

Escribe "texto": viñetas cortas ("- ") con lo que se VE en las fotos y sirve para responder: textos impresos en la caja, la etiqueta o el producto (voltaje, potencia, capacidad, modelo, medidas), qué trae el paquete (accesorios, cables, transformador/adaptador, control, pilas), tipo de conector o enchufe, colores que se ven, cantidad de piezas. Copia los números y unidades EXACTOS como están impresos. Si algo no se lee con claridad, no lo pongas. Máximo 12 viñetas y 1.000 caracteres. Nada de opiniones ni de calidad.

Escribe "contradicciones": SOLO cuando dos fuentes (fotos, ficha técnica, descripción) dan un valor DISTINTO para el MISMO dato que preguntan los compradores (voltaje, potencia, tipo de conector, qué incluye, cantidad, medida). Ej.: "Voltaje: la ficha dice 5V y la descripción 12V". Una línea corta por cada una, máximo 3. NO pongas: cosas que coinciden, datos que faltan en una fuente, marcas o modelos, el peso del paquete, ni frases como "sin contradicción". Si no hay ninguna así, devuelve null.

Siempre termina llamando a la herramienta guardar_fotos.`

const HERRAMIENTA = {
  name: 'guardar_fotos',
  description: 'Guarda lo que se ve en las fotos de la publicación y sus contradicciones.',
  input_schema: {
    type: 'object',
    properties: {
      texto: { type: 'string', description: 'Viñetas con lo que se ve en las fotos (máximo 1.000 caracteres).' },
      contradicciones: { type: ['string', 'null'], description: 'Datos que no coinciden entre fotos, ficha y descripción, o null.' },
    },
    required: ['texto', 'contradicciones'],
  },
}

/** La ficha técnica como texto, igual en Preguntas y Mensajes (si no, la huella cambiaría entre uno y otro). */
export function fichaDeAtributos(attrs?: { name: string; value_name: string | null }[] | null) {
  const a = (attrs ?? []).filter(x => x.value_name).map(x => `${x.name}: ${x.value_name}`)
  return a.length ? a.join(' · ') : null
}

/** ¿La empresa de esta conexión tiene la lectura de fotos? (empresas es global). */
async function encendido(db: Pool) {
  const { rows: [e] } = await db.query(
    `SELECT 'fotos_ia' = ANY (modulos) AS si FROM empresas WHERE id = NULLIF(current_setting('app.empresa_id', true), '')::int`)
  return !!e?.si
}

/** El texto de las fotos de la publicación (lo lee la primera vez y cuando cambió la publicación). null si está
 *  apagado o no se pudo. `fotos` = las que ya trajo quien llama (si no, se piden a ML). Nunca lanza error. */
export async function contextoFotos(db: Pool, conexionId: number, itemId: string,
  pub: { titulo?: string | null; ficha: string | null; descripcion: string | null; fotos?: FotoML[] | null }): Promise<ContextoFotos | null> {
  try {
    if (!(await encendido(db))) return null
    let fotos = pub.fotos ?? null
    if (!fotos) {
      const it = await mlFetch<{ pictures?: FotoML[] }>(db, conexionId, `/items/${itemId}?attributes=pictures`).catch(() => null)
      fotos = it?.pictures ?? null
    }
    const lista = (fotos ?? []).filter(f => f.secure_url || f.url).slice(0, MAX_FOTOS)
    const huella = createHash('sha1').update(JSON.stringify([pub.ficha ?? '', pub.descripcion ?? '', lista.map(f => f.id)])).digest('hex')
    const { rows: [g] } = await db.query(`SELECT huella, texto, contradicciones FROM ml_item_fotos_ia WHERE item_id = $1`, [itemId])
    if (g && (g.huella === huella || !lista.length)) return { texto: g.texto, contradicciones: g.contradicciones }
    if (!lista.length) return null

    // Las fotos se bajan desde aquí y van en base64: Anthropic no puede descargar las de mlstatic por URL (400).
    const imagenes = (await Promise.all(lista.map(async f => {
      try {
        const r = await fetch((f.secure_url ?? f.url!).replace(/^http:/, 'https:'), { cache: 'no-store', signal: AbortSignal.timeout(10000) })
        const tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim()
        if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(tipo)) return null
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 4_500_000) return null
        return { type: 'image', source: { type: 'base64', media_type: tipo, data: buf.toString('base64') } }
      } catch { return null }
    }))).filter(Boolean)
    if (!imagenes.length) return g ? { texto: g.texto, contradicciones: g.contradicciones } : null
    const contenido = [
      ...imagenes,
      { type: 'text', text: [
        `PUBLICACIÓN: ${pub.titulo ?? itemId}`,
        `FICHA TÉCNICA: ${pub.ficha ?? '(sin ficha)'}`,
        `DESCRIPCIÓN:\n${(pub.descripcion ?? '(sin descripción)').slice(0, 3000)}`,
        `Arriba van ${imagenes.length} foto(s) de la publicación.`,
      ].join('\n') },
    ]
    const { resultado: r, uso, modelo } = await llamarClaude<{ texto: string; contradicciones: string | null }>(
      { sistema: SISTEMA, contenido, herramienta: HERRAMIENTA, modelo: MODELO_SIMPLE, maxTokens: 900 })
    await registrarUso(db, 'fichas', [{ modelo, uso }])
    const texto = String(r.texto ?? '').trim().slice(0, 1200) || null
    const contra = typeof r.contradicciones === 'string' && r.contradicciones.trim() && !/^null$/i.test(r.contradicciones.trim())
      ? r.contradicciones.trim().slice(0, 400) : null
    await db.query(
      `INSERT INTO ml_item_fotos_ia (item_id, huella, texto, contradicciones, fotos, modelo, leido_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (empresa_id, item_id) DO UPDATE SET huella = EXCLUDED.huella, texto = EXCLUDED.texto,
         contradicciones = EXCLUDED.contradicciones, fotos = EXCLUDED.fotos, modelo = EXCLUDED.modelo, leido_at = NOW()`,
      [itemId, huella, texto, contra, imagenes.length, modelo])
    return { texto, contradicciones: contra }
  } catch (e) {
    console.error('[fotos ia]', itemId, e instanceof Error ? e.message : e)
    return null
  }
}

/** Las líneas para el contexto de la IA (Preguntas y Mensajes). */
export function lineasFotos(f: ContextoFotos | null): string[] {
  const L: string[] = []
  if (f?.texto) L.push(`LO QUE SE VE EN LAS FOTOS (leído por el sistema; los textos impresos en caja o etiqueta valen como dato escrito):\n${f.texto}`)
  if (f?.contradicciones) L.push(`OJO, LA PUBLICACIÓN SE CONTRADICE: ${f.contradicciones}. Si preguntan justo eso, no elijas una fuente: confianza "baja" y anótalo en "falta_dato".`)
  return L
}
