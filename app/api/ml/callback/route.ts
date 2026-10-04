import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { canjearCodigo, cifrar, usuarioML } from '@/lib/ml'
import { dbGlobal } from '@/lib/db'

// Paso 2 del OAuth: ML vuelve con ?code&state. Se canjea el código por los tokens y se
// guarda la cuenta en la empresa de la sesión (cifrados). Siempre termina en /preguntas.
export async function GET(req: NextRequest) {
  const base = new URL('/preguntas', process.env.NEXTAUTH_URL ?? req.url)
  const volver = (params: Record<string, string>) => {
    const u = new URL(base)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    const r = NextResponse.redirect(u)
    r.cookies.delete({ name: 'ml_oauth', path: '/api/ml' })
    return r
  }

  const s = await sesionPreguntas(true)
  if ('error' in s) return volver({ ml_error: 'Tu sesión no puede conectar cuentas' })

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''
  if (url.searchParams.get('error')) return volver({ ml_error: 'Cancelaste la autorización en MercadoLibre' })

  const [esperado, empresa] = (req.cookies.get('ml_oauth')?.value ?? '').split('.')
  const iguales = esperado && state.length === esperado.length &&
    timingSafeEqual(Buffer.from(state), Buffer.from(esperado))
  if (!code || !iguales || Number(empresa) !== s.session.user.empresaId) {
    return volver({ ml_error: 'La autorización venció o no coincide. Vuelve a intentarlo.' })
  }

  try {
    const t = await canjearCodigo(code)
    const u = await usuarioML(t.access_token)
    try {
      await s.db.query(
        `INSERT INTO ml_conexiones (ml_user_id, nickname, site_id, access_token_enc, refresh_token_enc,
                                    expira_en, scopes, estado, conectada_por)
         VALUES ($1,$2,$3,$4,$5, NOW() + make_interval(secs => $6), $7, 'activa', $8)
         ON CONFLICT (ml_user_id) DO UPDATE SET
           nickname = EXCLUDED.nickname, site_id = EXCLUDED.site_id,
           access_token_enc = EXCLUDED.access_token_enc, refresh_token_enc = EXCLUDED.refresh_token_enc,
           expira_en = EXCLUDED.expira_en, scopes = EXCLUDED.scopes, estado = 'activa',
           ultimo_error = NULL, conectada_por = EXCLUDED.conectada_por, updated_at = NOW()`,
        [u.id, u.nickname, u.site_id, cifrar(t.access_token), cifrar(t.refresh_token),
         t.expires_in, t.scope ?? null, Number(s.session.user.id)])
    } catch {
      // La fila existe pero es de OTRA empresa (RLS no deja actualizarla).
      return volver({ ml_error: `La cuenta ${u.nickname} ya está conectada en otra empresa` })
    }
    // Primera cuenta conectada: arrancan los días de prueba (migración 067). LEAST: nunca pasa
    // del tope que se fijó al crear la cuenta; prueba_dias = NULL para no volver a hacerlo.
    await dbGlobal().query(
      `UPDATE organizaciones o SET prueba_dias = NULL,
         prueba_hasta = LEAST(o.prueba_hasta, (NOW() AT TIME ZONE 'America/Caracas')::date + o.prueba_dias)
       FROM empresas e WHERE e.id = $1 AND o.id = e.organizacion_id AND o.prueba_dias IS NOT NULL AND o.estado = 'prueba'`,
      [s.session.user.empresaId]).catch(e => console.error('[ML callback] prueba', e instanceof Error ? e.message : e))
    return volver({ conectada: u.nickname })
  } catch (e) {
    console.error('[ML callback]', e instanceof Error ? e.message : e)
    return volver({ ml_error: 'MercadoLibre no aceptó la autorización. Vuelve a intentarlo.' })
  }
}
