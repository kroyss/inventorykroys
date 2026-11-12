import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'

// GET /api/plataforma/casos-soporte → la bandeja única de soporte (todos los orígenes) + el gasto de la ayuda con IA.
// ?dia=AAAA-MM-DD&origen=… (12-11, el dueño: "ver qué preguntaron, quién y qué se le respondió") → las preguntas a la
// Ayuda de ese día, una por una.
export async function GET(req: NextRequest) {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const db = dbGlobal()
    const dia = req.nextUrl.searchParams.get('dia')
    if (dia) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
      const { rows } = await db.query(
        `SELECT a.id, a.created_at, a.pantalla, a.pregunta, a.respuesta, a.sabia, a.util, a.costo::float AS costo,
                COALESCE(u.full_name, u.username) AS persona, e.nombre AS empresa
         FROM ayuda_consultas a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN empresas e ON e.id = a.empresa_id
         WHERE (a.created_at AT TIME ZONE 'America/Caracas')::date = $1::date AND ($2::text IS NULL OR a.origen = $2)
         ORDER BY a.created_at DESC LIMIT 200`, [dia, req.nextUrl.searchParams.get('origen')])
      return NextResponse.json({ consultas: rows }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const [{ rows: casos }, { rows: dias }, { rows: falta }, { rows: [tot] }] = await Promise.all([
      db.query(
        `SELECT c.id, c.origen, c.estado, c.pantalla, c.navegador, c.created_at, c.updated_at,
                COALESCE(u.full_name, u.username) AS persona, u.username, e.nombre AS empresa,
                COALESCE((SELECT json_agg(json_build_object('id', m.id, 'autor', m.autor, 'texto', m.texto,
                            'adjuntos', m.adjuntos, 'created_at', m.created_at) ORDER BY m.id)
                          FROM soporte_mensajes m WHERE m.caso_id = c.id), '[]') AS mensajes
         FROM soporte_casos c
         LEFT JOIN users u ON u.id = c.user_id
         LEFT JOIN empresas e ON e.id = c.empresa_id
         WHERE c.estado <> 'resuelto' OR c.updated_at > NOW() - INTERVAL '30 days'
         ORDER BY (c.estado = 'abierto') DESC, c.updated_at DESC LIMIT 100`),
      // Conteo de gasto de la ayuda con IA (pedido del dueño): por día, últimos 30.
      db.query(
        `SELECT to_char((created_at AT TIME ZONE 'America/Caracas')::date, 'YYYY-MM-DD') AS dia, origen,
                COUNT(*)::int AS consultas, SUM(costo)::float AS costo,
                COUNT(*) FILTER (WHERE NOT sabia)::int AS sin_respuesta,
                COUNT(*) FILTER (WHERE util = 1)::int AS utiles, COUNT(*) FILTER (WHERE util = -1)::int AS no_utiles
         FROM ayuda_consultas WHERE created_at > NOW() - INTERVAL '30 days'
         GROUP BY 1, 2 ORDER BY 1 DESC, 2`),
      // Lo que el manual no cubre o no sirvió: qué agregarle al manual.
      db.query(
        `SELECT a.id, a.origen, a.pantalla, a.pregunta, a.respuesta, a.sabia, a.util, a.created_at, e.nombre AS empresa
         FROM ayuda_consultas a LEFT JOIN empresas e ON e.id = a.empresa_id
         WHERE (NOT a.sabia OR a.util = -1) AND a.created_at > NOW() - INTERVAL '30 days'
         ORDER BY a.created_at DESC LIMIT 50`),
      db.query(
        `SELECT COUNT(*)::int AS consultas, COALESCE(SUM(costo), 0)::float AS costo,
                COUNT(DISTINCT user_id)::int AS personas
         FROM ayuda_consultas WHERE created_at >= date_trunc('month', NOW() AT TIME ZONE 'America/Caracas') AT TIME ZONE 'America/Caracas'`),
    ])
    return NextResponse.json({ casos, ayuda: { mes: tot, dias, falta } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return apiError(err)
  }
}
