// Historial de pruebas de Mi IA (10-11-2026, el dueño; mig 164). Cada «Probar» queda guardado con lo que el usuario marcó.
// Cuando marca Mal y escribe qué debió decir, la IA (Haiku, sin descontar créditos: ia_uso 'fichas') separa esa corrección
// en un DATO FIJO del producto (→ Datos del producto de esa publicación, ml_item_notas) y/o una REGLA general (→ Mi IA →
// Información extra → «Correcciones de mi equipo»). Así se aprende para las próximas respuestas.
import type { Pool } from 'pg'
import { iaConfigurada, llamarClaude, MODELO_SIMPLE, registrarUso } from '@/lib/ia'
import { leerMiIA, MI_IA_KEY, datoDeContacto } from '@/lib/miIA'

type Db = Pool
export type TipoPrueba = 'preguntas' | 'mensajes'
export interface Aprendido { producto?: string; productoId?: number; regla?: string }
export interface MarcaCaso { marca: 'bien' | 'mal' | null; error?: string | null; correccion?: string | null; aprendido?: Aprendido | null }

export async function guardarPrueba(db: Db, tipo: TipoPrueba, casos: unknown[], usuarioId: number | string | null): Promise<string | null> {
  try {
    const { rows: [r] } = await db.query(
      `INSERT INTO mi_ia_pruebas (tipo, casos, creado_por) VALUES ($1, $2, $3) RETURNING id::text`,
      [tipo, JSON.stringify(casos), usuarioId ? Number(usuarioId) : null])
    return r?.id ?? null
  } catch (e) { console.error('[mi ia pruebas guardar]', e); return null }   // sin la tabla (antes de la mig 164) la prueba igual sirve
}

export async function listarPruebas(db: Db, tipo: TipoPrueba) {
  const { rows } = await db.query(
    `SELECT id::text, creado_at, casos, marcas FROM mi_ia_pruebas WHERE tipo = $1 ORDER BY creado_at DESC LIMIT 20`, [tipo])
  return rows as { id: string; creado_at: string; casos: unknown[]; marcas: Record<string, MarcaCaso> }[]
}

// ── Correcciones de mi equipo (Mi IA → Información extra) ─────────────────────────────────────────────────────────
export const TITULO_CORRECCIONES = 'Correcciones de mi equipo'
const LARGO = 1500

/** Suma una regla general a Mi IA (las más nuevas primero; si no entra, se caen las más viejas). Devuelve el error o null. */
export async function agregarCorreccionGeneral(db: Db, texto: string): Promise<string | null> {
  if (datoDeContacto(texto)) return 'Tiene un teléfono, correo o link: MercadoLibre borra esas respuestas.'
  const { rows: [c] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [MI_IA_KEY])
  const mi = leerMiIA(c?.value)
  if (!mi) return 'Primero completa Mi IA'
  const extras = [...(mi.extras ?? [])]
  const i = extras.findIndex(x => x.titulo === TITULO_CORRECCIONES)
  const linea = `- ${texto}`
  if (i >= 0) {
    if (extras[i].texto.includes(texto)) return null
    let t = `${linea}\n${extras[i].texto}`
    while (t.length > LARGO && t.includes('\n')) t = t.slice(0, t.lastIndexOf('\n'))
    extras[i] = { ...extras[i], texto: t, siempre: true }
  } else {
    if (extras.length >= 12) return 'Mi IA ya tiene 12 secciones de información extra: borra una para agregar correcciones'
    extras.push({ titulo: TITULO_CORRECCIONES, texto: linea, siempre: true })
  }
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [MI_IA_KEY, JSON.stringify({ ...mi, extras, extrasNoAplica: false, actualizado: new Date().toISOString() })])
  return null
}

// ── Aprender de una corrección hecha en la prueba ─────────────────────────────────────────────────────────────────
const SISTEMA = `Un vendedor de MercadoLibre probó la IA que responde a sus compradores y corrigió una respuesta.
Tu tarea: convertir SU CORRECCIÓN en lo que la IA debe recordar para las próximas respuestas, separado en:
- "producto": datos FIJOS de ESTE producto (material, medidas, compatibilidad como "sirve para cualquier vehículo", qué incluye, cómo funciona, garantía del fabricante, por qué agencia sale). Formato corto: "Material: PVC rígido"; varios separados por " · ". Solo si hay PRODUCTO.
- "regla": una indicación general que vale para TODAS las respuestas (forma de trabajar, pagos, envíos, tono, qué decir ante cierto tipo de pregunta). Escríbela como instrucción corta en segunda persona: "Si preguntan por Cashea, di que no trabajamos con eso y nombra nuestros medios de pago."
Reglas:
- NUNCA guardes precios, montos, tasas, stock, disponibilidad de hoy, fechas, teléfonos, correos ni links.
- No inventes: usa solo lo que dijo el vendedor. Si algo ya está en YA ANOTADO, no lo repitas.
- Si la corrección es solo de esta compra o no deja nada para recordar, devuelve los dos vacíos.`

