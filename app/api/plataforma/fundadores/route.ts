import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { RONDA_ACTUAL, PUNTAJE_MAXIMO } from '@/lib/fundadores'

// GET /api/plataforma/fundadores → solicitudes de la ronda (mejor puntaje primero) y tandas.
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const db = dbGlobal()
    const [{ rows: solicitudes }, { rows: tandas }] = await Promise.all([
      db.query(
        `SELECT id, nombre, telegram, instagram, tipo, activacion, nick_ml, mensaje, ventas_mes, cuentas, despacho, dolor, inventario, herramientas, compromiso, puntaje, estado,
                tanda, sospechosa, ml_verificado, notas, created_at, revisada_at,
                COALESCE((SELECT json_agg(f.id ORDER BY f.id) FROM fundadores_fotos f WHERE f.solicitud_id = s.id), '[]') AS fotos,
                -- Lo investigado de la misma persona en rondas anteriores (mismo Telegram o nick).
                COALESCE((SELECT json_agg(json_build_object('ronda', p.ronda, 'estado', p.estado, 'notas', p.notas,
                            'fecha', to_char(p.created_at, 'DD/MM/YYYY'),
                            'fotos', COALESCE((SELECT json_agg(f.id ORDER BY f.id) FROM fundadores_fotos f WHERE f.solicitud_id = p.id), '[]'))
                          ORDER BY p.created_at DESC)
                   FROM fundadores_solicitudes p
                   WHERE p.id <> s.id AND (lower(p.telegram) = lower(s.telegram)
                         OR (s.nick_ml IS NOT NULL AND lower(p.nick_ml) = lower(s.nick_ml)))
                     AND (p.notas IS NOT NULL OR EXISTS (SELECT 1 FROM fundadores_fotos f WHERE f.solicitud_id = p.id))), '[]') AS previas
         FROM fundadores_solicitudes s WHERE ronda = $1
         ORDER BY CASE estado WHEN 'calificado' THEN 0 WHEN 'aprobado' THEN 1 WHEN 'espera' THEN 2 WHEN 'rechazado' THEN 3 ELSE 4 END,
                  puntaje DESC, created_at`, [RONDA_ACTUAL]),
      db.query(
        `SELECT t.numero, t.cupos, t.abierta, to_char(t.inscribe_desde, 'YYYY-MM-DD') AS inscribe_desde,
              to_char(t.inscribe_hasta, 'YYYY-MM-DD') AS inscribe_hasta,
                (SELECT COUNT(*)::int FROM fundadores_solicitudes s WHERE s.tanda = t.numero AND s.estado = 'aprobado') AS tomados
         FROM fundadores_tandas t WHERE t.ronda = $1 ORDER BY t.numero`, [RONDA_ACTUAL]),
    ])
    return NextResponse.json({ solicitudes, tandas, maximo: PUNTAJE_MAXIMO })
  } catch (err) {
    return apiError(err)
  }
}
