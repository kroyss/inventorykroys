import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionMiIA } from '@/lib/miIASesion'
import { leerMiIA, MI_IA_KEY, datoDeContacto } from '@/lib/miIA'

// POST /api/mi-ia/nota { texto } (10-11, el dueño): una corrección general para la IA («si preguntan X, di Y»), escrita desde
// una respuesta que salió mal. Se suma a Mi IA → Información extra, sección «Correcciones de mi equipo» (va en todas las
// respuestas de Preguntas y Mensajes). Las de un producto van a Datos del producto (/api/preguntas/notas).
const TITULO_CORRECCIONES = 'Correcciones de mi equipo'
const LARGO = 1500

const Nota = z.object({ texto: z.string().trim().min(3).max(300) })

export async function POST(req: NextRequest) {
  const s = await sesionMiIA()
  if ('error' in s) return s.error
  try {
    const p = Nota.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ error: 'Escribe la corrección (de 3 a 300 letras)' }, { status: 400 })
    if (datoDeContacto(p.data.texto)) return NextResponse.json({ error: 'Tiene un teléfono, correo o link: MercadoLibre borra esas respuestas.' }, { status: 400 })
    const { rows: [c] } = await s.db.query(`SELECT value FROM app_settings WHERE key = $1`, [MI_IA_KEY])
    const mi = leerMiIA(c?.value)
    if (!mi) return NextResponse.json({ error: 'Primero completa Mi IA' }, { status: 400 })
    const extras = [...(mi.extras ?? [])]
    const i = extras.findIndex(x => x.titulo === TITULO_CORRECCIONES)
    const linea = `- ${p.data.texto}`
    if (i >= 0) {
      // Las más nuevas primero; si no entra, se caen las más viejas.
      let texto = `${linea}\n${extras[i].texto}`
      while (texto.length > LARGO && texto.includes('\n')) texto = texto.slice(0, texto.lastIndexOf('\n'))
      extras[i] = { ...extras[i], texto, siempre: true }
    } else {
      if (extras.length >= 12) return NextResponse.json({ error: 'Mi IA ya tiene 12 secciones de información extra: borra una para agregar correcciones' }, { status: 400 })
      extras.push({ titulo: TITULO_CORRECCIONES, texto: linea, siempre: true })
    }
    await s.db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [MI_IA_KEY, JSON.stringify({ ...mi, extras, extrasNoAplica: false, actualizado: new Date().toISOString() })])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
