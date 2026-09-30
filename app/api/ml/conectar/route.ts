import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { mlConfigurado, urlAutorizacion } from '@/lib/ml'

// Paso 1 del OAuth: manda al administrador a MercadoLibre para que autorice la cuenta.
// El `state` va en una cookie propia (solo este navegador, 10 min) y se compara al volver.
export async function GET() {
  const s = await sesionPreguntas(true)
  if ('error' in s) return s.error
  if (!mlConfigurado()) {
    return NextResponse.json({ error: 'Falta configurar la app de MercadoLibre en el servidor' }, { status: 503 })
  }
  const state = randomBytes(24).toString('base64url')
  const res = NextResponse.redirect(urlAutorizacion(s.session.user.country, state))
  res.cookies.set('ml_oauth', `${state}.${s.session.user.empresaId}`, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/api/ml', maxAge: 600,
  })
  return res
}
