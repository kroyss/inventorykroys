import { NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'
import { apiError } from '@/lib/apiError'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { contarSinVincular } from '@/lib/importarML'

// GET /api/publicaciones/pendientes (18-11): lo que falta en Vincular y Pesos (botones de Mis publicaciones, antes Preparar), para el numerito gris de la
// pestaña. Publicaciones activas con stock sin vincular (lo mismo que avisa Stock vs inventario) y productos activos sin
// peso (Venezuela con Inventario). Solo lectura; cada número solo si el usuario ve esa pantalla.
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const u = session.user
  try {
    const veVincular = puede(u, 'vincular_ml') || (puede(u, 'ver_productos') && puede(u, 'importar_ml'))
    const vePesos = u.country === 'VE' && tieneModulo(u, 'inventario') && puede(u, 'ver_productos')
    const [sinVincular, sinPeso] = await Promise.all([
      veVincular && tieneModulo(u, 'preguntas') ? contarSinVincular(db) : Promise.resolve(0),
      vePesos ? db.query(`SELECT COUNT(*)::int AS n FROM products WHERE is_active AND (weight_kg IS NULL OR weight_kg <= 0)`).then(r => r.rows[0]?.n ?? 0) : Promise.resolve(0),
    ])
    return NextResponse.json({ sinVincular, sinPeso }, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (err) { return apiError(err) }
}
