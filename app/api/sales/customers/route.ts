import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'

// Nombres de clientes ya usados (autocompletado de campo libre en Ventas).
// Accesible a cualquier rol — el campo cliente lo usan admin y usuario normal.
export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows } = await db.query(`
    SELECT customer_name AS name
    FROM sales
    WHERE customer_name IS NOT NULL AND TRIM(customer_name) <> ''
    GROUP BY customer_name
    ORDER BY MAX(created_at) DESC
    LIMIT 500
  `)
  return NextResponse.json(rows.map((r, i) => ({ id: i + 1, name: r.name })))
}
