import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { releerFotos } from '@/lib/fotosIA'

// Publicaciones que se contradicen (Mensajes → IA en prueba, 09-11): resolverlas sin salir de la lista.
//  · dato     → «El dato correcto es…»: queda en Datos de cada producto (ml_item_notas; lo leen Preguntas y Mensajes)
//               y la publicación sale de la lista (la IA ya responde con ese dato).
//  · ignorar  → «No es problema»: sale de la lista y la IA responde normal. Si la publicación cambia, se vuelve a revisar.
//  · releer   → «Ya lo corregí en ML»: se vuelve a leer ahora mismo.
const Cuerpo = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('dato'), item_id: z.string().regex(/^[A-Z]{3}\d+$/), texto: z.string().trim().min(3).max(500) }),
  z.object({ accion: z.literal('ignorar'), item_id: z.string().regex(/^[A-Z]{3}\d+$/) }),
  z.object({ accion: z.literal('releer'), item_id: z.string().regex(/^[A-Z]{3}\d+$/) }),
])

export async function POST(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const p = Cuerpo.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
    const b = p.data
    if (b.accion === 'dato') {
      await s.db.query(`INSERT INTO ml_item_notas (item_id, texto, creada_por) VALUES ($1, $2, $3)`, [b.item_id, b.texto, Number(s.session.user.id)])
      await s.db.query(`UPDATE ml_item_fotos_ia SET contradicciones = NULL WHERE item_id = $1`, [b.item_id])
      return NextResponse.json({ ok: true, contradicciones: null })
    }
    if (b.accion === 'ignorar') {
      await s.db.query(`UPDATE ml_item_fotos_ia SET contradicciones = NULL WHERE item_id = $1`, [b.item_id])
      return NextResponse.json({ ok: true, contradicciones: null })
    }
    const r = await releerFotos(s.db, b.item_id)
    if (!r) return NextResponse.json({ error: 'No se pudo leer la publicación en MercadoLibre. Prueba de nuevo en un rato.' }, { status: 502 })
    return NextResponse.json({ ok: true, contradicciones: r.contradicciones })
  } catch (err) { return apiError(err) }
}
