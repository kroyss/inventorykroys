import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { restaurarDemo, SECCIONES_DEMO } from '@/lib/demoDatos'
import { esDuenoPlataforma } from '@/lib/empresa'
import { MODULOS } from '@/lib/modulos'
import { forbidden, unauthorized } from '@/lib/session'
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_RE } from '@/lib/usuarios'
import { choqueAlta, crearCuenta } from '@/lib/altaCuenta'
import { currentDate } from '@/lib/tz'

// Plataforma: alta y listado de empresas clientes. Solo el dueño de la plataforma.
async function soloDueno() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.empresaId) return { error: unauthorized() }
  if (!esDuenoPlataforma(session.user)) return { error: forbidden() }
  return { session }
}

const SQL_USO_INVENTARIO = `
  SELECT (SELECT MAX(created_at) FROM sales) AS ultima, COUNT(*)::int AS sin_registrar,
         -- En VE muchas compras nunca se pagan: con Pagos ME lo que importa son las que SÍ trajeron pago.
         COUNT(*) FILTER (WHERE con_pago)::int AS sin_registrar_con_pago
  FROM (SELECT DISTINCT ON (COALESCE(o.pack_id, o.id))
               EXISTS (SELECT 1 FROM me_pagos p WHERE (p.venta = o.id::text OR p.venta = o.pack_id::text)
                         AND p.verificacion <> 'invalido') AS con_pago
        FROM ml_ordenes o
        WHERE o.fecha > NOW() - interval '7 days'
          AND COALESCE(o.estado, '') <> 'cancelled' AND o.no_concretada_at IS NULL AND o.fuera_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = o.id::text)
          AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = o.pack_id::text)
        ORDER BY COALESCE(o.pack_id, o.id), con_pago DESC) v`

/** GET /api/plataforma/empresas — todas las empresas con su organización y cuántos usuarios. */
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const { rows } = await dbGlobal().query(
      `SELECT e.id, e.nombre, e.country, e.modulos, e.is_active, e.created_at, e.ia_limite_mes,
              o.id AS organizacion_id, o.nombre AS organizacion,
              o.estado, to_char(o.prueba_hasta, 'YYYY-MM-DD') AS prueba_hasta, o.prueba_dias, o.fundador,
              o.origen, o.registro - 'ip_hash' - 'navegador' AS registro,
              o.motivo_pausa, to_char(o.pausa_fecha, 'YYYY-MM-DD') AS pausa_fecha,
              to_char(o.created_at AT TIME ZONE 'America/Caracas', 'YYYY-MM-DD') AS creada, u.cuentas,
              (SELECT COUNT(*)::int FROM usuario_empresas ue WHERE ue.empresa_id = e.id) AS usuarios,
              (SELECT string_agg(u.username, ', ' ORDER BY u.username)
                 FROM usuario_empresas ue JOIN users u ON u.id = ue.user_id
                 WHERE ue.empresa_id = e.id AND ue.role = 'admin') AS admins
       FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id
       LEFT JOIN plataforma_uso_clientes() u ON u.empresa_id = e.id
       ORDER BY o.nombre, e.id`)
    // Uso del inventario (25-10): ¿lo usa o lo abandonó? Última venta registrada y ventas de ML de 7 días sin registrar.
    // De a una empresa (son pocas con inventario) para no ocupar varias conexiones a la vez.
    for (const e of rows) {
      if (!e.is_active || !(e.modulos as string[]).includes('inventario')) continue
      e.inventario = await conEmpresa(e.id, e.country, db => db.query(SQL_USO_INVENTARIO).then(r => r.rows[0])).catch(() => null)
    }
    return NextResponse.json({ empresas: rows, modulos: MODULOS, hoy: currentDate() })
  } catch (err) {
    return apiError(err)
  }
}

const modulosValidos = Object.keys(MODULOS) as [string, ...string[]]
const CreateSchema = z.object({
  nombre:   z.string().trim().min(2, 'Falta el nombre de la empresa').max(80),
  country:  z.enum(['VE', 'CO']),
  modulos:  z.array(z.enum(modulosValidos)).max(20),
  alta:     z.enum(['fundador', 'prueba', 'activo', 'demo']).default('fundador'),   // lib/cuenta.ts · demo: lib/demo.ts
  admin: z.object({
    username:  z.string().trim().toLowerCase().regex(USERNAME_RE, 'Usuario: 3 a 30 caracteres, solo letras, números, punto, guion o guion bajo'),
    full_name: z.string().trim().min(2, 'Falta el nombre del administrador').max(100),
    password:  z.string().min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`).max(PASSWORD_MAX),
  }),
})

/**
 * POST /api/plataforma/empresas — crea una organización con su empresa y su primer
 * admin, y siembra lo mínimo para operar (categorías de ganancia y parámetros ML).
 * Todo en una transacción de UNA conexión: o queda completa o no queda nada.
 */
export async function POST(req: NextRequest) {
  const { session, error } = await soloDueno()
  if (error) return error
  const client = await dbGlobal().connect()
  try {
    const body = CreateSchema.parse(await req.json())
    await client.query('BEGIN')

    const choque = await choqueAlta(client, body.nombre, body.admin.username)
    if (choque) { await client.query('ROLLBACK'); return NextResponse.json({ error: choque }, { status: 400 }) }
    const demo = body.alta === 'demo'
    if (demo && body.country !== 'VE') { await client.query('ROLLBACK'); return NextResponse.json({ error: 'La demo es de Venezuela (Despachos y Reportador son solo VE)' }, { status: 400 }) }
    // Organización, empresa, admin y siembra: lib/altaCuenta.ts (lo mismo que usa /registro).
    const { empresaId, categorias, ajustes } = await crearCuenta(client, {
      nombre: body.nombre, country: body.country, modulos: body.modulos, alta: body.alta, admin: body.admin,
      origenOrgId: session!.user.organizacionId,
    })
    const emp = { id: empresaId }

    await client.query('COMMIT')
    // Demo: se siembra todo (cuentas de ML ficticias, ventas, preguntas, mensajes…) con su propia conexión.
    if (demo) await conEmpresa(emp.id, body.country, db => restaurarDemo(db, SECCIONES_DEMO.map(x => x.id)))
    return NextResponse.json({ id: emp.id, categorias, ajustes }, { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  } finally {
    // RESET: la conexión vuelve al pool sin empresa fijada (SET LOCAL ya murió con la
    // transacción; esto es la red de seguridad).
    await client.query('RESET ALL').catch(() => {})
    client.release()
  }
}
