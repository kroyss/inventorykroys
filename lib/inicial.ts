// Solo del servidor (lo usan las page.tsx).
import { NextRequest } from 'next/server'

// Datos de la primera carga dentro del HTML (12-11, rapidez fase 2). La página del servidor llama al MISMO GET de la
// API que hoy pide el navegador (mismos permisos, misma respuesta) y se lo pasa al componente, que así no hace ese
// segundo viaje al abrir. Si tarda más de `ms`, falla o no hay permiso → null, y el componente lo pide él como antes.
export async function deApi<T>(get: (req: NextRequest) => Promise<Response | undefined>, url: string, ms = 1500): Promise<T | null> {
  let reloj: ReturnType<typeof setTimeout> | undefined
  try {
    const r = await Promise.race([
      get(new NextRequest(new URL(url, 'http://interno'))),
      new Promise<null>(ok => { reloj = setTimeout(() => ok(null), ms) }),
    ])
    if (!r || !r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(reloj)
  }
}

/** Tasa VE (/api/rates/latest) y parámetros de Ajustes (/api/settings), que piden Productos, Promociones y
 *  MercadoEnvíos al abrir. null en lo que no se pudo (el componente lo pide él). */
export type TasaYAjustes = { rate: Record<string, number> | null; settings: Record<string, string> | null }
export async function tasaYAjustes(): Promise<TasaYAjustes> {
  const [{ GET: tasa }, { GET: ajustes }] = await Promise.all([import('@/app/api/rates/latest/route'), import('@/app/api/settings/route')])
  const [rate, settings] = await Promise.all([
    deApi<Record<string, number>>(tasa, '/api/rates/latest'),
    deApi<Record<string, string>>(ajustes, '/api/settings'),
  ])
  return { rate, settings }
}
