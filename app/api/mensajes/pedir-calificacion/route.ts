import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { esDemo } from '@/lib/demo'
import { ErrorML } from '@/lib/ml'
import { responderHilo } from '@/lib/mensajesML'
import { problemasDelTexto } from '@/lib/preguntasTexto'
import { registrarOrigen } from '@/lib/respuestasOrigen'
import { armarTexto, DESDE_DIAS, HASTA_DIAS, SQL_PEDIBLES, TEXTO_INICIAL, textoPedido } from '@/lib/pedirCalificacion'

// Mensajes → "Pedir calificación" (lib/pedirCalificacion.ts). Manual: nada se envía solo.
//   GET  (?contar=1: solo cuántas)      → las ventas donde conviene pedirla, con el texto ya armado
//   POST { orden, texto }               → lo envía por la mensajería de ML y la marca pedida
//   POST { orden, no_pedir: true }      → la saca de la lista sin mandar nada
//   PUT  { texto }                      → cambia el texto de la empresa (Configurar automatizaciones)

async function acceso() {
  const s = await sesionPreguntas()
  if ('error' in s) return s
  if (!puede(s.session.user, 'ver_mensajes')) return { error: forbidden() }
  return s
}

export async function GET(req: NextRequest) {
  const s = await acceso()
  if ('error' in s) return s.error
  try {
    if (req.nextUrl.searchParams.get('contar')) {
      const { rows: [r] } = await s.db.query(`SELECT COUNT(*)::int AS n FROM (${SQL_PEDIBLES}) t`)
      return NextResponse.json({ n: r.n })
    }
    const pais = s.session.user.country
    const plantilla = await textoPedido(s.db)
    const { rows } = await s.db.query(SQL_PEDIBLES)
    // Las ya pedidas en los últimos días (para ver qué se mandó y si ya calificaron).
    const { rows: pedidas } = await s.db.query(
      `SELECT o.id::text AS orden, COALESCE(o.pack_id, o.id)::text AS pack, x.nickname AS cuenta, o.productos,
              COALESCE(NULLIF(o.comprador_nombre, ''), o.comprador) AS nombre, o.cal_pedida_at AS pedida_at, u.username AS pedida_por,
              o.cal_comprador IS NOT NULL AS ya_califico, o.cal_recibida AS rating
       FROM ml_ordenes o JOIN ml_conexiones x ON x.id = o.conexion_id LEFT JOIN users u ON u.id = o.cal_pedida_por
       WHERE o.cal_pedida_at > NOW() - INTERVAL '14 days' ORDER BY o.cal_pedida_at DESC LIMIT 100`)
    return NextResponse.json({
      lista: rows.map(r => ({ ...r, texto: armarTexto(plantilla, r, pais) })),
      pedidas, plantilla, inicial: TEXTO_INICIAL, desde: DESDE_DIAS, hasta: HASTA_DIAS,
      puedeEditar: puede(s.session.user, 'automatizaciones_config'),
    })
  } catch (err) {
    return apiError(err)
  }
}

const Enviar = z.object({ orden: z.string().regex(/^\d{5,20}$/), texto: z.string().trim().min(10).max(350) })
const NoPedir = z.object({ orden: z.string().regex(/^\d{5,20}$/), no_pedir: z.boolean() })

export async function POST(req: NextRequest) {
  const s = await acceso()
  if ('error' in s) return s.error
  const body = await req.json().catch(() => null)
  try {
    const np = NoPedir.safeParse(body)
    if (np.success) {
      await s.db.query(`UPDATE ml_ordenes SET cal_no_pedir = $2 WHERE id = $1`, [np.data.orden, np.data.no_pedir])
      return NextResponse.json({ ok: true })
    }
    const r = Enviar.safeParse(body)
    if (!r.success) return NextResponse.json({ error: r.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    const { orden, texto } = r.data
    const problemas = problemasDelTexto(texto, 'mensaje')
    if (problemas.length) return NextResponse.json({ error: `MercadoLibre rechazaría este mensaje: ${problemas.join(' · ')}` }, { status: 422 })

    // Sigue siendo pedible (no la pidió otro mientras tanto, no calificó, no escribió).
    const { rows: [v] } = await s.db.query(`SELECT * FROM (${SQL_PEDIBLES}) t WHERE orden = $1`, [orden])
    if (!v) return NextResponse.json({ error: 'Ya no está para pedir: alguien la pidió, el comprador calificó o escribió' }, { status: 409 })
    const { rows: [o] } = await s.db.query(`SELECT conexion_id FROM ml_ordenes WHERE id = $1`, [orden])

    if (!(await esDemo(s.db))) {
      // La conversación de la venta (puede no existir si el comprador nunca escribió): como Ventas → "Lo que se habló".
      await s.db.query(
        `INSERT INTO ml_conversaciones (pack_id, conexion_id, productos, comprador_nick, comprador_nombre)
         VALUES ($1::bigint, $2, $3, $4, $5) ON CONFLICT (empresa_id, pack_id) DO NOTHING`,
        [v.pack, o.conexion_id, v.productos, v.nick, v.nombre])
      try {
        await responderHilo(s.db, o.conexion_id, v.pack, texto)
      } catch (e) {
        if (e instanceof ErrorML) return NextResponse.json({ error: `MercadoLibre no lo dejó enviar: ${e.message}` }, { status: 502 })
        throw e
      }
      await registrarOrigen(s.db, { modulo: 'mensajes', ref: v.pack, texto, usuarioId: s.session.user.id })
    }
    await s.db.query(`UPDATE ml_ordenes SET cal_pedida_at = NOW(), cal_pedida_por = $2 WHERE id = $1`, [orden, Number(s.session.user.id)])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}

export async function PUT(req: NextRequest) {
  const s = await acceso()
  if ('error' in s) return s.error
  if (!puede(s.session.user, 'automatizaciones_config')) return forbidden()
  const r = z.object({ texto: z.string().trim().max(300) }).safeParse(await req.json().catch(() => null))
  if (!r.success) return NextResponse.json({ error: 'Texto inválido' }, { status: 400 })
  const texto = r.data.texto
  if (texto && !texto.includes('{link}')) return NextResponse.json({ error: 'El texto tiene que llevar {link} (el link para calificar)' }, { status: 400 })
  try {
    await s.db.query(
      `INSERT INTO app_settings (key, value) VALUES ('pedir_calificacion_texto', $1)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value`, [texto])
    return NextResponse.json({ ok: true, plantilla: texto || TEXTO_INICIAL })
  } catch (err) {
    return apiError(err)
  }
}
