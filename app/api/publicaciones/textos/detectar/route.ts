import { NextRequest, NextResponse } from 'next/server'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { apiError } from '@/lib/apiError'
import { crearLote } from '@/lib/lotesPublicaciones'
import { detectarRepetidos } from '@/lib/descripcionTexto'

// Detectar textos repetidos (pies y encabezados ya pegados en muchas descripciones).
// GET ?cuenta=ID → los candidatos, con las descripciones ya leídas de esa cuenta.
export async function GET(req: NextRequest) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const cuenta = Number(req.nextUrl.searchParams.get('cuenta'))
  if (!cuenta) return NextResponse.json({ error: 'Falta la cuenta' }, { status: 400 })
  try {
    const { rows } = await s.db.query(
      `SELECT d.item_id AS item, d.texto_ml AS texto FROM ml_item_descripcion d
       WHERE d.conexion_id = $1 AND d.texto_ml IS NOT NULL AND d.texto_ml <> ''`, [cuenta])
    const candidatos = detectarRepetidos(rows, Math.max(3, Math.round(rows.length * 0.02)))
      // Lo que ya es un texto guardado no se ofrece de nuevo.
    const { rows: ya } = await s.db.query(`SELECT texto FROM ml_desc_plantillas`)
    const guardados = new Set(ya.map(r => (r.texto as string).trim()))
    return NextResponse.json({
      leidas: rows.length,
      candidatos: candidatos.filter(c => !guardados.has(c.texto.trim())).map(c => ({ tipo: c.tipo, texto: c.texto, lineas: c.lineas, publicaciones: c.items.length })),
    })
  } catch (err) { return apiError(err) }
}

// POST { cuenta } → lee (en segundo plano) las descripciones de todas las publicaciones de esa cuenta. Solo lee.
export async function POST(req: NextRequest) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const { cuenta } = await req.json().catch(() => ({})) as { cuenta?: number }
  if (!Number.isInteger(cuenta)) return NextResponse.json({ error: 'Falta la cuenta' }, { status: 400 })
  try {
    const { rows: [enCurso] } = await s.db.query(
      `SELECT id FROM ml_pub_lotes WHERE tipo = 'leer' AND estado = 'en_curso' AND (parametros->>'cuenta')::int = $1`, [cuenta])
    if (enCurso) return NextResponse.json({ lote: enCurso.id, yaEnCurso: true })
    const { rows } = await s.db.query(
      `SELECT m.item_id FROM ml_catalogo m LEFT JOIN ml_item_descripcion d ON d.item_id = m.item_id
       WHERE m.conexion_id = $1 AND (d.leido_at IS NULL OR d.leido_at < NOW() - INTERVAL '12 hours')`, [cuenta])
    if (!rows.length) return NextResponse.json({ lote: null, nada: true })
    const { rows: [k] } = await s.db.query(`SELECT nickname FROM ml_conexiones WHERE id = $1`, [cuenta])
    const lote = await crearLote(s.db, 'leer', `Leer descripciones de ${k?.nickname ?? 'la cuenta'} (${rows.length})`, { cuenta },
      rows.map(r => ({ item: r.item_id })), Number(s.session.user.id) || null)
    return NextResponse.json({ lote })
  } catch (err) { return apiError(err) }
}
