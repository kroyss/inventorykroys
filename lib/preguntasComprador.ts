// Preguntas que un comprador ya hizo antes (ml_preguntas.comprador_id), para ver su "hilo" desde
// Preguntas y desde Mensajes. Sale de lo ya sincronizado: no le pide nada nuevo a MercadoLibre.
import type { Pool } from 'pg'

export interface PreguntaPrevia {
  id: string; item_titulo: string | null; item_permalink: string | null
  texto: string; respuesta: string | null; fecha: string; cuenta: string
}

export async function preguntasDeComprador(db: Pool, compradorId: string | number, excluir: string | null = null, limite = 20) {
  const { rows } = await db.query<PreguntaPrevia>(
    `SELECT p.id::text, p.item_titulo, p.item_permalink, p.texto, p.respuesta, p.fecha, c.nickname AS cuenta
     FROM ml_preguntas p JOIN ml_conexiones c ON c.id = p.conexion_id
     WHERE p.comprador_id = $1::bigint AND ($2::text IS NULL OR p.id::text <> $2)
     ORDER BY p.fecha DESC LIMIT $3`,
    [String(compradorId), excluir, limite])
  return rows
}
