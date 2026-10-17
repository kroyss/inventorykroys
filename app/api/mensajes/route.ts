import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { leerMensajesRapidos, MENSAJES_SUGERIDOS } from '@/lib/mensajesRapidos'
import { SQL_MENSAJE_VIGENTE } from '@/lib/mensajesML'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { contarPedibles } from '@/lib/pedirCalificacion'

// GET /api/mensajes?vista=sin_leer|con_nota|todas&q=&limite= → conversaciones post-venta de las cuentas
// de la empresa con su estado en Despachos (o cancelada en ML) y sus notas de ML.
//   sin_leer ("Por atender") = las que tienen mensajes del comprador sin leer;
//   todas ("Atendidas", 2026-10-14) = las demás, sin repetir las de arriba, por páginas de 10
//   (`pagina`, con el total para "1–20 de 340"); `limite` sin `pagina` = el "Ver 30 más" anterior.
//   q = buscar por comprador, nº de venta, producto, nota o lo que se habló (cualquier mensaje de la
//   conversación, no solo el último), en TODAS (atendidas o no). `coincide` = el mensaje que coincidió.
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const sp = new URL(req.url).searchParams
  const vista = sp.get('vista')
  const q = (sp.get('q') ?? '').trim().slice(0, 60)
  const limite = Math.min(Math.max(Number(sp.get('limite')) || 30, 1), 300)
  const pagina = sp.get('pagina') ? Math.min(Math.max(Math.floor(Number(sp.get('pagina'))) || 1, 1), 10_000) : null
  const POR_PAGINA = 10
  const params: unknown[] = []
  let filtro = `WHERE ${SQL_MENSAJE_VIGENTE}`
  if (q) {
    params.push(`%${q.replace(/[%_\\]/g, '')}%`)
    filtro += ` AND (c.pack_id::text LIKE $2 OR c.comprador_nick ILIKE $2 OR c.comprador_nombre ILIKE $2 OR c.productos ILIKE $2
                OR c.ultimo_texto ILIKE $2 OR c.notas ILIKE $2
                OR EXISTS (SELECT 1 FROM ml_mensajes m WHERE m.pack_id = c.pack_id AND m.texto ILIKE $2))`
  } else {
    filtro += vista === 'todas' ? ' AND c.sin_leer = 0' : vista === 'con_nota' ? ' AND c.notas IS NOT NULL' : ' AND c.sin_leer > 0'
  }
  // Por atender: todas (son pocas); atendidas y búsqueda: de a `limite` (+1 para saber si hay más).
  const tope = vista === 'sin_leer' && !q ? 200 : limite + 1
  const paginado = pagina !== null && (vista !== 'sin_leer' || !!q)
  try {
    const { rows } = await s.db.query(
      `SELECT c.pack_id::text, c.sin_leer, c.ultimo_texto, c.ultimo_de_comprador, c.ultimo_at, c.productos, c.notas,
              NULLIF(c.comprador_nick, '') AS comprador_nick, c.comprador_nombre,
              x.nickname AS cuenta, d.despachada_at, img.imagen, (o.estado = 'cancelled') AS cancelada, $1::boolean AS con_despachos,
              ${q ? `(SELECT m.texto FROM ml_mensajes m WHERE m.pack_id = c.pack_id AND m.texto ILIKE $2 ORDER BY m.fecha DESC LIMIT 1)` : 'NULL'} AS coincide
       FROM ml_conversaciones c
       JOIN ml_conexiones x ON x.id = c.conexion_id
       -- Lo que sirve para responder "¿ya lo enviaste?": si su guía ya salió en Despachos (en
       -- ZOOM/TEALCA ML no lo sabe). Dato informativo: pudo despacharse sin registrarlo aquí.
       LEFT JOIN LATERAL (
         SELECT l.generated_at AS despachada_at FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id
         WHERE e.venta = c.pack_id::text AND e.impresa AND l.status = 'GENERADO' ORDER BY l.generated_at DESC LIMIT 1
       ) d ON TRUE
       -- La venta: por número y, si no, por paquete (un OR entre las dos columnas recorría todas las ventas
       -- por cada conversación: Atendidas 1,8 s por página → 0,1 s, 17-10).
       LEFT JOIN LATERAL (SELECT * FROM (
         (SELECT estado, split_part(items[1], ':', 1) AS item FROM ml_ordenes WHERE id = c.pack_id LIMIT 1)
         UNION ALL
         (SELECT estado, split_part(items[1], ':', 1) AS item FROM ml_ordenes WHERE pack_id = c.pack_id LIMIT 1)) u LIMIT 1
       ) o ON TRUE
       -- Foto del primer producto, de lo ya guardado (catálogo o preguntas): la lista no consulta a ML.
       LEFT JOIN LATERAL (
         SELECT COALESCE((SELECT thumbnail FROM ml_catalogo k WHERE k.item_id = o.item),
                         (SELECT item_imagen FROM ml_preguntas q WHERE q.item_id = o.item AND q.item_imagen IS NOT NULL LIMIT 1)) AS imagen
       ) img ON TRUE
       ${filtro}
       ORDER BY (c.sin_leer > 0) DESC, c.ultimo_at DESC NULLS LAST, c.pack_id DESC
       ${paginado ? `LIMIT ${POR_PAGINA} OFFSET ${(pagina! - 1) * POR_PAGINA}` : `LIMIT ${tope}`}`, [tieneModulo(s.session.user, 'despachos'), ...params])
    const hayMas = !paginado && tope === limite + 1 && rows.length > limite
    if (hayMas) rows.pop()
    let total: number | null = null
    if (paginado) {
      const { rows: [t] } = await s.db.query(
        `SELECT COUNT(*)::int AS n FROM ml_conversaciones c ${filtro.replaceAll('$2', '$1')}`, params)
      total = t.n
    }
    const { rows: [n] } = await s.db.query(
      `SELECT COUNT(*) FILTER (WHERE sin_leer > 0)::int AS conversaciones, COALESCE(SUM(sin_leer), 0)::int AS mensajes,
              COUNT(*) FILTER (WHERE notas IS NOT NULL)::int AS con_nota
       FROM ml_conversaciones WHERE ${SQL_MENSAJE_VIGENTE}`)
    // Respuestas rápidas (botones en cada conversación); `sugeridas` = ejemplos para el editor.
    const { rows: [pl] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'mensajes_plantillas'`)
    const { rows: [cta] } = await s.db.query(`SELECT nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY id LIMIT 1`)
    return NextResponse.json({
      conversaciones: rows, hay_mas: hayMas, total, por_pagina: POR_PAGINA, sin_leer: n, rapidas: leerMensajesRapidos(pl?.value), esAdmin: puede(s.session.user, 'automatizaciones_config'),
      sugeridas: MENSAJES_SUGERIDOS(cta?.nickname),
      // Pestaña "Pedir calificación" (lib/pedirCalificacion.ts): cuántas hay para pedir hoy.
      pedir: await contarPedibles(s.db).catch(() => 0),
      // Pestaña Recordatorios (lib/recordatoriosPago.ts): solo con Pagos ME.
      recordatorios: tieneModulo(s.session.user, 'pagos_me') && s.session.user.country === 'VE',
    })
  } catch (err) {
    return apiError(err)
  }
}
