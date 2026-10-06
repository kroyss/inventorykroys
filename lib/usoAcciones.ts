// Uso de cada cliente (migración 073): lo que hace desde el sistema y no queda en otra tabla
// (calificar ventas, cambiar stock en MercadoLibre). Lo lee el dueño en Plataforma → Aprendizaje
// (plataforma_uso_clientes). Nunca hace fallar la acción del cliente.
import type { Pool } from 'pg'

export async function registrarUso(db: Pick<Pool, 'query'>, tipo: 'calificacion' | 'stock', cantidad: number) {
  if (cantidad <= 0) return
  await db.query(`INSERT INTO uso_acciones (tipo, cantidad) VALUES ($1, $2)`, [tipo, cantidad])
    .catch(e => console.error('[uso_acciones]', e))
}
