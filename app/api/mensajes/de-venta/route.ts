import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { leerMensajesRapidos } from '@/lib/mensajesRapidos'
import { conexionDeVenta } from '@/lib/notasML'
import { mlFetch } from '@/lib/ml'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'

// GET /api/mensajes/de-venta?numero=2000… → la conversación de Mensajes de esa venta (2026-10-12), para
// abrirla desde Ventas → Nueva venta ("Lo que se habló") con el MISMO componente de la bandeja.
// Si la venta todavía no tiene conversación en la bandeja, se crea su fila (vacía): así las rutas de
// Mensajes (hilo, notas, adjuntos, responder) la encuentran. `puedeEscribir` = permiso de Mensajes.
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const numero = new URL(req.url).searchParams.get('numero')?.trim() ?? ''
  if (!/^\d{10,20}$/.test(numero)) return NextResponse.json({ error: 'Número inválido' }, { status: 400 })
  try {
    // La venta: primero de lo sincronizado (sin llamar a ML); si no está, se busca en las cuentas.
    let { rows: [v] } = await s.db.query(
      `SELECT conexion_id, COALESCE(pack_id, id)::text AS pack, comprador, comprador_nombre, productos
       FROM ml_ordenes WHERE id = $1::bigint OR pack_id = $1::bigint ORDER BY (id = $1::bigint) DESC LIMIT 1`, [numero])
    if (!v) {
      const conexionId = await conexionDeVenta(s.db, numero)
      if (!conexionId) return NextResponse.json({ error: 'No se encontró en tus cuentas de MercadoLibre' }, { status: 404 })
      const o = await mlFetch<{ pack_id?: number | null }>(s.db, conexionId, `/orders/${numero}`).catch(() => null)
      v = { conexion_id: conexionId, pack: String(o?.pack_id ?? numero), comprador: null, comprador_nombre: null, productos: null }
    }
    await s.db.query(
      `INSERT INTO ml_conversaciones (pack_id, conexion_id, productos, comprador_nick, comprador_nombre)
       VALUES ($1::bigint, $2, $3, $4, $5) ON CONFLICT (empresa_id, pack_id) DO NOTHING`,
      [v.pack, v.conexion_id, v.productos, v.comprador, v.comprador_nombre])
    // Mismas columnas que la bandeja (app/api/mensajes/route.ts).
    const { rows: [conversacion] } = await s.db.query(
      `SELECT c.pack_id::text, c.sin_leer, c.ultimo_texto, c.ultimo_de_comprador, c.ultimo_at, c.productos, c.notas,
              NULLIF(c.comprador_nick, '') AS comprador_nick, c.comprador_nombre,
              x.nickname AS cuenta, d.despachada_at, (o.estado = 'cancelled') AS cancelada, $2::boolean AS con_despachos
       FROM ml_conversaciones c
       JOIN ml_conexiones x ON x.id = c.conexion_id
       LEFT JOIN LATERAL (
         SELECT l.generated_at AS despachada_at FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id
         WHERE e.venta = c.pack_id::text AND e.impresa AND l.status = 'GENERADO' ORDER BY l.generated_at DESC LIMIT 1
       ) d ON TRUE
       LEFT JOIN LATERAL (SELECT estado FROM ml_ordenes WHERE id = c.pack_id OR pack_id = c.pack_id LIMIT 1) o ON TRUE
       WHERE c.pack_id = $1::bigint`, [v.pack, tieneModulo(s.session.user, 'despachos')])
    const { rows: [pl] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'mensajes_plantillas'`)
    return NextResponse.json({ conversacion, rapidas: leerMensajesRapidos(pl?.value), puedeEscribir: puede(s.session.user, 'ver_mensajes') })
  } catch (err) {
    return apiError(err)
  }
}
