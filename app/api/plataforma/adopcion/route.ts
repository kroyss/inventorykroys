import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { ENTORNO } from '@/lib/telegram'
import type { Country } from '@/lib/types'
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
              'inventario' = ANY(e.modulos) AS inventario, u.cuentas, u.conectada_at, e.country,
              'pagos_me' = ANY(e.modulos) AS con_pagos_me,
              -- Avisos por Telegram: alguien de la empresa lo vinculó (en este entorno).
              EXISTS (SELECT 1 FROM telegram_usuarios t JOIN usuario_empresas ue ON ue.user_id = t.user_id
                      WHERE ue.empresa_id = e.id AND t.chat_id IS NOT NULL AND t.entorno = $4) AS telegram,
              a.ventas, a.preguntas, a.preguntas_sistema, a.guias, a.reportadas, a.calificadas, a.calificadas_sistema,
              a.mensajes_sistema, a.stock, a.ia, a.usuarios_7d, a.ultimo_uso, a.abierta_at,
              COALESCE(a.ultimo_uso > NOW() - make_interval(mins => $3), FALSE) AS en_linea,
              COALESCE(a.abierta_at > NOW() - make_interval(mins => $3), FALSE) AS abierta
       FROM plataforma_adopcion($1) a
       JOIN empresas e ON e.id = a.empresa_id
       JOIN organizaciones o ON o.id = e.organizacion_id
       LEFT JOIN plataforma_uso_clientes() u ON u.empresa_id = e.id
       ORDER BY e.organizacion_id = $2 DESC, a.ventas DESC, e.nombre`, [dias, ORGANIZACION_PLATAFORMA, EN_LINEA_MINUTOS, ENTORNO])
    // Pagos ME (solo con el módulo, hoy pocas empresas): pagos verificados en el período. me_pagos es por empresa
    // (RLS): se cuenta con la conexión de cada una. null = no tiene el módulo.
    // 23-10: y en qué quedó la conexión (vinculado / lo intentó / sin intentar), con lo que el sistema ya guarda.
    for (const r of rows) {
      const m = r.con_pagos_me
        ? await conEmpresa(r.id, r.country as Country, db => db.query(
            `SELECT (SELECT COUNT(*)::int FROM me_pagos WHERE verificado_at > NOW() - make_interval(days => $1)) AS n,
                    (EXISTS (SELECT 1 FROM me_latidos WHERE perfil <> 'DESPERTADOR') OR EXISTS (SELECT 1 FROM me_pagos)) AS vinculado,
                    (EXISTS (SELECT 1 FROM me_latidos) OR EXISTS (SELECT 1 FROM me_claves) OR EXISTS (SELECT 1 FROM me_codigos)
                     OR EXISTS (SELECT 1 FROM me_pedidos WHERE pedido_por IS NOT NULL)) AS intento`, [dias]))
            .then(x => x.rows[0]).catch(() => null)
        : null
      r.pagos_me = m ? m.n as number : r.con_pagos_me ? 0 : null
      r.pagos_me_estado = m ? (m.vinculado ? 'vinculado' : m.intento ? 'intento' : 'sin_intentar') : null
      delete r.con_pagos_me
    }
    return NextResponse.json({ dias, empresas: rows })
  } catch (err) {
    return apiError(err)
  }
}
