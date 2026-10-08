// Recalcula el puntaje de todas las postulaciones de la convocatoria con las reglas vigentes de
// lib/fundadores.ts (evaluar): mismas reglas para la Ronda 1 y la 2 (puntos neutrales en las preguntas
// que la Ronda 1 no vio). Solo cambia `puntaje`; el estado (aprobado, espera, etc.) no se toca.
//   DATABASE_URL=… npx tsx scripts/fundadores-recalcular.ts [--aplicar]
import { Client } from 'pg'
import { evaluar, RONDA_ACTUAL, type Respuestas } from '@/lib/fundadores'

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  const { rows } = await c.query(
    `SELECT id, nombre, puntaje, estado, nick_ml, tipo, ventas_mes, cuentas, despacho, dolor, activacion, inventario, herramientas, compromiso
     FROM fundadores_solicitudes WHERE ronda = $1 ORDER BY id`, [RONDA_ACTUAL])
  let cambios = 0
  for (const r of rows) {
    let nuevo: number
    try { nuevo = evaluar(r as unknown as Respuestas, r.nick_ml).puntaje } catch (e) { console.log(`  ${r.id} ${r.nombre}: no se pudo (${(e as Error).message})`); continue }
    if (nuevo === r.puntaje) continue
    cambios++
    console.log(`  ${r.id} ${r.nombre} (${r.estado}${r.tipo ? '' : ', ronda 1'}): ${r.puntaje} → ${nuevo}`)
    if (aplicar) await c.query(`UPDATE fundadores_solicitudes SET puntaje = $2 WHERE id = $1`, [r.id, nuevo])
  }
  console.log(`${rows.length} postulaciones, ${cambios} con puntaje distinto${aplicar ? ' (aplicado)' : ' (simulado: --aplicar para guardar)'}`)
  await c.end()
}
main().catch(e => { console.error(e); process.exit(1) })
