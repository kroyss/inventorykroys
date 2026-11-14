import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { sincronizarPesos } from '@/lib/pesosML'
import { estadoTraida, ocupada } from '@/lib/meTraida'

// POST /api/products/pesos-ml (14-11-2026, el dueño) → Productos → MercadoEnvíos → «Traer pesos de ML». El peso es SOLO
// el del portal de MercadoEnvíos: pasa ya a los productos los que el portal tiene y pide al programa de Pagos ME una
// traída con pesos (llegan en 1-3 min), igual que «Traer pesos» de Promociones.
export async function POST() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!puede(session.user, 'ver_productos')) return forbidden()
  try {
    const delPortal = await sincronizarPesos(db)
    let portal: 'pedido' | 'en_curso' | 'sin_pagos_me' = 'sin_pagos_me'
    if (session.user.country === 'VE' && tieneModulo(session.user, 'pagos_me')) {
      const e = await estadoTraida(db)
      if (ocupada(e)) portal = 'en_curso'
      else {
        await db.query(`INSERT INTO me_pedidos (pedido_por, pesos) VALUES ($1, TRUE)`, [Number(session.user.id)])
        portal = 'pedido'
      }
    }
    const { rows: [r] } = await db.query(
      `SELECT COUNT(*) FILTER (WHERE weight_kg IS NULL OR weight_kg <= 0)::int AS sin_peso
       FROM products WHERE is_active`)
    return NextResponse.json({ ok: true, del_portal: delPortal, portal, sin_peso: r?.sin_peso ?? 0 })
  } catch (err) {
    return apiError(err)
  }
}
