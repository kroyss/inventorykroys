import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { soloDueno } from '@/lib/plataforma'
import { dbGlobal } from '@/lib/db'

// GET /api/plataforma/radar-pruebas (18-11, el dueño, mig 186): Programas y promos → Prueba Radar. Quién probó el Radar
// (cuentas nuevas desde el 18-11: 10 búsquedas en 7 días), cuántas usó, si sigue, terminó o pagó, y su contacto del
// registro. El avance lo reporta el Radar (radar_prueba_reportar). Solo el dueño de la plataforma.
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const { rows } = await dbGlobal().query(
      `SELECT p.user_id, u.username, COALESCE(u.full_name, u.username) AS nombre, p.desde, p.hasta, p.busquedas, p.repetida, p.ultima_at,
              o.id AS organizacion_id, o.nombre AS organizacion, o.origen, o.estado,
              o.registro - 'ip_hash' - 'navegador' AS registro,
              (o.radar_mes_hasta >= (NOW() AT TIME ZONE 'America/Caracas')::date OR o.estado IN ('activo', 'propietario')) AS pago
       FROM radar_pruebas p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN LATERAL (
         SELECT o.* FROM usuario_empresas ue JOIN empresas e ON e.id = ue.empresa_id JOIN organizaciones o ON o.id = e.organizacion_id
         WHERE ue.user_id = u.id ORDER BY o.created_at DESC LIMIT 1) o ON TRUE
       ORDER BY p.ultima_at DESC
       LIMIT 300`)
    return NextResponse.json({ pruebas: rows }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return apiError(err)
  }
}
