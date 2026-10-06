// Prueba de la cuenta demo contra una base (staging): crea una empresa de prueba, siembra todo
// (lib/demoDatos.ts) y recorre los flujos del MercadoLibre simulado (lib/demoML.ts) por mlFetch.
// TODO dentro de UNA transacción que al final se deshace: no deja nada en la base.
//   DATABASE_URL=… npx tsx scripts/demo/probar.ts
import { Client } from 'pg'
import type { Pool } from 'pg'
import { restaurarDemo, SECCIONES_DEMO } from '@/lib/demoDatos'
import { mlFetch } from '@/lib/ml'
import { SQL_BANDEJA_ML } from '@/lib/calificacionesML'
import { SQL_PENDIENTE, SQL_REPORTABLE } from '@/lib/reportador'

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  // Las transacciones de restaurarDemo quedan dentro de la de la prueba (que se deshace).
  const db = {
    query: (sql: string, params?: unknown[]) =>
      /^(BEGIN|COMMIT)$/i.test(sql.trim()) ? Promise.resolve({ rows: [], rowCount: 0 }) : c.query(sql, params),
  } as unknown as Pool
  const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FALLÓ: ' + msg); console.log('  ✓', msg) }
  await c.query('BEGIN')
  try {
    const { rows: [o] } = await c.query(`INSERT INTO organizaciones (nombre, estado) VALUES ('Prueba demo', 'activo') RETURNING id`)
    const { rows: [e] } = await c.query(
      `INSERT INTO empresas (organizacion_id, nombre, country, modulos, ia_limite_mes) VALUES ($1, 'Prueba demo', 'VE', $2, NULL) RETURNING id`,
      [o.id, ['despachos', 'reportador', 'preguntas', 'alertas_stock']])
    await c.query(`SELECT set_config('app.empresa_id', $1, true), set_config('TimeZone', 'America/Caracas', true)`, [String(e.id)])
    console.log('Empresa de prueba', e.id)

    let t = Date.now()
    await restaurarDemo(db, SECCIONES_DEMO.map(x => x.id))
    console.log(`Siembra completa en ${Date.now() - t} ms`)
    const { rows: [n] } = await c.query(
      `SELECT
         (SELECT COUNT(*) FROM ml_ordenes o WHERE o.id BETWEEN 2000099991000001 AND 2000099991099999)::int AS despachos,
         (SELECT COUNT(*) FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id JOIN despacho_jornadas j ON j.id = l.jornada_id
            WHERE ${SQL_REPORTABLE} AND ${SQL_PENDIENTE})::int AS reportador,
         (SELECT COUNT(*) FROM ml_preguntas WHERE estado = 'UNANSWERED')::int AS preguntas,
         (SELECT COUNT(*) FROM ml_preguntas WHERE estado = 'ANSWERED')::int AS respondidas,
         (SELECT COUNT(*) FROM ml_conversaciones WHERE sin_leer > 0)::int AS mensajes,
         (SELECT COUNT(*) FROM (${SQL_BANDEJA_ML}) b WHERE b.sugerencia = 'concretada')::int AS cal_concretadas,
         (SELECT COUNT(*) FROM (${SQL_BANDEJA_ML}) b WHERE b.sugerencia = 'no_concretada')::int AS cal_no,
         (SELECT COUNT(*) FROM (${SQL_BANDEJA_ML}) b WHERE b.sugerencia = 'esperar')::int AS cal_esperar,
         (SELECT COUNT(*) FROM ml_stock_alertas a WHERE a.actualizado_at > NOW() - INTERVAL '1 day' AND a.disponible <= 0)::int AS agotadas,
         (SELECT COUNT(*) FROM ml_stock_alertas a WHERE a.actualizado_at > NOW() - INTERVAL '1 day' AND a.disponible BETWEEN 1 AND 2)::int AS bajas`, [3])
    console.log(n)
    ok(n.despachos === 50 && n.reportador === 24 && n.preguntas === 15 && n.mensajes === 10, 'pendientes sembrados')

    // Restaurar dos veces seguidas (idempotente) y una sección sola
    t = Date.now()
    await restaurarDemo(db, SECCIONES_DEMO.map(x => x.id))
    await restaurarDemo(db, ['preguntas'])
    ok(true, `re-siembra sin errores (${Date.now() - t} ms)`)

    const { rows: cx } = await c.query(`SELECT id, nickname FROM ml_conexiones ORDER BY id`)
    const cid = cx[0].id
    // Preguntas: responder + releer; la de publicación pausada da "must be active"; reponer stock la reactiva.
    const { rows: [q] } = await c.query(`SELECT id::text, conexion_id FROM ml_preguntas WHERE estado = 'UNANSWERED' AND item_estado = 'active' LIMIT 1`)
    await mlFetch(db, q.conexion_id, '/answers', { method: 'POST', body: { question_id: Number(q.id), text: 'Respuesta de prueba' } })
    const v = await mlFetch<{ status: string; answer: { status: string } }>(db, q.conexion_id, `/questions/${q.id}?api_version=4`)
    ok(v.status === 'ANSWERED' && v.answer.status === 'ACTIVE', 'pregunta respondida y releída')
    const { rows: [pz] } = await c.query(`SELECT id::text, conexion_id, item_id FROM ml_preguntas WHERE item_estado = 'paused' LIMIT 1`)
    let pausada = ''
    try { await mlFetch(db, pz.conexion_id, '/answers', { method: 'POST', body: { question_id: Number(pz.id), text: 'x' } }) } catch (err) { pausada = String(err) }
    ok(/must be active/i.test(pausada), 'publicación pausada no deja responder')
    const it0 = await mlFetch<{ status: string; available_quantity: number }>(db, pz.conexion_id, `/items/${pz.item_id}?attributes=status`)
    ok(it0.status === 'paused' && it0.available_quantity === 0, 'publicación pausada sin stock')
    await mlFetch(db, pz.conexion_id, `/items/${pz.item_id}`, { method: 'PUT', body: { available_quantity: 10 } })
    const it1 = await mlFetch<{ status: string; available_quantity: number }>(db, pz.conexion_id, `/items/${pz.item_id}?attributes=status`)
    ok(it1.status === 'active' && it1.available_quantity === 10, 'reponer stock la reactiva')
    const desc = await mlFetch<{ plain_text: string }>(db, cid, `/items/${pz.item_id}/description`)
    ok(desc.plain_text.length > 20, 'descripción de la publicación')

    // Mensajes: hilo, responder, órdenes, notas
    const { rows: [conv] } = await c.query(`SELECT pack_id::text, conexion_id FROM ml_conversaciones WHERE sin_leer > 0 LIMIT 1`)
    const { rows: [{ ml_user_id: s }] } = await c.query(`SELECT ml_user_id FROM ml_conexiones WHERE id = $1`, [conv.conexion_id])
    const h = await mlFetch<{ messages: unknown[] }>(db, conv.conexion_id, `/messages/packs/${conv.pack_id}/sellers/${s}?tag=post_sale&mark_as_read=false&limit=50&offset=0`)
    ok(h.messages.length >= 1, `hilo con ${h.messages.length} mensaje(s)`)
    await mlFetch(db, conv.conexion_id, `/messages/packs/${conv.pack_id}/sellers/${s}?tag=post_sale`, { method: 'POST', body: { text: 'Hola, prueba' } })
    const h2 = await mlFetch<{ messages: unknown[] }>(db, conv.conexion_id, `/messages/packs/${conv.pack_id}/sellers/${s}?tag=post_sale&mark_as_read=true&limit=50&offset=0`)
    ok(h2.messages.length === h.messages.length + 1, 'respuesta agregada al hilo')
    const orden = await mlFetch<{ buyer: { id: number; nickname: string }; order_items: unknown[] }>(db, conv.conexion_id, `/orders/${conv.pack_id}`)
    ok(orden.buyer.id > 0 && orden.order_items.length > 0, `orden con comprador ${orden.buyer.nickname}`)
    await mlFetch(db, conv.conexion_id, `/orders/${conv.pack_id}/notes`, { method: 'POST', body: { note: 'Nota de prueba' } })
    const notas = await mlFetch<{ results: { note: string }[] }[]>(db, conv.conexion_id, `/orders/${conv.pack_id}/notes`)
    ok(notas[0].results.some(x => x.note === 'Nota de prueba'), 'nota creada y leída')
    let p404 = ''
    try { await mlFetch(db, cid, '/packs/123') } catch (err) { p404 = String(err) }
    ok(/404/.test(p404), 'ruta desconocida = 404')

    // Sugerencias de mensajes: hay respuestas parecidas
    const { rows: sug } = await c.query(
      `SELECT COUNT(*)::int AS n FROM ml_mensajes b WHERE NOT b.propio AND b.texto % 'me puede indicar el número de guía'`)
    console.log('  mensajes parecidos a "número de guía":', sug[0].n)
  } finally {
    await c.query('ROLLBACK')
    await c.end()
    console.log('ROLLBACK: la base quedó como estaba')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
