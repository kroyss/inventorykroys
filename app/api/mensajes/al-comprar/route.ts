import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { puede } from '@/lib/permisos'
import { CLAVE_CONFIG, ESPERA_MIN, MAX_MENSAJES, MAX_TEXTO, leerConfigDb, ultimos } from '@/lib/mensajeAlComprar'
import { variablesDesconocidas, errorVariables } from '@/lib/recordatoriosPago'

// Mensaje al comprar (lib/mensajeAlComprar.ts, mig 118). En la pantalla: Mensajes → Configuración → Al recibir compra.
// GET ?pagina=N → configuración y los últimos mensajes (de a 20) · PUT { activo, textos[1..2] } (automatizaciones_config)
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas('ver_mensajes')
  if ('error' in s) return s.error
  try {
    const pagina = Math.max(1, Number(req.nextUrl.searchParams.get('pagina')) || 1)
    const [config, lista] = await Promise.all([leerConfigDb(s.db), ultimos(s.db, pagina)])
    return NextResponse.json({ config, lista: lista.filas, hayMas: lista.hayMas, pagina, max: MAX_TEXTO, maxMensajes: MAX_MENSAJES,
      esperaMin: ESPERA_MIN, puedeConfigurar: puede(s.session.user, 'automatizaciones_config') })
  } catch (err) {
    return apiError(err)
  }
}

const Texto = z.string().trim().min(10, 'Escribe el mensaje').max(MAX_TEXTO, `Máximo ${MAX_TEXTO} caracteres por mensaje (MercadoLibre corta lo que pase)`)
const Config = z.object({
  activo: z.boolean(),
  textos: z.array(Texto).min(1, 'Escribe el mensaje').max(MAX_MENSAJES, `Máximo ${MAX_MENSAJES} mensajes`),
})

export async function PUT(req: NextRequest) {
  const s = await sesionPreguntas('automatizaciones_config')
  if ('error' in s) return s.error
  try {
    const b = Config.parse(await req.json())
    const malas = variablesDesconocidas(b.textos.join(' '))
    if (malas.length) return NextResponse.json({ error: errorVariables(malas) }, { status: 400 })
    const antes = await leerConfigDb(s.db)
    // Al prenderlo arranca de cero: solo las ventas hechas desde ahora (nunca a las viejas).
    const desde = b.activo ? (antes.activo && antes.desde ? antes.desde : new Date().toISOString()) : null
    // `texto` = el primero: la versión anterior (mientras se sube sin corte) sigue leyendo lo mismo.
    await s.db.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [CLAVE_CONFIG, JSON.stringify({ activo: b.activo, textos: b.textos, texto: b.textos[0], desde })])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
