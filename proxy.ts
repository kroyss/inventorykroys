import { withAuth } from 'next-auth/middleware'

export default withAuth({ pages: { signIn: '/login' } })

export const config = {
  // Excluye login, api, /tasa (board público de lectura, sin login — ver
  // app/tasa/page.tsx), assets de Next y CUALQUIER archivo estático (con
  // extensión: logo.jpg, favicon*.png, .ico, .webmanifest, etc.) para que
  // el auth no los redirija.
  matcher: ['/((?!login|api|tasa|_next/static|_next/image|.*\\.).*)'],
}
