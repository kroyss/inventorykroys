import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { EN_LINEA_MINUTOS, soloDueno } from '@/lib/plataforma'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'

// GET /api/plataforma/adopcion?dias=14 → Plataforma → Uso: de cada empresa, cuánto hace EN el sistema contra
// el total en MercadoLibre (preguntas, guías, reportes, calificaciones), quién lo usó de verdad y cuándo.
// Funciones SECURITY DEFINER (migraciones 073 y 092): leen todas las empresas.
export async function GET(req: NextRequest) {
  const g = await soloDueno()
  if ('error' in g) return g.error
  const d = Number(req.nextUrl.searchParams.get('dias'))
  const dias = [7, 14, 30].includes(d) ? d : 14
  try {
    const { rows } = await dbGlobal().query(
      `SELECT e.id, e.nombre, e.organizacion_id = $2 AS propia, o.estado, o.fundador, to_char(o.prueba_hasta, 'YYYY-MM-DD') AS prueba_hasta,
              'inventario' = ANY(e.modulos) AS inventario, u.cuentas, u.conectada_at,
              a.ventas, a.preguntas, a.preguntas_sistema, a.guias, a.reportadas, a.calificadas, a.calificadas_sistema,
              a.mensajes_sistema, a.stock, a.ia, a.usuarios_7d, a.ultimo_uso, a.abierta_at,
              COALESCE(a.ultimo_uso > NOW() - make_interval(mins => $3), FALSE) AS en_linea,
              COALESCE(a.abierta_at > NOW() - make_interval(mins => $3), FALSE) AS abierta
       FROM plataforma_adopcion($1) a
       JOIN empresas e ON e.id = a.empresa_id
       JOIN organizaciones o ON o.id = e.organizacion_id
       LEFT JOIN plataforma_uso_clientes() u ON u.empresa_id = e.id
       ORDER BY e.organizacion_id = $2 DESC, a.ventas DESC, e.nombre`, [dias, ORGANIZACION_PLATAFORMA, EN_LINEA_MINUTOS])
    return NextResponse.json({ dias, empresas: rows })
  } catch (err) {
    return apiError(err)
  }
}
