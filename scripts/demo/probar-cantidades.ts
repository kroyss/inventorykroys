// Prueba: restaurar Preguntas y Mensajes con cantidades elegidas (en una transacción que se deshace).
import { Client } from 'pg'
import type { Pool } from 'pg'
import { restaurarDemo } from '@/lib/demoDatos'

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  const db = { query: (sql: string, p?: unknown[]) => /^(BEGIN|COMMIT)$/i.test(sql.trim()) ? Promise.resolve({ rows: [], rowCount: 0 }) : c.query(sql, p) } as unknown as Pool
  await c.query('BEGIN')
  try {
    const { rows: [e] } = await c.query(`SELECT id FROM empresas WHERE nombre = 'DEMO' LIMIT 1`)
    await c.query(`SELECT set_config('app.empresa_id', $1, true), set_config('TimeZone', 'America/Caracas', true)`, [String(e.id)])
    for (const [p, m] of [[3, 2], [15, 10], [1, 1]]) {
      await restaurarDemo(db, ['preguntas', 'mensajes'], { preguntas: p, mensajes: m })
      const { rows: [n] } = await c.query(`SELECT (SELECT COUNT(*) FROM ml_preguntas WHERE estado = 'UNANSWERED')::int AS p, (SELECT COUNT(*) FROM ml_conversaciones WHERE sin_leer > 0)::int AS m`)
      console.log(`pedido ${p}/${m} → quedan ${n.p} preguntas, ${n.m} conversaciones sin leer`, n.p === p && n.m === m ? '✓' : 'FALLÓ')
    }
  } finally { await c.query('ROLLBACK'); await c.end(); console.log('ROLLBACK') }
}
main().catch(e => { console.error(e); process.exit(1) })
