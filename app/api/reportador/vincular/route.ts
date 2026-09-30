import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbEmpresa, dbGlobal } from '@/lib/db'
import { hashToken, nuevoToken } from '@/lib/reportador'
import { ES_STAGING, MENSAJE_STAGING_REPORTADOR } from '@/lib/entorno'

const Schema = z.object({
  codigo:  z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3}-?[A-Z0-9]{3}$/, 'Código inválido'),
  nombre:  z.string().trim().max(60).optional(),
  version: z.string().trim().max(40).optional(),
})

/**
 * POST /api/reportador/vincular — el Reportador de escritorio canjea el código que se
 * generó en Despachos por un token propio (se devuelve UNA sola vez; en la base solo
 * queda su hash). Sin sesión: el código de un solo uso y con vencimiento es la llave.
 */
export async function POST(req: NextRequest) {
  if (ES_STAGING) return NextResponse.json({ error: MENSAJE_STAGING_REPORTADOR }, { status: 403 })
  try {
    const body = Schema.parse(await req.json())
    const codigo = body.codigo.includes('-') ? body.codigo : `${body.codigo.slice(0, 3)}-${body.codigo.slice(3)}`

    // El código no dice la empresa: se busca con la función que salta RLS solo para esto.
    const { rows: [emp] } = await dbGlobal().query(
      `SELECT empresa_id, country FROM reportador_empresa_por_codigo($1)`, [codigo])
    if (emp) {
      const db = dbEmpresa(emp.empresa_id, emp.country)
      const token = nuevoToken(emp.country)
      const { rows: [eq] } = await db.query(
        `UPDATE reportador_equipos
         SET token_hash = $2, codigo = NULL, codigo_expira = NULL, vinculado_at = NOW(),
             last_seen_at = NOW(), nombre = COALESCE($3, nombre), version = $4
         WHERE codigo = $1 AND codigo_expira > NOW() AND revocado_at IS NULL AND token_hash IS NULL
         RETURNING id`,
        [codigo, hashToken(token), body.nombre || null, body.version || null],
      )
      if (eq) return NextResponse.json({ token, pais: emp.country })
    }
    return NextResponse.json({ error: 'Código inválido o vencido. Genera uno nuevo en Despachos → Reportador.' }, { status: 400 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Código inválido' }, { status: 400 })
    return apiError(err)
  }
}
