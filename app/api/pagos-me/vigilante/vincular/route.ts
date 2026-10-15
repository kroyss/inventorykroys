import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbEmpresa, dbGlobal } from '@/lib/db'
import { hashClave, hashCodigo, normalizarCodigo, nuevaClave } from '@/lib/pagosME'

/**
 * POST /api/pagos-me/vigilante/vincular { codigo } (sin sesión) → { clave }. Lo llaman el programa de la
 * PC y la extensión de cada perfil con el código que se generó en Pagos ME (migración 093). Cada canje
 * emite una clave propia; el código vence a los 60 min y admite pocos usos.
 */
export async function POST(req: NextRequest) {
  try {
    const { codigo } = z.object({ codigo: z.string().max(20) }).parse(await req.json())
    if (normalizarCodigo(codigo).length !== 8) {
      return NextResponse.json({ error: 'El código tiene 8 letras y números (por ejemplo ABCD-2345)' }, { status: 400 })
    }
    const { rows: [emp] } = await dbGlobal().query(
      `SELECT empresa_id, country, modulos FROM me_canjear_codigo($1)`, [hashCodigo(codigo)])
    if (!emp) {
      return NextResponse.json({ error: 'Código incorrecto o vencido: genera uno nuevo en Pagos ME' }, { status: 401 })
    }
    if (!emp.modulos?.includes('pagos_me')) {
      return NextResponse.json({ error: 'Pagos MercadoEnvíos no está activo en esta empresa' }, { status: 403 })
    }
    const clave = nuevaClave()
    await dbEmpresa(emp.empresa_id, emp.country).query(`INSERT INTO me_claves (token_hash) VALUES ($1)`, [hashClave(clave)])
    return NextResponse.json({ clave })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Falta el código' }, { status: 400 })
    return apiError(err)
  }
}
