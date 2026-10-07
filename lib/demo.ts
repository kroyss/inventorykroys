// Modo DEMOSTRACIÓN de una empresa (app_settings `modo_demo` = '1').
//
// Cuenta para grabar videos y hacer demostraciones en vivo con datos que parecen reales
// (lib/demoDatos.ts los siembra y los restaura por sección desde /demo). Sus cuentas de
// MercadoLibre son FICTICIAS: tienen TOKEN_DEMO en vez de un token cifrado, y mlFetch las
// responde con lib/demoML.ts (un MercadoLibre simulado sobre la base) sin salir a internet.
// Lo que normalmente se manda a MercadoLibre (responder, reportar la guía, calificar, cambiar
// stock) queda hecho en el sistema y nadie recibe nada.
import type { Pool } from 'pg'
import { conEmpresa } from '@/lib/db'
import type { Country } from '@/lib/types'

/** Marca de las cuentas de ML de demostración (en access_token_enc y refresh_token_enc). */
export const TOKEN_DEMO = 'demo'

export async function esDemo(db: Pick<Pool, 'query'>) {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = 'modo_demo'`)
  return r?.value === '1'
}

/** Lo mismo para componentes de página (Navbar, layout): con conEmpresa, que devuelve la conexión
 *  al terminar. dbEmpresa la devuelve con after(), que en el layout no siempre corre: cada página
 *  dejaba una conexión tomada hasta agotar el pool (caída del 07-10). Si falla, no es demo. */
export async function esDemoEmpresa(empresaId: number, country: Country) {
  try { return await conEmpresa(empresaId, country, db => esDemo(db)) } catch { return false }
}
