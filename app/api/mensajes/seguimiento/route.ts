import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { tieneModulo } from '@/lib/modulos'
import { leerPlantillasCal } from '@/lib/calificacionesML'

// GET /api/mensajes/seguimiento?filtro=sin_concretar|atencion&horas=24|12&pagina=1  (11-11, pedido del dueño)
// Mensajes → Atendidas → chips «Sin concretar» / «Requiere atención»: las ventas de ML que todavía no muestran señal de
// pago (ni pago traído en Pagos ME, ni venta registrada, ni guía en Despachos, ni "Ya pagó" en Recordatorios), dentro
// del plazo que la empresa le da antes de marcarla no concretada (Calificaciones). Pasado el plazo ya la ve Calificaciones.
// «Requiere atención» = además, sin ningún movimiento (mensaje de cualquiera de los dos o recordatorio) en las últimas N h.
// `senal`: 'completa' con Pagos ME; 'parcial' con Despachos o Ventas (puede no ver pagos recientes); null = no se muestra.
const POR_PAGINA = 10

export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const u = s.session.user
  const senal = tieneModulo(u, 'pagos_me') ? 'completa'
    : tieneModulo(u, 'despachos') || tieneModulo(u, 'inventario') ? 'parcial' : null
  if (!senal) return NextResponse.json({ senal: null })
  const sp = new URL(req.url).searchParams
  const filtro = sp.get('filtro') === 'atencion' ? 'atencion' : sp.get('filtro') === 'sin_concretar' ? 'sin_concretar' : null
  const horas = sp.get('horas') === '12' ? 12 : 24
  const pagina = Math.min(Math.max(Math.floor(Number(sp.get('pagina'))) || 1, 1), 1000)
  try {
    const { rows: [pl] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_plantillas'`)
    const plazo = Math.max(1, leerPlantillasCal(pl?.value).noConcretada.dias || 3)
    const BASE = `
      WITH v AS (
        SELECT DISTINCT ON (COALESCE(o.pack_id, o.id)) COALESCE(o.pack_id, o.id) AS pack, o.id, o.conexion_id, o.fecha,
               o.comprador, o.comprador_nombre, o.productos, split_part(o.items[1], ':', 1) AS item, x.nickname AS cuenta
        FROM ml_ordenes o JOIN ml_conexiones x ON x.id = o.conexion_id AND x.estado = 'activa'
        WHERE o.fecha > NOW() - make_interval(days => $1)
        ORDER BY COALESCE(o.pack_id, o.id), o.fecha
      ), s AS (
        SELECT v.*, COALESCE(r.enviados, 0) AS recordatorios, r.ultimo_at AS rec_at,
               (SELECT max(m.fecha) FROM ml_mensajes m WHERE m.pack_id = v.pack AND NOT m.propio AND m.fecha > v.fecha) AS comprador_at,
               (SELECT max(m.fecha) FROM ml_mensajes m WHERE m.pack_id = v.pack AND m.fecha > v.fecha) AS mensaje_at
        FROM v LEFT JOIN ml_recordatorios r ON r.pack_id = v.pack
        WHERE r.detenido IS NULL
          AND NOT EXISTS (SELECT 1 FROM ml_ordenes o2 WHERE COALESCE(o2.pack_id, o2.id) = v.pack
                            AND (o2.estado = 'cancelled' OR o2.cal_vendedor IS NOT NULL))
          AND NOT EXISTS (SELECT 1 FROM me_pagos p WHERE p.venta IN (v.id::text, v.pack::text) AND p.verificacion <> 'invalido')
          AND NOT EXISTS (SELECT 1 FROM sales sa WHERE sa.ml_order_number IN (v.id::text, v.pack::text))
          AND NOT EXISTS (SELECT 1 FROM despacho_etiquetas e WHERE e.venta IN (v.id::text, v.pack::text))
      ), t AS (
        SELECT s.*, GREATEST(s.fecha, s.mensaje_at, s.rec_at) AS ultimo_mov,
               (GREATEST(s.fecha, s.mensaje_at, s.rec_at) < NOW() - make_interval(hours => $2)) AS atencion
        FROM s)`
    const { rows: [n] } = await s.db.query(
      `${BASE} SELECT COUNT(*)::int AS sin_concretar, COUNT(*) FILTER (WHERE atencion)::int AS atencion FROM t`, [plazo, horas])
    let rows: unknown[] = []
    if (filtro) {
      ({ rows } = await s.db.query(
        `${BASE}
         SELECT t.pack::text AS pack_id, t.cuenta, t.fecha, t.recordatorios, t.ultimo_mov, t.atencion,
                (t.comprador_at IS NULL) AS nunca_escribio,
                floor(EXTRACT(EPOCH FROM NOW() - t.fecha) / 86400)::int + 1 AS dia,
                t.fecha + make_interval(days => $1) AS vence_at,
                COALESCE(c.sin_leer, 0) AS sin_leer, c.ultimo_texto, c.ultimo_de_comprador, c.ultimo_at,
                COALESCE(c.productos, t.productos) AS productos, c.notas,
                COALESCE(NULLIF(c.comprador_nick, ''), t.comprador) AS comprador_nick, COALESCE(c.comprador_nombre, t.comprador_nombre) AS comprador_nombre,
                COALESCE((SELECT thumbnail FROM ml_catalogo k WHERE k.item_id = t.item),
                         (SELECT item_imagen FROM ml_preguntas q WHERE q.item_id = t.item AND q.item_imagen IS NOT NULL LIMIT 1)) AS imagen
         FROM t LEFT JOIN ml_conversaciones c ON c.pack_id = t.pack
         ${filtro === 'atencion' ? 'WHERE t.atencion' : ''}
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
