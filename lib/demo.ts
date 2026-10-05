// Modo DEMOSTRACIÓN de una empresa (app_settings `modo_demo` = '1', lo pone scripts/demo-sembrar.sql).
// Sirve para grabar los videos de Aprendizaje con ventas ficticias: lo que normalmente se le
// manda a MercadoLibre (reportar la guía al comprador, calificar) se registra como hecho en el
// sistema SIN llamar a MercadoLibre. scripts/demo-limpiar.sql lo apaga y borra lo sembrado.
import type { Pool } from 'pg'

export async function esDemo(db: Pick<Pool, 'query'>) {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = 'modo_demo'`)
  return r?.value === '1'
}
