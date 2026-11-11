import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Providers from '@/components/Providers'
import { connection } from 'next/server'
import { marca } from '@/lib/marca'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const inter = Inter({ subsets: ['latin'] })

// viewportFit 'cover': la página llega hasta el borde del iPhone y la barra inferior del celular
// se corre sola por encima del gesto de inicio (env(safe-area-inset-bottom) en BottomNav).
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#ffffff' }

// Metadatos según la marca de la instalación (lib/marca.ts). connection(): se resuelven
// por request, no al compilar (la MARCA la fija cada contenedor en tiempo de ejecución).
export async function generateMetadata(): Promise<Metadata> {
  await connection()
  const m = marca()
  return {
    title: { default: m.nombre, template: `%s — ${m.nombre}` },
    description: m.lema,
    manifest: m.id === 'syncsora' ? '/site.webmanifest' : undefined,
    icons: m.id === 'syncsora'
      ? {
          icon: [
            { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
            { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
            { url: '/favicon.ico' },
          ],
          apple: '/apple-touch-icon.png',
        }
      : { icon: [{ url: m.favicon, sizes: '32x32', type: 'image/png' }], apple: m.appleIcon },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 12-11 (rapidez): la sesión va en el HTML; así el navegador no la pide aparte al abrir cada pantalla
  // (/api/auth/session, 0,2–0,8 s). Sin sesión (login, páginas públicas) o si falla: undefined = la pide como antes.
  const session = (await getServerSession(authOptions).catch(() => null)) ?? undefined
  return (
    <html lang="es" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  )
}
