import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { tieneModulo } from '@/lib/modulos'
import { leerPlantillasCal } from '@/lib/calificacionesML'
import { AUTOMATICOS } from '@/lib/mensajesML'

// GET /api/mensajes/seguimiento?filtro=sin_concretar|atencion&horas=24|12&pagina=1  (11-11, pedido del dueño)
// Mensajes → Atendidas → chips «Sin concretar» / «Requiere atención»: las ventas de ML que todavía no muestran señal de
// pago (ni pago traído en Pagos ME, ni venta registrada, ni guía en Despachos, ni "Ya pagó" en Recordatorios), dentro
// del plazo que la empresa le da antes de marcarla no concretada (Calificaciones). Pasado el plazo ya la ve Calificaciones.
// «Requiere atención» = además, sin ningún movimiento (mensaje de cualquiera de los dos o recordatorio) en las últimas N h.
// 11-11 (el dueño): también sale de la lista si en la conversación está el mensaje automático de ML «El número de guía
// para tu envío es…» (llega al llenar el formulario de MercadoEnvíos = pagó; 99 % de las pagadas en Pagos ME lo tienen).
// Con eso sirve a toda empresa con Mensajes. `senal`: 'completa' con Pagos ME (muestra si se trajeron los pagos hoy); 'ml' el resto.
// 12-11 (el dueño): «Sin mensaje» mide solo mensajes de PERSONAS (comprador o equipo): los recordatorios y demás
// mensajes automáticos (respuestas_origen fuente 'automatica' a ±2 min, o los avisos de ML) no reinician el reloj.
// El mismo comprador con varias compras sin pagar sale en UNA fila (`compras`, `packs`), con la que vence antes.
const POR_PAGINA = 10

