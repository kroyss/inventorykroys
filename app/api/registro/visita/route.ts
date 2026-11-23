import { NextRequest, NextResponse } from 'next/server'
import { anotarEvento, CAMPOS, corto, EVENTOS, type EventoRegistro } from '@/lib/registroEmbudo'

// POST /api/registro/visita — anota los pasos en /registro (27-10, migración 128; embudo 23-11, migración 196). Sin
// sesión: la llama la página en el navegador (los robots que solo leen el link no la ejecutan). Al irse llega por
// sendBeacon (cuerpo como texto). Nunca falla hacia la página.
//   { evento?: 'vista'|'empezo'|'error'|'salio', origen?, campana?, detalle?, segundos? }  ('registro' lo anota /api/registro)
export async function POST(req: NextRequest) {
  const b = await req.text().then(t => JSON.parse(t) as Record<string, unknown>).catch(() => ({} as Record<string, unknown>))
  const evento = (EVENTOS as readonly string[]).includes(String(b.evento)) && b.evento !== 'registro' ? b.evento as EventoRegistro : 'vista'
  // detalle: al salir, solo un nombre de campo conocido; en un error, el mensaje del sistema (nunca lo que escribió).
  const detalle = evento === 'salio' ? ((CAMPOS as readonly string[]).includes(String(b.detalle)) ? String(b.detalle) : null)
    : evento === 'error' ? (typeof b.detalle === 'string' ? b.detalle.slice(0, 120) : null) : null
  const segundos = typeof b.segundos === 'number' && Number.isFinite(b.segundos) ? b.segundos : null
  await anotarEvento(req, { evento, origen: corto(b.origen), campana: corto(b.campana, 80), detalle, segundos: evento === 'salio' ? segundos : null })
  return NextResponse.json({ ok: true })
}
