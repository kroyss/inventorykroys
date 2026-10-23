import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { puede } from '@/lib/permisos'
import { CLAVE_CONFIG, ESPERA_MIN, MAX_TEXTO, leerConfigDb, ultimos } from '@/lib/mensajeAlComprar'

// Mensaje al comprar (lib/mensajeAlComprar.ts, mig 118).
// GET → configuración y los últimos mensajes · PUT { activo, texto } (automatizaciones_config)
export async function GET() {
  const s = await sesionPreguntas('ver_mensajes')
  if ('error' in s) return s.error
  try {
    const [config, lista] = await Promise.all([leerConfigDb(s.db), ultimos(s.db)])
    return NextResponse.json({ config, lista, max: MAX_TEXTO, esperaMin: ESPERA_MIN,
      puedeConfigurar: puede(s.session.user, 'automatizaciones_config') })
  } catch (err) {
    return apiError(err)
  }
}

const Config = z.object({
  activo: z.boolean(),
  texto: z.string().trim().min(10, 'Escribe el mensaje').max(300, 'Máximo 300 caracteres (con el nombre y el producto no puede pasar de 350)'),
})

export async function PUT(req: NextRequest) {
  const s = await sesionPreguntas('automatizaciones_config')
  if ('error' in s) return s.error
  try {
    const b = Config.parse(await req.json())
    const antes = await leerConfigDb(s.db)
    // Al prenderlo arranca de cero: solo las ventas hechas desde ahora (nunca a las viejas).
    const desde = b.activo ? (antes.activo && antes.desde ? antes.desde : new Date().toISOString()) : null
    await s.db.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [CLAVE_CONFIG, JSON.stringify({ activo: b.activo, texto: b.texto, desde })])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