export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const u = s.session.user
  const senal = tieneModulo(u, 'pagos_me') ? 'completa' : 'ml'
  const sp = new URL(req.url).searchParams
  const filtro = sp.get('filtro') === 'atencion' ? 'atencion' : sp.get('filtro') === 'sin_concretar' ? 'sin_concretar' : null
  const horas = sp.get('horas') === '24' ? 24 : 12
  const pagina = Math.min(Math.max(Math.floor(Number(sp.get('pagina'))) || 1, 1), 1000)
  try {
    const { rows: [pl] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_plantillas'`)
    const plazo = Math.max(1, leerPlantillasCal(pl?.value).noConcretada.dias || 3)
    const BASE = `
      WITH v AS MATERIALIZED (
        SELECT DISTINCT ON (COALESCE(o.pack_id, o.id)) COALESCE(o.pack_id, o.id) AS pack, o.id, o.conexion_id, o.fecha,
               o.comprador, o.comprador_nombre, o.productos, split_part(o.items[1], ':', 1) AS item, x.nickname AS cuenta
        FROM ml_ordenes o JOIN ml_conexiones x ON x.id = o.conexion_id AND x.estado = 'activa'
        WHERE o.fecha > NOW() - make_interval(days => $1)
        ORDER BY COALESCE(o.pack_id, o.id), o.fecha
      ),
      -- Las señales de pago se juntan UNA vez solo para estas ventas (11-11: con un NOT EXISTS por venta y tabla, con
      -- IN (id, pack), Postgres recorría Ventas entera por cada una: 1,1 s → 0,07 s).
      claves AS MATERIALIZED (SELECT id::text AS k FROM v UNION SELECT pack::text FROM v),
      pagadas AS MATERIALIZED (
        SELECT venta AS k FROM me_pagos WHERE verificacion <> 'invalido' AND venta IN (SELECT k FROM claves)
        UNION SELECT ml_order_number FROM sales WHERE ml_order_number IN (SELECT k FROM claves)
        UNION SELECT venta FROM despacho_etiquetas WHERE venta IN (SELECT k FROM claves)
        UNION SELECT pack_id::text FROM ml_mensajes WHERE pack_id IN (SELECT pack FROM v) AND propio
                AND texto ~* 'n[uú]mero de gu[ií]a para tu env[ií]o'
        UNION SELECT COALESCE(pack_id, id)::text FROM ml_ordenes WHERE COALESCE(pack_id, id) IN (SELECT pack FROM v)
                AND (estado = 'cancelled' OR cal_vendedor IS NOT NULL)
      ), s AS (
        SELECT v.*, COALESCE(r.enviados, 0) AS recordatorios, r.ultimo_at AS rec_at,
               (SELECT max(m.fecha) FROM ml_mensajes m WHERE m.pack_id = v.pack AND NOT m.propio AND m.fecha > v.fecha) AS comprador_at,
               (SELECT max(m.fecha) FROM ml_mensajes m WHERE m.pack_id = v.pack AND m.fecha > v.fecha
                  AND NOT (m.propio AND (m.texto ~* '${AUTOMATICOS}' OR EXISTS (
                    SELECT 1 FROM respuestas_origen o WHERE o.modulo = 'mensajes' AND o.ref = v.pack::text AND o.fuente = 'automatica'
                      AND o.fecha BETWEEN m.fecha - INTERVAL '2 minutes' AND m.fecha + INTERVAL '2 minutes')))) AS mensaje_at
        FROM v LEFT JOIN ml_recordatorios r ON r.pack_id = v.pack
        WHERE r.detenido IS NULL AND NOT EXISTS (SELECT 1 FROM pagadas p WHERE p.k IN (v.id::text, v.pack::text))
      ), t AS (
        SELECT s.*, COALESCE(s.comprador, s.pack::text) AS quien, GREATEST(s.fecha, s.mensaje_at) AS ultimo_mov,
               (GREATEST(s.fecha, s.mensaje_at) < NOW() - make_interval(hours => $2)) AS atencion
        FROM s)`
    const { rows: [n] } = await s.db.query(
      `${BASE} SELECT COUNT(DISTINCT (conexion_id, quien))::int AS sin_concretar,
                 COUNT(DISTINCT (conexion_id, quien)) FILTER (WHERE atencion)::int AS atencion FROM t`, [plazo, horas])
    let rows: unknown[] = []
    if (filtro) {
      ({ rows } = await s.db.query(
        `${BASE}, g AS (
           SELECT t.*, count(*) OVER w AS compras, row_number() OVER (w ORDER BY t.fecha, t.pack) AS rn,
                  array_agg(t.pack::text) OVER (w ORDER BY t.fecha, t.pack ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS packs
           FROM t ${filtro === 'atencion' ? 'WHERE t.atencion' : ''}
           WINDOW w AS (PARTITION BY t.conexion_id, t.quien))
         SELECT t.pack::text AS pack_id, t.compras::int AS compras, t.packs, (t.mensaje_at IS NULL) AS sin_mensajes, t.cuenta, t.fecha, t.recordatorios, t.ultimo_mov, t.atencion,
                (t.comprador_at IS NULL) AS nunca_escribio,
                floor(EXTRACT(EPOCH FROM NOW() - t.fecha) / 86400)::int + 1 AS dia,
                t.fecha + make_interval(days => $1) AS vence_at,
                COALESCE(c.sin_leer, 0) AS sin_leer, c.ultimo_texto, c.ultimo_de_comprador, c.ultimo_at,
                COALESCE(c.productos, t.productos) AS productos, c.notas,
                COALESCE(NULLIF(c.comprador_nick, ''), t.comprador) AS comprador_nick, COALESCE(c.comprador_nombre, t.comprador_nombre) AS comprador_nombre,
                COALESCE((SELECT thumbnail FROM ml_catalogo k WHERE k.item_id = t.item),
                         (SELECT item_imagen FROM ml_preguntas q WHERE q.item_id = t.item AND q.item_imagen IS NOT NULL LIMIT 1)) AS imagen
         FROM g t LEFT JOIN ml_conversaciones c ON c.pack_id = t.pack
         WHERE t.rn = 1
         ORDER BY t.fecha, t.pack
         LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`, [plazo, horas]))
    }
    // Pagos ME: el último "Traer pagos y guías" que terminó bien (hoy = en la fecha del país de la empresa).
    let traido: string | null = null
    if (senal === 'completa') {
      const { rows: [m] } = await s.db.query(
        `SELECT to_char(max((r.value->>'at')::timestamptz), 'HH24:MI') AS hora
         FROM me_pedidos p CROSS JOIN LATERAL jsonb_each(p.resultados) r
         WHERE p.pedido_at > NOW() - INTERVAL '2 days' AND (r.value->>'ok') = 'true'
           AND (r.value->>'at')::timestamptz::date = CURRENT_DATE`)
      traido = m?.hora ?? null
    }
    return NextResponse.json({ senal, plazo, horas, contadores: n, lista: rows, traido, porPagina: POR_PAGINA,
      total: filtro === 'atencion' ? n.atencion : n.sin_concretar })
  } catch (err) {
    return apiError(err)
  }
}
