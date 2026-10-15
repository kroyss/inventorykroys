import { withAuth, type NextRequestWithAuth } from 'next-auth/middleware'
import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'

const paginas = withAuth({ pages: { signIn: '/login' } })

// "Ver como este usuario" (2026-10-12, lib/auth.ts) es SOLO LECTURA: mientras un admin mira el sistema
// como otra persona no se guarda nada. Es para no cambiar algo sin querer a nombre de otro (el admin
// igual puede todo), no un control de seguridad: los permisos los chequea cada página y cada API.
//   - /api con POST/PUT/PATCH/DELETE → 403, salvo /api/auth (entrar, salir y el propio "volver").
//   - Los GET que escriben: Excel de ventas (marca DESCARGADA) y el CSV del bot (marca las guías)
//     → 403; abrir una conversación de Mensajes no la marca como leída.
const GET_QUE_ESCRIBEN = [/^\/api\/sales\/export-excel/, /^\/api\/despachos\/jornadas\/[^/]+\/bot-csv/]
const SOLO_LECTURA = 'Estás viendo como otro usuario (solo lectura). Vuelve a tu cuenta para hacer cambios.'

async function api(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl
  if (pathname.startsWith('/api/auth/')) return NextResponse.next()
  const lee = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
  const marcaLeida = pathname.startsWith('/api/mensajes/') && searchParams.get('leida') === '1'
  if (lee && !marcaLeida && !GET_QUE_ESCRIBEN.some(r => r.test(pathname))) return NextResponse.next()
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.verComo) return NextResponse.next()
  if (marcaLeida) {
    const url = req.nextUrl.clone()
    url.searchParams.delete('leida')
    return NextResponse.rewrite(url)
  }
  return NextResponse.json({ error: SOLO_LECTURA }, { status: 403 })
}

export default async function proxy(req: NextRequest, ev: NextFetchEvent) {
  if (req.nextUrl.pathname.startsWith('/api/')) return api(req)
  const res = await paginas(req as NextRequestWithAuth, ev)
  // Sin sesión: withAuth ya redirige al login con callbackUrl.
  if (res && (res.headers.get('location') || res.status >= 300)) return res
  // Con sesión: la ruta pedida viaja al layout (x-ruta). Si la sesión vence ahí (12 h sin uso, lib/auth.ts),
  // el layout manda al login con callbackUrl y al volver a entrar se vuelve a esa sección (2026-10-15).
  const headers = new Headers(req.headers)
  headers.set('x-ruta', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Excluye login, api, /tasa exacto (board público de lectura, sin login —
  // ver app/tasa/page.tsx; "tasa(?:/.*)?$" para NO excluir también /tasas,
  // la página interna de administración que sí requiere login), assets de
  // Next y CUALQUIER archivo estático (con extensión: logo.jpg, favicon*.png,
  // .ico, .webmanifest, etc.) para que el auth no los redirija. "fundadores$": la página
  // pública del Programa Fundadores (solicitudes de vendedores sin cuenta). "extension(?:/.*)?$": todo lo de la
  // extensión de Chrome (link, política de privacidad), público: lo pide la Chrome Web Store.
  // /api pasa aparte solo por el candado de "Ver como" (no pide sesión: cada ruta la chequea).
  matcher: ['/((?!login|fundadores$|extension(?:/.*)?$|api|tasa(?:/.*)?$|_next/static|_next/image|.*\\.).*)', '/api/:path*'],
}