const HERRAMIENTA = {
  name: 'aprender',
  description: 'Lo que la IA debe recordar de la corrección (vacío si no hay).',
  input_schema: {
    type: 'object',
    properties: {
      producto: { type: 'string', description: 'dato fijo de este producto; vacío si no hay' },
      regla: { type: 'string', description: 'regla general para todas las respuestas; vacío si no hay' },
    },
    required: ['producto', 'regla'],
  },
}

const ERRORES_TXT: Record<string, string> = {
  falta: 'Le faltó un dato del producto', dato: 'Dio un dato equivocado', regla: 'No siguió cómo trabaja el vendedor',
  tono: 'El tono o la forma', persona: 'Lo debía ver una persona', otro: 'Otro',
}

export async function aprenderCorreccion(db: Db, o: {
  tipo: TipoPrueba; itemId?: string | null; producto?: string | null; texto: string; ia: string; error?: string | null
  correccion: string; usuarioId: number | string
}): Promise<Aprendido> {
  if (!iaConfigurada()) return {}
  const anotadas = o.itemId
    ? (await db.query(`SELECT texto FROM ml_item_notas WHERE item_id = $1 ORDER BY created_at DESC LIMIT 15`, [o.itemId])).rows.map(r => String(r.texto))
    : []
  const { rows: [c] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [MI_IA_KEY])
  const reglas = leerMiIA(c?.value)?.extras?.find(x => x.titulo === TITULO_CORRECCIONES)?.texto ?? ''
  const r = await llamarClaude<{ producto: string; regla: string }>({
    para: 'Mi IA: aprender de una corrección', sistema: SISTEMA, herramienta: HERRAMIENTA, modelo: MODELO_SIMPLE, maxTokens: 300,
    contenido: `${o.itemId ? `PRODUCTO: ${o.producto ?? '—'}` : 'PRODUCTO: (no hay: es un mensaje, guarda solo "regla")'}\n` +
      `${o.tipo === 'preguntas' ? 'PREGUNTA' : 'MENSAJE'} DEL COMPRADOR: ${o.texto}\nLO QUE RESPONDIÓ LA IA: ${o.ia || '—'}\n` +
      `QUÉ ESTUVO MAL: ${ERRORES_TXT[o.error ?? ''] ?? '—'}\nCORRECCIÓN DEL VENDEDOR: ${o.correccion}\n` +
      `YA ANOTADO: ${[...anotadas, reglas].filter(Boolean).join(' · ').slice(0, 2000) || '—'}`,
  })
  await registrarUso(db, 'fichas', [{ modelo: r.modelo, uso: r.uso }], o.usuarioId)
  const out: Aprendido = {}
  const dato = (r.resultado.producto ?? '').trim().slice(0, 500)
  if (o.itemId && dato.length >= 3 && !datoDeContacto(dato)) {
    const { rows: [n] } = await db.query(`INSERT INTO ml_item_notas (item_id, texto, creada_por) VALUES ($1, $2, $3) RETURNING id`, [o.itemId, dato, Number(o.usuarioId)])
    out.producto = dato; out.productoId = n?.id
  }
  const regla = (r.resultado.regla ?? '').trim().slice(0, 300)
  if (regla.length >= 5 && !(await agregarCorreccionGeneral(db, regla))) out.regla = regla
  return out
}

/** Guarda la marca de un caso y, si trae corrección nueva, la aprende. Devuelve la marca guardada. */
export async function marcarCaso(db: Db, pruebaId: string, casoId: string, m: MarcaCaso, usuarioId: number | string): Promise<MarcaCaso | null> {
  const { rows: [p] } = await db.query(`SELECT tipo, casos, marcas FROM mi_ia_pruebas WHERE id = $1`, [pruebaId])
  if (!p) return null
  const caso = (p.casos as { id: string; texto?: string; pregunta?: string; mensaje?: string; titulo?: string | null; itemId?: string | null; ia?: string }[]).find(x => x.id === casoId)
  if (!caso) return null
  const antes: MarcaCaso | undefined = p.marcas?.[casoId]
  const nueva: MarcaCaso = { marca: m.marca, error: m.marca === 'mal' ? m.error ?? null : null, correccion: m.marca === 'mal' ? (m.correccion ?? '').trim() || null : null, aprendido: antes?.aprendido ?? null }
  if (nueva.correccion && nueva.correccion !== antes?.correccion) {
    try {
      nueva.aprendido = await aprenderCorreccion(db, {
        tipo: p.tipo, itemId: caso.itemId, producto: caso.titulo, texto: caso.texto ?? caso.pregunta ?? caso.mensaje ?? '',
        ia: caso.ia ?? '', error: nueva.error, correccion: nueva.correccion, usuarioId,
      })
    } catch (e) { console.error('[mi ia pruebas aprender]', e) }
  }
  await db.query(`UPDATE mi_ia_pruebas SET marcas = jsonb_set(marcas, ARRAY[$2], $3::jsonb, true) WHERE id = $1`,
    [pruebaId, casoId, JSON.stringify(nueva)])
  return nueva
}
