// Preguntas de MercadoLibre: sincronización de la bandeja, borrador con IA y envío.
//
// Reglas aprendidas contra la API real (MLV):
//   - usar siempre api_version=4; limit máximo 50; el offset muere en 1000;
//   - que ML acepte el POST /answers NO significa que se publicó: se relee la pregunta y
//     solo cuenta si quedó ANSWERED con la respuesta ACTIVE;
//   - ML descarta textos con links externos o datos de contacto: se revisan antes;
//   - las preguntas de publicaciones pausadas no salen en el panel de ML pero la API sí
//     las trae: acá se muestran con aviso para que ninguna se quede colgada.
import { llamarClaude, MODELO_SIMPLE, type LlamadaIA } from '@/lib/ia'
import type { Pool } from 'pg'
import { mlFetch, CuentaDesconectada } from '@/lib/ml'
import { sincronizarMensajes } from '@/lib/mensajesML'
import { sincronizarOrdenes } from '@/lib/calificacionesML'
import { otrasPublicaciones, type OtraPublicacion } from '@/lib/catalogoML'
import { fichasActivas } from '@/lib/fichasIA'

// ── Tipos de la API (lo que usamos) ────────────────────────────────────────
export interface PreguntaML {
  id: number; item_id: string; status: string; text: string; date_created: string
  from?: { id?: number }
  answer?: { text: string; status: string; date_created: string } | null
}
interface BusquedaML { total: number; questions: PreguntaML[] }

// Las fechas de ML traen nanosegundos: Postgres las acepta, pero se recortan igual para
// que cualquier otro parser (JS) no falle.
const fechaML = (s?: string | null) => s ? s.replace(/(\.\d{6})\d+/, '$1') : null

export async function guardarPregunta(db: Pool, conexionId: number, q: PreguntaML) {
  await db.query(
    `INSERT INTO ml_preguntas (id, conexion_id, item_id, texto, estado, fecha, comprador_id,
                               respuesta, respuesta_estado, respuesta_fecha, sincronizada_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (empresa_id, id) DO UPDATE SET
       estado = EXCLUDED.estado, texto = EXCLUDED.texto,
       respuesta = COALESCE(EXCLUDED.respuesta, ml_preguntas.respuesta),
       respuesta_estado = COALESCE(EXCLUDED.respuesta_estado, ml_preguntas.respuesta_estado),
       respuesta_fecha = COALESCE(EXCLUDED.respuesta_fecha, ml_preguntas.respuesta_fecha),
       sincronizada_at = NOW()`,
    [q.id, conexionId, q.item_id, q.text, q.status, fechaML(q.date_created), q.from?.id ?? null,
     q.answer?.text ?? null, q.answer?.status ?? null, fechaML(q.answer?.date_created)])
}

async function buscar(db: Pool, conexionId: number, status: string, maxPaginas: number) {
  const out: PreguntaML[] = []
  for (let p = 0; p < maxPaginas; p++) {
    const offset = p * 50
    if (offset >= 1000) break                                   // tope de la API
    const r = await mlFetch<BusquedaML>(db, conexionId,
      `/my/received_questions/search?api_version=4&status=${status}&limit=50&offset=${offset}` +
      `&sort_fields=date_created&sort_types=DESC`)
    out.push(...(r.questions ?? []))
    if ((r.questions?.length ?? 0) < 50 || out.length >= r.total) break
  }
  return out
}

/**
 * Títulos/links/estado de las publicaciones que todavía no los tienen. De a UNA: en MLV
 * el multiget (/items?ids=) responde 403 (PolicyAgent) y /items/{id}?attributes= no.
 * Primero las de preguntas pendientes; un tope por pasada para no gastar el cron entero.
 * Nunca corta la sincronización: si una falla, queda para la próxima.
 */
