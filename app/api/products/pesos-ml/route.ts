import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { pasarPesos } from '@/lib/pesosML'
import { estadoTraida, ocupada } from '@/lib/meTraida'

// POST /api/products/pesos-ml (14-11-2026, el dueño) → Productos → MercadoEnvíos → «Traer pesos de ML»:
//   1. llena de una vez los productos SIN peso con el «Peso del paquete» de sus publicaciones (borrador, lib/pesosML.ts);
//   2. si la empresa tiene Pagos ME, además pide al programa de la PC una traída con los pesos REALES del portal de
//      MercadoEnvíos (llegan en 1-3 min y pisan el borrador), igual que «Traer pesos» de Promociones.
export async function POST() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!puede(session.user, 'ver_productos')) return forbidden()
  try {
    const { portal: delPortal, publicacion: llenados } = await pasarPesos(db)
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
      `SELECT COUNT(*) FILTER (WHERE weight_kg IS NULL OR weight_kg <= 0)::int AS sin_peso,
              COUNT(*) FILTER (WHERE peso_origen = 'publicacion')::int AS por_revisar
       FROM products WHERE is_active`)
    return NextResponse.json({ ok: true, llenados, del_portal: delPortal, portal, sin_peso: r?.sin_peso ?? 0, por_revisar: r?.por_revisar ?? 0 })
  } catch (err) {
    return apiError(err)
  }
}
