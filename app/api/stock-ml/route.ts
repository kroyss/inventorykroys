import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { ErrorML, CuentaDesconectada } from '@/lib/ml'
import { registrarUso } from '@/lib/usoAcciones'
import { aplicarCambio, conexionDeItem, gemelasDe, huecoDePublicacion, leerPublicacion, type PubStock } from '@/lib/stockML'

// Cambiar stock y reactivar en MercadoLibre (2026-10-21, lib/stockML.ts). Permiso "Cambiar el stock en
// MercadoLibre" (reponer_stock). La ventana: components/preguntas/CambiarStock.tsx.
//   GET  ?item=MLV…&variante=ID → la publicación como está ahora en ML + gemelas (misma mercancía en la otra
//        cuenta, vinculadas al mismo producto) + el stock del inventario (solo empresas con inventario)
//   POST { cambios: [{ item_id, variante_id, cantidad }], reactivar, origen } → aplica cada uno, lo comprueba y
//        devuelve cómo quedó

export async function GET(req: NextRequest) {
  const s = await sesionPreguntas('reponer_stock')
  if ('error' in s) return s.error
  const item = req.nextUrl.searchParams.get('item') ?? ''
  const variante = req.nextUrl.searchParams.get('variante')
  if (!/^[A-Z]{3}\d+$/.test(item) || (variante && !/^\d+$/.test(variante))) {
    return NextResponse.json({ error: 'Publicación inválida' }, { status: 400 })
  }
  try {
    const conexionId = await conexionDeItem(s.db, item)
    if (!conexionId) return NextResponse.json({ error: 'Publicación no encontrada en tus cuentas' }, { status: 404 })
    const [pub, { producto, gemelas }, hueco] = await Promise.all([
      leerPublicacion(s.db, conexionId, item),
      gemelasDe(s.db, item, variante),
      huecoDePublicacion(s.db, conexionId, item),
    ])
    const principal = { ...pub, hueco }
    // Las gemelas, leídas de ML (de a una; suelen ser 1 o 2).
    const otras: (PubStock & { variante_foco: string | null; hueco: Awaited<ReturnType<typeof huecoDePublicacion>> })[] = []
    for (const g of gemelas) {
      const c = await conexionDeItem(s.db, g.item_id)
      if (!c || otras.some(o => o.item_id === g.item_id)) continue
      try {
        const [p, hueco] = await Promise.all([leerPublicacion(s.db, c, g.item_id), huecoDePublicacion(s.db, c, g.item_id)])
        otras.push({ ...p, variante_foco: g.variante_id, hueco })
      } catch { /* sin acceso: se omite */ }
    }
    return NextResponse.json({ principal, variante_foco: variante, gemelas: otras, producto })
  } catch (err) {
    if (err instanceof CuentaDesconectada) return NextResponse.json({ error: 'La cuenta de MercadoLibre está desconectada' }, { status: 409 })
    if (err instanceof ErrorML) return NextResponse.json({ error: `MercadoLibre: ${err.message}` }, { status: 502 })
    return apiError(err)
  }
}

const Body = z.object({
  cambios: z.array(z.object({
    item_id: z.string().regex(/^[A-Z]{3}\d+$/),
    variante_id: z.string().regex(/^\d+$/).nullable(),
    cantidad: z.number().int().min(0).max(99999).nullable(),
  })).min(1).max(40),
  reactivar: z.boolean().default(false),
  origen: z.enum(['preguntas', 'mensajes', 'ficha', 'stock', 'pausadas']),
})

export async function POST(req: NextRequest) {
  const s = await sesionPreguntas('reponer_stock')
  if ('error' in s) return s.error
  const r = Body.safeParse(await req.json().catch(() => null))
  if (!r.success) return NextResponse.json({ error: 'Datos inválidos (cantidad de 0 a 99.999)' }, { status: 400 })
  try {
    const resultados = []
    for (const c of r.data.cambios) {
      resultados.push(await aplicarCambio(s.db, c, { reactivar: r.data.reactivar, origen: r.data.origen, usuarioId: Number(s.session.user.id) }))
    }
    const hechos = resultados.filter(x => x.ok).length
    if (hechos) await registrarUso(s.db, 'stock', hechos)
    return NextResponse.json({ resultados })
  } catch (err) {
    return apiError(err)
  }
}