async function completarItems(db: Pool, conexionId: number) {
  // Sin título todavía, o pendiente con el precio de hace más de 30 min (las promociones cambian).
  const { rows } = await db.query(
    `SELECT item_id FROM ml_preguntas
     WHERE conexion_id = $1
       AND (item_titulo IS NULL
            OR (estado = 'UNANSWERED' AND (item_actualizado_at IS NULL OR item_actualizado_at < NOW() - INTERVAL '30 minutes')))
     GROUP BY item_id ORDER BY bool_or(estado = 'UNANSWERED') DESC, max(fecha) DESC LIMIT 40`, [conexionId])
  let fallas = 0
  for (const { item_id } of rows) {
    try {
      const it = await mlFetch<{ id: string; title: string; permalink: string; status: string
                                 price: number | null; original_price: number | null; currency_id: string | null }>(
        db, conexionId, `/items/${item_id}?attributes=id,title,permalink,status,price,original_price,currency_id`)
      // El precio con la promoción vigente: /sale_price es la fuente nueva de ML; si no
      // responde (permiso / sitio), queda el price del ítem.
      let precio = it.price, original = it.original_price, moneda = it.currency_id
      try {
        const sp = await mlFetch<{ amount: number | null; regular_amount: number | null; currency_id: string | null }>(
          db, conexionId, `/items/${item_id}/sale_price?context=channel_marketplace`)
        if (sp?.amount) { precio = sp.amount; original = sp.regular_amount ?? original; moneda = sp.currency_id ?? moneda }
      } catch { /* sin sale_price: se usa el del ítem */ }
      await db.query(
        `UPDATE ml_preguntas SET item_titulo = $2, item_permalink = $3, item_estado = $4,
                item_precio = $5, item_precio_original = $6, item_moneda = $7, item_actualizado_at = NOW()
         WHERE item_id = $1`,
        [item_id, it.title, it.permalink, it.status, precio, original && original > (precio ?? 0) ? original : null, moneda])
    } catch {
      if (++fallas >= 3) break          // si ML bloquea a todas, no insistir en esta pasada
    }
  }
  return fallas
}

export interface ResultadoSync { cuenta: string; nuevas?: number; error?: string }

/**
 * Trae las preguntas de todas las cuentas activas de la empresa de `db`:
 *   - todas las sin responder (UNANSWERED);
 *   - las que teníamos sin responder y ya no lo están (se respondieron desde ML, se
 *     borraron…): se relee cada una para dejarla al día;
 *   - la primera vez, el histórico respondido (hasta el tope de 1000) para que la IA
 *     aprenda del tono y las políticas del vendedor.
 */
