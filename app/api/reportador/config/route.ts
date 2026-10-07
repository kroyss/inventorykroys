import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { autenticarEquipo, conTransportista, cuentaPorVenta, leerConfig, LIMITE_CARACTERES, paginaML, problemasConfig } from '@/lib/reportador'

/** GET /api/reportador/config — cuentas y plantillas (se editan en Despachos, no en el equipo) */
export async function GET(req: NextRequest) {
  try {
    const auth = await autenticarEquipo(req)
    if ('error' in auth) return auth.error
    const config = await leerConfig(auth.db)
    // Sin cuentas configuradas: una por cada cuenta de ML conectada (tomar filtra por la venta).
    const cuentas = cuentaPorVenta(config)
      ? (await auth.db.query(`SELECT nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY nickname`))
          .rows.map(r => ({ nombre: r.nickname as string, filtro: '', pagina: paginaML(r.nickname) }))
      : config.cuentas
    return NextResponse.json({
      equipo: auth.equipo.nombre,
      limite: LIMITE_CARACTERES,
      cuentas,
      // El programa solo conoce {guia}, {pagina} y ZOOM→TEALCA: {transportista} ya va resuelto.
      plantillas: config.plantillas.map(conTransportista),
      bloque: conTransportista(config.bloque),
      problemas: problemasConfig(config),
    })
  } catch (err) {
    return apiError(err)
  }
}
