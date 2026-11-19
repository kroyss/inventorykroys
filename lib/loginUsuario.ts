import type { Pool, PoolClient } from 'pg'

// 19-11 (el dueño): se entra con el usuario O con el correo. Con «@» busca por correo; si hubiera dos cuentas con el
// mismo correo no adivina (devuelve null y la persona entra con su usuario). Lo usan la entrada (lib/auth.ts) y /renovar.
export async function usuarioPorLogin<T>(db: Pool | PoolClient, texto: string, columnas: string): Promise<T | null> {
  const t = texto.toLowerCase().trim()
  if (!t) return null
  const { rows } = t.includes('@')
    ? await db.query(`SELECT ${columnas} FROM users WHERE lower(email) = $1 LIMIT 2`, [t])
    : await db.query(`SELECT ${columnas} FROM users WHERE username = $1`, [t])
  return rows.length === 1 ? rows[0] as T : null
}

/** Usuario libre armado desde el correo (registro sin «Usuario para entrar»): marcos.c@… → marcos.c, marcos.c2, … */
export async function usuarioDesdeCorreo(db: Pool | PoolClient, correo: string): Promise<string> {
  let base = correo.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[._-]+|[._-]+$/g, '').slice(0, 26)
  if (base.length < 3) base = (base + 'usuario').slice(0, 7)
  const { rows } = await db.query(`SELECT username FROM users WHERE left(username, length($1)) = $1`, [base])
  const usados = new Set(rows.map(r => r.username as string))
  if (!usados.has(base)) return base
  for (let i = 2; i < 10000; i++) if (!usados.has(base + i)) return base + i
  return base + Date.now().toString().slice(-4)
}
