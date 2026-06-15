import { withAuth } from 'next-auth/middleware'

export default withAuth({ pages: { signIn: '/login' } })

export const config = {
  // Excluye login, api, assets de Next y CUALQUIER archivo estático (con extensión:
  // logo.jpg, favicon*.png, .ico, .webmanifest, etc.) para que el auth no los redirija.
  matcher: ['/((?!login|api|_next/static|_next/image|.*\\.).*)'],
}
