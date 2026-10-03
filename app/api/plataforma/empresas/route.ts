import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { esDuenoPlataforma } from '@/lib/empresa'
import { MODULOS } from '@/lib/modulos'
import { forbidden, unauthorized } from '@/lib/session'
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_RE } from '@/lib/usuarios'
import { DIAS_PRUEBA } from '@/lib/cuenta'
import { currentDate } from '@/lib/tz'

// Plataforma: alta y listado de empresas clientes. Solo el dueño de la plataforma.
async function soloDueno() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.empresaId) return { error: unauthorized() }
  if (!esDuenoPlataforma(session.user)) return { error: forbidden() }
  return { session }
}

/** GET /api/plataforma/empresas — todas las empresas con su organización y cuántos usuarios. */
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const { rows } = await dbGlobal().query(
      `SELECT e.id, e.nombre, e.country, e.modulos, e.is_active, e.created_at, e.ia_limite_mes,
              o.id AS organizacion_id, o.nombre AS organizacion,
              o.estado, to_char(o.prueba_hasta, 'YYYY-MM-DD') AS prueba_hasta, o.fundador,
              (SELECT COUNT(*)::int FROM usuario_empresas ue WHERE ue.empresa_id = e.id) AS usuarios,
              (SELECT string_agg(u.username, ', ' ORDER BY u.username)
                 FROM usuario_empresas ue JOIN users u ON u.id = ue.user_id
                 WHERE ue.empresa_id = e.id AND ue.role = 'admin') AS admins
       FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id
       ORDER BY o.nombre, e.id`)
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
  alta:     z.enum(['fundador', 'prueba', 'activo']).default('fundador'),   // lib/cuenta.ts
  admin: z.object({
    username:  z.string().trim().toLowerCase().regex(USERNAME_RE, 'Usuario: 3 a 30 caracteres, solo letras, números, punto, guion o guion bajo'),
    full_name: z.string().trim().min(2, 'Falta el nombre del administrador').max(100),
    password:  z.string().min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`).max(PASSWORD_MAX),
  }),
})

// Parámetros de MercadoLibre que se copian de la empresa de la plataforma del mismo país
// (son datos del mercado, no del negocio). Lo propio de cada negocio (cuentas ML,
// remitente, bonos, facturación, exceso) arranca vacío y lo configura el cliente.
const AJUSTES_DE_MERCADO = ['ml_comision', 'ml_envio', 'ml_umbral', 'ml_shipping_table', 'tealca_guia_digitos',
                            'ml_umbral_envio', 'ml_envio_bajo', 'ml_envio_alto', 'ml_reten']

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

    const { rows: [dupE] } = await client.query(`SELECT 1 FROM empresas WHERE lower(nombre) = lower($1)`, [body.nombre])
    if (dupE) { await client.query('ROLLBACK'); return NextResponse.json({ error: `Ya existe una empresa "${body.nombre}"` }, { status: 400 }) }
    const { rows: [dupU] } = await client.query(`SELECT 1 FROM users WHERE username = $1`, [body.admin.username])
    if (dupU) { await client.query('ROLLBACK'); return NextResponse.json({ error: `El usuario "${body.admin.username}" ya existe. Elige otro.` }, { status: 400 }) }

    // Cuenta: Fundador = 30 días gratis + marca permanente; Prueba = 15 días; Activo = ya paga.
    const dias = body.alta === 'fundador' ? DIAS_PRUEBA.fundador : body.alta === 'prueba' ? DIAS_PRUEBA.normal : null
    const { rows: [org] } = await client.query(
      `INSERT INTO organizaciones (nombre, estado, prueba_hasta, fundador)
       VALUES ($1, $2, CASE WHEN $3::int IS NULL THEN NULL ELSE (NOW() AT TIME ZONE 'America/Caracas')::date + $3::int END, $4)
       RETURNING id`,
      [body.nombre, dias ? 'prueba' : 'activo', dias, body.alta === 'fundador'])
    const { rows: [emp] } = await client.query(
      `INSERT INTO empresas (organizacion_id, nombre, country, modulos) VALUES ($1, $2, $3, $4) RETURNING id`,
      [org.id, body.nombre, body.country, body.modulos])
    const { rows: [user] } = await client.query(
      `INSERT INTO users (username, password_hash, full_name, role, country_access, is_active)
       VALUES ($1, $2, $3, 'admin', $4, TRUE) RETURNING id`,
      [body.admin.username, await hash(body.admin.password, 10), body.admin.full_name, body.country])
    await client.query(
      `INSERT INTO usuario_empresas (user_id, empresa_id, role) VALUES ($1, $2, 'admin')`, [user.id, emp.id])

    // Siembra: se lee de la empresa de la plataforma del mismo país y se escribe en la
    // nueva, cambiando la empresa de la conexión DENTRO de la transacción (SET LOCAL).
    const { rows: [origen] } = await client.query(
      `SELECT id FROM empresas WHERE organizacion_id = $1 AND country = $2 ORDER BY id LIMIT 1`,
      [session!.user.organizacionId, body.country])
    let categorias: { name: string; profit_percentage: string; display_order: number; color: string | null; description: string | null }[] = []
    let ajustes: { key: string; value: string }[] = []
    if (origen) {
      await client.query(`SELECT set_config('app.empresa_id', $1, true)`, [String(origen.id)])
      categorias = (await client.query(
        `SELECT name, profit_percentage, display_order, color, description FROM profit_categories WHERE is_active`)).rows
      ajustes = (await client.query(
        `SELECT key, value FROM app_settings WHERE key = ANY($1)`, [AJUSTES_DE_MERCADO])).rows
    }
    await client.query(`SELECT set_config('app.empresa_id', $1, true)`, [String(emp.id)])
    // Categorías: las mismas escalas de ganancia, nombradas con su % ("120%"). La de 0% no se copia:
    // "sin categoría" ya es no tener categoría (migración 050).
    for (const c of categorias) {
      const pct = Number(c.profit_percentage)
      if (!(pct > 0)) continue
      await client.query(
        `INSERT INTO profit_categories (name, profit_percentage, display_order, color, description, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        [pct > 0 ? `${pct}%` : c.name, c.profit_percentage, c.display_order, c.color, pct > 0 ? null : c.description])
    }
    // VE: exceso inicial = diferencial oficial/paralelo del día, redondeado hacia arriba de a 5
    // (protección cambiaria). Se ajusta con el cliente en la configuración (Ajustes → Exceso ML).
    if (body.country === 'VE') {
      const { rows: [t] } = await client.query(
        `SELECT official_rate::float AS o, parallel_rate::float AS p FROM venezuela_exchange_rates
         ORDER BY rate_date DESC, id DESC LIMIT 1`)
      if (t?.o > 0 && t.p > t.o) {
        ajustes = [...ajustes.filter(a => a.key !== 'ml_exceso'),
                   { key: 'ml_exceso', value: String(Math.ceil(((t.p - t.o) / t.o * 100) / 5) * 5) }]
      }
    }
    for (const a of ajustes) {
      await client.query(`INSERT INTO app_settings (key, value) VALUES ($1, $2)`, [a.key, a.value])
    }

    await client.query('COMMIT')
    return NextResponse.json({ id: emp.id, categorias: categorias.length, ajustes: ajustes.length }, { status: 201 })
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
