import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { mlConfigurado, urlAutorizacion } from '@/lib/ml'

// Paso 1 del OAuth: manda al administrador a MercadoLibre para que autorice la cuenta.
// El `state` va en una cookie propia (solo este navegador, 10 min) y se compara al volver.
// Se abre como LINK (botón o /conectar copiado en otra PC): los errores se muestran en pantalla
// (/cuentas-ml?ml_error) y sin sesión se pasa por el login, que vuelve aquí.
export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL ?? req.url
  const s = await sesionPreguntas(true)
  if ('error' in s && s.error) {
    if (s.error.status === 401) return NextResponse.redirect(new URL('/login?callbackUrl=%2Fconectar', base))
    const { error } = await s.error.json().catch(() => ({ error: 'No puedes conectar cuentas' }))
    return NextResponse.redirect(new URL(`/cuentas-ml?ml_error=${encodeURIComponent(error)}`, base))
  }
  if (!mlConfigurado()) {
    return NextResponse.redirect(new URL(`/cuentas-ml?ml_error=${encodeURIComponent('Falta configurar la app de MercadoLibre en el servidor')}`, base))
  }
  const state = randomBytes(24).toString('base64url')
  const res = NextResponse.redirect(urlAutorizacion(s.session.user.country, state))
  res.cookies.set('ml_oauth', `${state}.${s.session.user.empresaId}`, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/api/ml', maxAge: 600,
  })
  return res
}
