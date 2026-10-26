// Alta de una cuenta nueva: organización + empresa + primer admin + siembra mínima (categorías de ganancia y
// parámetros de ML). La usan Plataforma (el dueño crea la cuenta) y /registro (autoregistro, prueba de 15 días;
// 26-10, migración 125). Corre DENTRO de la transacción del que llama (una sola conexión): o queda completa o nada.
import type { PoolClient } from 'pg'
import { hash } from 'bcryptjs'
import { DIAS_ESPERA_CONEXION, DIAS_PRUEBA } from '@/lib/cuenta'

export type Alta = 'fundador' | 'prueba' | 'activo' | 'demo'

export interface DatosAlta {
  nombre: string
  country: 'VE' | 'CO'
  modulos: string[]
  alta: Alta
  admin: { username: string; full_name: string; password: string; email?: string | null }
  /** Organización de la que se copian categorías y parámetros de ML (la de la plataforma). */
  origenOrgId: number
  /** 'autoregistro' para /registro; NULL = la creó el dueño. */
  origen?: string | null
  registro?: Record<string, unknown> | null
}

// Parámetros de MercadoLibre que se copian de la empresa de la plataforma del mismo país
// (son datos del mercado, no del negocio). Lo propio de cada negocio (cuentas ML,
// remitente, bonos, facturación, exceso) arranca vacío y lo configura el cliente.
const AJUSTES_DE_MERCADO = ['ml_comision', 'ml_envio', 'ml_umbral', 'ml_shipping_table', 'ml_shipping_table_zoom', 'tealca_guia_digitos',
                            'ml_umbral_envio', 'ml_envio_bajo', 'ml_envio_alto', 'ml_reten']

/** Lo que ya existe y choca (nombre de empresa o usuario). null = se puede crear. */
export async function choqueAlta(client: PoolClient, nombre: string, username: string): Promise<string | null> {
  const { rows: [dupE] } = await client.query(`SELECT 1 FROM empresas WHERE lower(nombre) = lower($1)`, [nombre])
  if (dupE) return `Ya existe una empresa "${nombre}"`
  const { rows: [dupU] } = await client.query(`SELECT 1 FROM users WHERE username = $1`, [username])
  if (dupU) return `El usuario "${username}" ya existe. Elige otro.`
  return null
}

export async function crearCuenta(client: PoolClient, d: DatosAlta) {
  // Cuenta: Fundador = 30 días gratis + marca permanente; Prueba = 15 días; Activo = ya paga.
  // Los días arrancan al conectar la primera cuenta de ML (api/ml/callback, migración 067); hasta
  // entonces prueba_hasta es el TOPE: hoy + DIAS_ESPERA_CONEXION + días de prueba.
  const dias = d.alta === 'fundador' ? DIAS_PRUEBA.fundador : d.alta === 'prueba' ? DIAS_PRUEBA.normal : null
  const { rows: [org] } = await client.query(
    `INSERT INTO organizaciones (nombre, estado, prueba_hasta, prueba_dias, fundador, origen, registro)
     VALUES ($1, $2, CASE WHEN $3::int IS NULL THEN NULL ELSE (NOW() AT TIME ZONE 'America/Caracas')::date + $5::int + $3::int END, $3, $4, $6, $7)
     RETURNING id`,
    [d.nombre, dias ? 'prueba' : 'activo', dias, d.alta === 'fundador', DIAS_ESPERA_CONEXION, d.origen ?? null, d.registro ?? null])
  // Demo: los módulos de Automatizaciones de un Fundador y sus mismos 100 créditos de IA (en los videos
  // se ve "Créditos IA: N de 100", como lo ve un cliente; si hace falta se sube en la base).
  const demo = d.alta === 'demo'
  const { rows: [emp] } = await client.query(
    `INSERT INTO empresas (organizacion_id, nombre, country, modulos, ia_limite_mes) VALUES ($1, $2, $3, $4, 100) RETURNING id`,
    [org.id, d.nombre, d.country, demo ? ['despachos', 'reportador', 'preguntas', 'alertas_stock'] : d.modulos])
  const { rows: [user] } = await client.query(
    `INSERT INTO users (username, password_hash, full_name, role, country_access, is_active, email)
     VALUES ($1, $2, $3, 'admin', $4, TRUE, $5) RETURNING id`,
    [d.admin.username, await hash(d.admin.password, 10), d.admin.full_name, d.country, d.admin.email ?? null])
  await client.query(
    `INSERT INTO usuario_empresas (user_id, empresa_id, role) VALUES ($1, $2, 'admin')`, [user.id, emp.id])

  // Siembra: se lee de la empresa de la plataforma del mismo país y se escribe en la
  // nueva, cambiando la empresa de la conexión DENTRO de la transacción (SET LOCAL).
  const { rows: [origen] } = await client.query(
    `SELECT id FROM empresas WHERE organizacion_id = $1 AND country = $2 ORDER BY id LIMIT 1`,
    [d.origenOrgId, d.country])
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
  if (d.country === 'VE') {
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
  return { organizacionId: org.id as number, empresaId: emp.id as number, userId: user.id as number,
           categorias: categorias.length, ajustes: ajustes.length }
}