export async function sincronizarEmpresa(db: Pool): Promise<ResultadoSync[]> {
  const { rows: cuentas } = await db.query(
    `SELECT id, nickname, ultima_sync FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
  const res: ResultadoSync[] = []
  for (const c of cuentas) {
    try {
      const { rows: [{ n: antes }] } = await db.query(`SELECT COUNT(*)::int AS n FROM ml_preguntas WHERE conexion_id = $1`, [c.id])
      const pendientes = await buscar(db, c.id, 'UNANSWERED', 20)
      for (const q of pendientes) await guardarPregunta(db, c.id, q)

      const vivas = new Set(pendientes.map(q => q.id))
      const { rows: viejas } = await db.query(
        `SELECT id FROM ml_preguntas WHERE conexion_id = $1 AND estado = 'UNANSWERED' ORDER BY fecha LIMIT 100`, [c.id])
      for (const v of viejas) {
        if (vivas.has(Number(v.id))) continue
        try {
          await guardarPregunta(db, c.id, await mlFetch<PreguntaML>(db, c.id, `/questions/${v.id}?api_version=4`))
        } catch (e) {
          // Borrada del todo en ML: se marca para que no siga como pendiente.
          if ((e as { status?: number }).status === 404) {
            await db.query(`UPDATE ml_preguntas SET estado = 'DELETED', sincronizada_at = NOW() WHERE id = $1`, [v.id])
          } else throw e
        }
      }

      if (!c.ultima_sync) {
        for (const q of await buscar(db, c.id, 'ANSWERED', 20)) await guardarPregunta(db, c.id, q)
      }
      // Las preguntas ya quedaron al día: se marca antes de lo opcional (títulos).
      await db.query(`UPDATE ml_conexiones SET ultima_sync = NOW(), ultimo_error = NULL WHERE id = $1`, [c.id])
      // Mensajes post-venta sin leer (bandeja Mensajes). No corta la sync de preguntas.
      try { await sincronizarMensajes(db, c.id) } catch (e) {
        console.error('[ML mensajes]', c.nickname, e instanceof Error ? e.message : e)
      }
      // Ventas para calificar (cada SYNC_MINUTOS; adentro decide si toca).
      try { await sincronizarOrdenes(db, c.id) } catch (e) {
        console.error('[ML ventas]', c.nickname, e instanceof Error ? e.message : e)
      }
      const fallas = await completarItems(db, c.id)
      if (fallas) {
        await db.query(`UPDATE ml_conexiones SET ultimo_error = $2 WHERE id = $1`,
          [c.id, 'MercadoLibre no dejó leer algunas publicaciones (títulos). Las preguntas sí están al día.'])
      }
      const { rows: [{ n: despues }] } = await db.query(`SELECT COUNT(*)::int AS n FROM ml_preguntas WHERE conexion_id = $1`, [c.id])
      res.push({ cuenta: c.nickname, nuevas: despues - antes })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!(e instanceof CuentaDesconectada)) {
        await db.query(`UPDATE ml_conexiones SET ultimo_error = $2 WHERE id = $1`, [c.id, msg.slice(0, 500)])
      }
      res.push({ cuenta: c.nickname, error: msg })
    }
  }
  return res
}

// Revisión del texto: lib/preguntasTexto.ts (se usa también en el navegador).
export { problemasDelTexto } from '@/lib/preguntasTexto'
import { leerPlantillas, plantillaAplica, condicionPlantilla, type Plantilla } from '@/lib/preguntasTexto'

// ── Contexto para la IA ─────────────────────────────────────────────────────
interface ItemML {
  id: string; title: string; price: number; currency_id: string; available_quantity: number
  condition: string; status: string; permalink: string; category_id?: string | null
  attributes?: { name: string; value_name: string | null }[]
  shipping?: { free_shipping?: boolean }
  warranty?: string | null
}

export interface Contexto {
  pregunta: { id: number; texto: string; item_id: string; fecha: string }
  item: ItemML | null
  titulo: string | null            // guardado en la bandeja (si ML no deja leer la publicación)
  precioML: { precio: number; original: number | null; moneda: string } | null   // con la promoción vigente
  descripcion: string | null
  producto: { code: string; name: string; stock: number; precio_usd: number | null } | null
  tasa: number | null
  politicas: string
  plantillas: Plantilla[]
  notas: string[]
  mismoItem: { p: string; r: string }[]
  parecidas: { p: string; r: string }[]
  ficha: { texto: string; dudas: string | null } | null     // ficha de conocimiento de la publicación
  otras: OtraPublicacion[]                                   // otras publicaciones del vendedor
}

export async function armarContexto(db: Pool, preguntaId: number, country: string): Promise<Contexto & { conexionId: number }> {
  const { rows: [q] } = await db.query(
    `SELECT id, conexion_id, item_id, item_titulo, item_precio::float, item_precio_original::float, item_moneda, texto, fecha FROM ml_preguntas WHERE id = $1`, [preguntaId])
  if (!q) throw new Error('Pregunta no encontrada')

  let item: ItemML | null = null
  let descripcion: string | null = null
  // Con `attributes=` explícito: el GET completo lo puede frenar el PolicyAgent de ML.
  try {
    item = await mlFetch<ItemML>(db, q.conexion_id, `/items/${q.item_id}?attributes=` +
      'id,title,price,currency_id,available_quantity,condition,status,permalink,category_id,attributes,shipping,warranty')
  } catch { /* sin datos de ML: la IA trabaja con el resto */ }
  try {
    const d = await mlFetch<{ plain_text?: string }>(db, q.conexion_id, `/items/${q.item_id}/description`)
    descripcion = d.plain_text?.trim() || null
  } catch { /* publicación sin descripción */ }

  // Producto propio: el código ML se guarda sin el prefijo del sitio (MLV768007052 → 768007052).
  const codigo = String(q.item_id).replace(/^[A-Z]{3}/, '')
  const { rows: [prod] } = await db.query(
    `SELECT p.code, p.name, COALESCE(i.quantity, 0)::int AS stock, pp.final_price_usd::float AS precio_usd
     FROM product_ml_codes m
     JOIN products p ON p.id = m.product_id
     LEFT JOIN inventory i ON i.product_id = p.id
     LEFT JOIN product_pricing pp ON pp.product_id = p.id
     WHERE m.ml_code = $1 AND p.is_active
     LIMIT 1`, [codigo])
  const { rows: [tasa] } = await db.query(
    `SELECT official_rate::float AS r FROM venezuela_exchange_rates ORDER BY rate_date DESC, created_at DESC LIMIT 1`)
  const { rows: [pol] } = await db.query(`SELECT value FROM app_settings WHERE key = 'preguntas_politicas'`)
  const { rows: [pl] } = await db.query(`SELECT value FROM app_settings WHERE key = 'preguntas_plantillas'`)
  const { rows: notas } = await db.query(
    `SELECT texto FROM ml_item_notas WHERE item_id = $1 ORDER BY created_at DESC LIMIT 20`, [q.item_id])
  // Memoria de la IA = TODAS las respuestas del vendedor (decisión del dueño, 2026-10-03; antes
  // eran las últimas 1.000 por cuenta). Parecidas = se escribe parecido (trigramas) O comparte
  // al menos 2 palabras en español con la pregunta ("conectar/conecta", "copiloto"…), ordenadas
  // por cuántas comparte; a igual parecido, la más reciente (la logística y las políticas cambian).
  const { rows: mismo } = await db.query(
    `${PALABRAS_CTE}
     SELECT p.texto AS p, p.respuesta AS r FROM ml_preguntas p, qw, ${COMPARTIDAS}
     WHERE p.item_id = $1 AND p.id <> $2 AND p.estado = 'ANSWERED' AND p.respuesta IS NOT NULL
     ORDER BY x.n DESC, similarity(p.texto, $3) DESC, p.fecha DESC
     LIMIT 12`, [q.item_id, q.id, q.texto])   // 12 (antes 8): sin fichas nuevas, más memoria de la misma publicación
  const { rows: parecidas } = await db.query(
    `${PALABRAS_CTE.split('$3').join('$2')}
     SELECT p.texto AS p, p.respuesta AS r FROM ml_preguntas p, qw, ${COMPARTIDAS}
     WHERE p.item_id <> $1 AND p.estado = 'ANSWERED' AND p.respuesta IS NOT NULL
       AND (p.texto % $2 OR x.n >= LEAST(2, cardinality(qw.w)))
     ORDER BY x.n DESC, similarity(p.texto, $2) DESC, p.fecha DESC
     LIMIT 10`, [q.item_id, q.texto])
  // Fichas apagadas (default): no se leen, la IA trabaja igual para el dueño y los clientes.
  const { rows: [ficha] } = fichasActivas()
    ? await db.query(`SELECT texto, dudas FROM ml_item_fichas WHERE item_id = $1`, [q.item_id])
    : { rows: [] }
  // Se pidió IA en esta publicación: desde ahora merece ficha (fichas POR USO, migración 063).
  await db.query(`UPDATE ml_catalogo SET ia_usada_at = NOW() WHERE item_id = $1`, [q.item_id]).catch(() => {})
  const otras = await otrasPublicaciones(db, q.item_id, item?.title ?? q.item_titulo ?? '', q.texto).catch(() => [])

  return {
    conexionId: q.conexion_id,
    pregunta: { id: Number(q.id), texto: q.texto, item_id: q.item_id, fecha: q.fecha },
    item, titulo: q.item_titulo ?? prod?.name ?? null, descripcion,
    precioML: q.item_precio ? { precio: q.item_precio, original: q.item_precio_original, moneda: q.item_moneda ?? 'USD' } : null,
    producto: prod ?? null,
    tasa: country === 'VE' ? tasa?.r ?? null : null,   // Bs solo aplica en Venezuela
    politicas: pol?.value ?? '',
    plantillas: leerPlantillas(pl?.value),
    notas: notas.map(n => n.texto),
    mismoItem: mismo, parecidas,
    ficha: ficha ?? null, otras,
  }
}

// Link corto de una publicación (MLV123 → https://articulo.mercadolibre.com.ve/MLV-123), como lo
// escribe el vendedor: la IA lo copia tal cual (con el link largo llegó a mezclar dos).
const linkCorto = (itemId: string) => {
  const m = /^(M[A-Z]{2})(\d+)$/.exec(itemId)
  return m ? `https://articulo.mercadolibre.${m[1] === 'MCO' ? 'com.co' : 'com.ve'}/${m[1]}-${m[2]}` : '—'
}

// Palabras (raíces en español, sin "de/la/para…") de la pregunta, y cuántas comparte cada
// respuesta guardada: "¿se conecta con otro igual?" → {conect, otro, igual}.
const PALABRAS_CTE = `WITH qw AS (SELECT tsvector_to_array(to_tsvector('spanish', $3)) AS w)`
const COMPARTIDAS = `LATERAL (SELECT COUNT(*)::int AS n FROM unnest(tsvector_to_array(to_tsvector('spanish', p.texto))) t
                              WHERE t = ANY(qw.w)) x`

// ── Borrador con Claude ─────────────────────────────────────────────────────

export { MODELO_IA as MODELO_PREGUNTAS, iaConfigurada } from '@/lib/ia'

const SISTEMA = `Eres quien responde las preguntas de los compradores en las publicaciones de MercadoLibre de un vendedor venezolano. Escribes el BORRADOR; una persona lo revisa antes de publicarlo.

Cómo responder:
- Español de Venezuela, cordial y breve (1 a 3 frases). Saluda corto ("¡Hola!") y cierra corto si el vendedor suele hacerlo.
- Copia el tono, las frases y las políticas de las RESPUESTAS ANTERIORES DEL VENDEDOR: son su voz real. Adáptalas, no las inventes de cero.
- Usa SOLO los datos que te doy: ficha y descripción de la publicación, FICHA DE CONOCIMIENTO, stock, políticas y notas.
- Las POLÍTICAS DEL VENDEDOR son lo vigente: si una respuesta anterior o la ficha de conocimiento dicen otra cosa (montos o mínimos para envío gratis, agencias, formas de pago, retiro), manda lo que dicen las POLÍTICAS.
- Disponibilidad: si hay STOCK REAL del sistema, manda ese (si es 0, no digas que hay disponible). Si la publicación no está vinculada al sistema, guíate por la publicación: activa y con unidades = disponible (como responde siempre el vendedor); pausada o sin unidades = no lo afirmes.
- Si la publicación no tiene lo que pide el comprador y en OTRAS PUBLICACIONES DEL VENDEDOR hay una que sí lo cumple (según su título o su ficha), recomiéndala como lo hace el vendedor: dile que esta no, que la otra sí, y pon el link de esa publicación tal cual. Si ninguna cumple con certeza, no recomiendes nada.
- Nunca inventes medidas, compatibilidades, garantías, precios ni tiempos de envío. Si el dato no está, dilo en "falta_dato" y deja una respuesta prudente (o vacía) con confianza "baja".
- Prohibido: links (salvo el de otra publicación del vendedor, tal cual viene en OTRAS PUBLICACIONES), páginas web, correos, teléfonos, redes sociales, "escríbeme al…". MercadoLibre borra esas respuestas.
- En Venezuela MercadoLibre no tiene carrito de compras: no lo menciones.
- "falta_dato": una frase corta (máximo 25 palabras) para el vendedor.
- No prometas descuentos ni cosas fuera de las políticas.

Siempre termina llamando a la herramienta proponer_respuesta.`

function bloqueContexto(c: Contexto) {
  const L: string[] = []
  L.push(`PREGUNTA DEL COMPRADOR: "${c.pregunta.texto}"`)
  if (c.item) {
    L.push(`\nPUBLICACIÓN: ${c.item.title}`)
    L.push(`Condición: ${c.item.condition} · estado: ${c.item.status}` +
      (c.item.shipping?.free_shipping ? ' · envío gratis' : '') + (c.item.warranty ? ` · garantía: ${c.item.warranty}` : ''))
    const attrs = (c.item.attributes ?? []).filter(a => a.value_name).map(a => `${a.name}: ${a.value_name}`)
    if (attrs.length) L.push(`Ficha técnica: ${attrs.join(' · ')}`)
  } else if (c.titulo) {
    L.push(`
PUBLICACIÓN: ${c.titulo} (no se pudo leer la ficha en MercadoLibre)`)
  }
  // Precio: SOLO el de MercadoLibre (el que ve el comprador, con la promoción vigente).
  const pml = c.precioML ?? (c.item?.price ? { precio: c.item.price, original: null, moneda: c.item.currency_id } : null)
  if (pml) {
    const bs = pml.moneda === 'USD' && c.tasa ? ` ≈ Bs ${(pml.precio * c.tasa).toFixed(2)} a tasa BCV ${c.tasa}` : ''
    L.push(`PRECIO EN MERCADOLIBRE AHORA: ${pml.precio} ${pml.moneda}${bs}` + (pml.original ? ` (en promoción; antes ${pml.original})` : ''))
  }
  if (c.descripcion) L.push(`\nDESCRIPCIÓN:\n${c.descripcion.slice(0, 4000)}`)
  if (c.producto) {
    L.push(`\nSTOCK REAL (sistema): ${c.producto.stock} unidades (${c.producto.code} · ${c.producto.name})`)
  } else {
    L.push(`\nSTOCK REAL: esta publicación no está vinculada a un producto del sistema. En MercadoLibre: ${c.item ? `${c.item.status === 'active' ? 'activa' : c.item.status}, ${c.item.available_quantity} unidades` : 'no se pudo leer'}.`)
  }
  if (c.politicas.trim()) L.push(`\nPOLÍTICAS DEL VENDEDOR:\n${c.politicas.trim()}`)
  const precio = pml && pml.moneda === 'USD' ? pml.precio : null
  const aplican = c.plantillas.filter(p => plantillaAplica(p, precio))
  if (aplican.length) {
    L.push(`\nRESPUESTAS RÁPIDAS DEL VENDEDOR que aplican a este producto${precio !== null ? ` (precio $${precio.toFixed(2)})` : ''}. ` +
      `Si la pregunta es de disponibilidad, precio, envío o retiro, usa la que corresponda casi tal cual (solo ajusta lo mínimo):\n` +
      aplican.map(p => `- [${p.titulo}] (${condicionPlantilla(p)}): ${p.texto}`).join('\n'))
  }
  if (c.notas.length) L.push(`\nDATOS QUE EL VENDEDOR ANOTÓ DE ESTA PUBLICACIÓN:\n- ${c.notas.join('\n- ')}`)
  if (c.ficha) L.push(`\nFICHA DE CONOCIMIENTO (lo que el vendedor ya respondió de esta publicación, resumido):\n${c.ficha.texto}`)
  if (c.otras.length) {
    L.push('\nOTRAS PUBLICACIONES DEL VENDEDOR (activas y con stock; solo para recomendar si esta no cumple):')
    for (const o of c.otras) {
      L.push(`- ${o.titulo} · ${o.precio ?? '?'} ${o.moneda ?? ''} · ${o.disponible} disp. · link: ${linkCorto(o.item_id)}` +
        (o.ficha ? `\n  Ficha: ${o.ficha.slice(0, 250)}` : ''))
    }
  }
  const par = (xs: { p: string; r: string }[]) => xs.map(x => `P: ${x.p}\nR: ${x.r}`).join('\n\n')
  if (c.mismoItem.length) L.push(`\nRESPUESTAS ANTERIORES DEL VENDEDOR EN ESTA MISMA PUBLICACIÓN:\n${par(c.mismoItem)}`)
  if (c.parecidas.length) L.push(`\nRESPUESTAS ANTERIORES DEL VENDEDOR A PREGUNTAS PARECIDAS (otras publicaciones):\n${par(c.parecidas)}`)
  return L.join('\n')
}

export interface Borrador { respuesta: string; confianza: 'alta' | 'media' | 'baja'; falta_dato: string | null; web: boolean }

const HERRAMIENTA = {
  name: 'proponer_respuesta',
  description: 'Entrega el borrador de respuesta para que el vendedor lo revise.',
  input_schema: {
    type: 'object',
    properties: {
      respuesta: { type: 'string', description: 'Texto listo para publicar (vacío si no se puede responder sin inventar).' },
      confianza: { type: 'string', enum: ['alta', 'media', 'baja'], description: 'alta = todo sale de los datos dados; baja = falta información.' },
      falta_dato: { type: ['string', 'null'], description: 'Qué dato faltó para responder bien, o null.' },
    },
    required: ['respuesta', 'confianza', 'falta_dato'],
  },
}

// Pregunta SIMPLE = de las que se responden con stock, precio, políticas y respuestas rápidas
// (disponible, precio, envío, ubicación, pago) y no tocan nada técnico del producto. Esas van a
// Haiku (5× más barato); el resto, y las que Haiku no responde con confianza "alta", a Sonnet.
// Envío GRATIS y "cuántas hay" van a Sonnet: en la prueba (30 preguntas reales, 2026-10-03) Haiku
// dijo "sí" al envío gratis de una publicación que no lo tiene y esquivó el número de unidades.
const SIMPLE = /disponib|\bhay\b|precio|cu[aá]nto (sale|cuesta|es)|env[ií]|ubicad|d[oó]nde (est|qued)|tienda f[ií]sica|retir|entrega|llega|tarda|zoom|mrw|tealca|domesa|liberty|\bpag|binance|paypal|zelle|bcv|divisa|efectivo|unidades/i
const TECNICO = /compatib|sirve|funciona|conect|empare|incluye|viene con|\btrae|\bkit\b|cable|medida|\bmts?\b|metro|\bcm\b|\bmm\b|pulgada|volt|wat|bater|carg|modelo|original|instal|adapt|usb|bluetooth|color|negro|blanco|talla|tama[ñn]o|material|descuento|oferta|al mayor|garant|gratis|cu[aá]nt[ao]s/i

export const esPreguntaSimple = (texto: string) =>
  SIMPLE.test(texto) && !TECNICO.test(texto) && texto.trim().split(/\s+/).length <= 30

/** Pide el borrador a Claude. Con `web`, puede buscar en internet (el borrador queda marcado para verificar).
 *  Las preguntas simples van primero a Haiku; si no queda seguro, se rehace con Sonnet. */
export async function pedirBorrador(c: Contexto, web: boolean): Promise<Borrador & { llamadas: LlamadaIA[]; modelo: string }> {
  const sistema = SISTEMA + (web
    ? '\n\nPuedes buscar en internet SOLO datos técnicos del producto (medidas, compatibilidad, especificaciones del fabricante). Nunca precios, stock ni envíos: eso sale solo de los datos del vendedor.'
    : '')
  const contenido = bloqueContexto(c)
  const llamadas: LlamadaIA[] = []
  const pedir = async (modelo?: string) => {
    const { resultado: b, uso, modelo: m } = await llamarClaude<Borrador>({ sistema, contenido, herramienta: HERRAMIENTA, web, modelo })
    llamadas.push({ modelo: m, uso })
    return {
      respuesta: String(b.respuesta ?? '').trim(),
      confianza: (['alta', 'media', 'baja'].includes(b.confianza) ? b.confianza : 'baja') as Borrador['confianza'],
      falta_dato: b.falta_dato || null,
      web, modelo: m,
    }
  }
  if (!web && esPreguntaSimple(c.pregunta.texto)) {
    const b = await pedir(MODELO_SIMPLE).catch(() => null)
    if (b && b.confianza === 'alta' && b.respuesta) return { ...b, llamadas }
  }
  return { ...(await pedir()), llamadas }
}

// ── Sugerencias (gratis, sin IA): respuestas ya dadas a preguntas parecidas ──────────────────

// Palabras de PRESENTACIÓN (cómo se vende: por par, kit, combo…). Una respuesta que las nombra solo
// vale para publicaciones que se venden igual (la palabra está en su título). "Mínimo 2 unidades"
// (envío gratis) no es presentación: no se filtra.
const PRESENTACION = /\b(par|pares|combo|kit|pack|juego|set|docena|\d+\s*x|x\s*\d+)\b/gi
function presentacionAjena(respuesta: string, tituloActual: string | null) {
  const palabras = respuesta.toLowerCase().match(PRESENTACION)
  if (!palabras) return false
  const titulo = (tituloActual ?? '').toLowerCase()
  return palabras.some(w => !titulo.includes(w.replace(/\s+/g, ' ').trim()))
}
export interface SugerenciaPregunta { pregunta: string; respuesta: string; parecido: number; mismaPublicacion: boolean; titulo: string | null }

/** Hasta 3 respuestas propias a preguntas parecidas (las de la misma publicación pesan más),
 *  de TODAS las respondidas (la misma memoria que usa la IA). Sin repetir respuestas. */
export async function sugerenciasPregunta(db: Pool, preguntaId: number): Promise<SugerenciaPregunta[]> {
  const { rows } = await db.query(
    `WITH q AS (SELECT id, item_id, texto, item_titulo FROM ml_preguntas WHERE id = $1)
     SELECT p.texto AS pregunta, p.respuesta, similarity(p.texto, q.texto)::float AS parecido,
            p.item_id = q.item_id AS "mismaPublicacion", p.item_titulo AS titulo, q.item_titulo AS "tituloActual"
     FROM ml_preguntas p, q
     WHERE p.id <> q.id AND p.estado = 'ANSWERED' AND p.respuesta IS NOT NULL
       AND (p.texto % q.texto OR (p.item_id = q.item_id AND similarity(p.texto, q.texto) > 0.15))
     ORDER BY similarity(p.texto, q.texto) + CASE WHEN p.item_id = q.item_id THEN 0.15 ELSE 0 END DESC, p.fecha DESC
     LIMIT 30`, [preguntaId])
  const vistas = new Set<string>()
  const out: SugerenciaPregunta[] = []
  for (const x of rows) {
    // De OTRA publicación no sirve una respuesta sobre su presentación ("precio por el par", "kit de
    // 5 ruedas") si esta publicación no se vende así: la pregunta se escribe igual, la respuesta no.
    if (!x.mismaPublicacion && presentacionAjena(x.respuesta, x.tituloActual)) continue
    const clave = x.respuesta.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ' ').trim()
    if (vistas.has(clave)) continue
    vistas.add(clave)
    delete x.tituloActual
    out.push(x)
    if (out.length === 3) break
  }
  return out
}
