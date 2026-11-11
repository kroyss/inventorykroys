import { NextResponse } from 'next/server'
import { ESCALONES, PLANES, RADAR_PRO, planConRadar, precioRadarMes } from '@/lib/planes'
import { currentDate } from '@/lib/tz'

// GET /api/radar/precios (12-11, el dueño): los precios del Radar para su página pública
// radar.elcomerciantedigital.com/precios. Única fuente: lib/planes.ts (aquí se cobra; el Radar solo los muestra).
export async function GET() {
  const mes = precioRadarMes(currentDate('America/Caracas'))
  const conRadar = PLANES.filter(p => planConRadar(p.id))
  return NextResponse.json({
    radarMes: { precio: mes.precio, lista: mes.lista, promo: mes.promo?.texto ?? null, hasta: mes.promo?.hasta ?? null },
    radarPro: RADAR_PRO.precio,
    planes: conRadar.map(p => ({ nombre: p.nombre, desde: ESCALONES[0].precios[p.id] })),
  }, { headers: { 'Cache-Control': 'public, max-age=600' } })
}
