// Helper para los simuladores: pone/restaura la contraseña temporal de wilmer.
//   node scripts/_sim-wilmer.mjs set      → guarda el hash actual en scripts/.wh y pone 'test1234'
//   node scripts/_sim-wilmer.mjs restore  → restaura el hash desde scripts/.wh
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'
import bcrypt from 'bcryptjs'

// Carga DATABASE_URL_VE desde .env (sin dependencias extra)
const here = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(here, '..', '.env'), 'utf8')
const DB = Object.fromEntries(env.split('\n').filter(Boolean).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
})).DATABASE_URL_VE
const WH = join(here, '.wh')
const mode = process.argv[2]

const client = new pg.Client({ connectionString: DB })
await client.connect()
try {
  if (mode === 'set') {
    const { rows } = await client.query(`SELECT password_hash FROM users WHERE username='wilmer'`)
    if (!rows.length) { console.error('❌ usuario wilmer no existe'); process.exit(1) }
    if (!existsSync(WH)) writeFileSync(WH, rows[0].password_hash)   // no sobrescribir un respaldo previo
    const hash = bcrypt.hashSync('test1234', 10)
    await client.query(`UPDATE users SET password_hash=$1 WHERE username='wilmer'`, [hash])
    console.log('✓ wilmer → contraseña temporal test1234 (hash original guardado en scripts/.wh)')
  } else if (mode === 'restore') {
    if (!existsSync(WH)) { console.error('⚠ no hay scripts/.wh; nada que restaurar'); process.exit(0) }
    const orig = readFileSync(WH, 'utf8')
    await client.query(`UPDATE users SET password_hash=$1 WHERE username='wilmer'`, [orig])
    console.log('✓ wilmer → contraseña original restaurada')
  } else {
    console.error('uso: node scripts/_sim-wilmer.mjs set|restore'); process.exit(1)
  }
} finally {
  await client.end()
}
