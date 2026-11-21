import type { Country } from '@/lib/types'
import { avisoCuenta } from './AvisoCuenta'
import { avisoRadarPro } from './AvisoRadarPro'
import { avisosConexionML } from './AvisoConexionML'
import { avisoInventario } from './AvisoInventario'
import AvisosLista, { type ItemAviso } from './AvisosLista'

// «Avisos de tu cuenta» (20-11): junta los avisos de arriba de todas las pantallas en un solo recuadro (AvisosLista).
// Orden de importancia: cortada/vencida y ML desconectada (rojo) → créditos agotados (rojo) → conectar ML para que
// arranque la prueba → por vencer / pago en revisión → créditos bajos → prueba que empezó / días que quedan → ofertas
// (Inventario y Radar PRO: rotan entre ellas, ver AvisosLista).
// Si uno falla, los demás salen igual.
export default async function AvisosArriba({ organizacionId, esAdmin, empresaId, country, puedeReconectar }: {
  organizacionId: number; esAdmin: boolean; empresaId: number; country: Country; puedeReconectar: boolean
}) {
  const [cuenta, radar, ml, inventario] = await Promise.all([
    avisoCuenta(organizacionId, esAdmin).catch(() => null),
    avisoRadarPro(organizacionId).catch(() => null),
    avisosConexionML({ empresaId, country, puedeReconectar, esAdmin }).catch(() => [] as ItemAviso[]),
    avisoInventario(organizacionId, esAdmin).catch(() => null),
  ])
  const items = [cuenta, radar, ...ml, inventario].filter((x): x is ItemAviso => !!x)
  if (!items.length) return null
  return <AvisosLista items={items} />
}
