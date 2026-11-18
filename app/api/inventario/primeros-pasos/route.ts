import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { SQL_EN_ML_ACTIVA } from '@/lib/pesosML'

// Guía «Primeros pasos con tu inventario» del Inicio (14-11, el dueño: piloto del formato de aprendizaje nuevo en vez
// de videos). Cada paso se marca solo con lo que la empresa ya hizo; nadie tiene que revisar nada. Ocultarla se guarda
// por empresa (app_settings.guia_inventario_oculta). Solo para quien arma el inventario (permiso Productos).
const CLAVE = 'guia_inventario_oculta'

async function acceso() {
  const s = await getSessionDb()
  if (!s.session || !s.db) return { error: unauthorized() }
  const u = s.session.user
  if (!tieneModulo(u, 'inventario') || !puede(u, 'ver_productos')) return { error: forbidden() }
  return { db: s.db, u }
}

export async function GET() {
  const a = await acceso()
  if ('error' in a) return a.error
  try {
    const { rows: [r] } = await a.db.query(`
      SELECT EXISTS (SELECT 1 FROM ml_conexiones WHERE estado = 'activa') AS ml,
             EXISTS (SELECT 1 FROM products WHERE is_active) AS productos,
             EXISTS (SELECT 1 FROM inventory i JOIN products p ON p.id = i.product_id WHERE p.is_active AND i.quantity > 0) AS stock,
             EXISTS (SELECT 1 FROM sales) AS venta,
             EXISTS (SELECT 1 FROM sales WHERE status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')) AS procesada,
             EXISTS (SELECT 1 FROM purchase_orders) OR EXISTS (SELECT 1 FROM import_orders) AS compra,
             COALESCE((SELECT value FROM app_settings WHERE key = '${CLAVE}'), '') = '1' AS oculta,
             -- 18-11: solo los que están en una publicación ACTIVA de ML (huérfanos y productos que no se venden en ML
             -- no cuentan; sin nada en ML el paso queda hecho). Si se reactiva una sin peso, vuelve a contar.
             (SELECT COUNT(*)::int FROM products p WHERE p.is_active AND (p.weight_kg IS NULL OR p.weight_kg <= 0)
                AND ${SQL_EN_ML_ACTIVA('p')}) AS sin_peso`)
    // 14-11: paso «Pon el peso» en toda empresa de Venezuela (tabla de MercadoEnvíos); la guía ya exige Inventario.
    const conPeso = a.u.country === 'VE'
    return NextResponse.json({ ...r, conML: tieneModulo(a.u, 'preguntas'), conPeso })
  } catch (err) { return apiError(err) }
}

const Body = z.object({ ocultar: z.boolean() })

export async function POST(req: NextRequest) {
  const a = await acceso()
  if ('error' in a) return a.error
  try {
    const p = Body.safeParse(await req.json().catch(() => null))
    if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    await a.db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [CLAVE, p.data.ocultar ? '1' : ''])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
