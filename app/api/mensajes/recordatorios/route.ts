import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { tieneModulo } from '@/lib/modulos'
import { puede, type Permiso } from '@/lib/permisos'
import {
  CLAVE_CONFIG, HORAS, MAX_TEXTO, armarTexto, candidatos, detenerRecordatorio, leerConfigDb, ultimoTurno,
} from '@/lib/recordatoriosPago'

// Recordatorios de pago (lib/recordatoriosPago.ts): solo empresas con el módulo `pagos_me`.
// GET  → configuración, último turno, a quién le llegaría hoy y los detenidos recientes
// PUT  → guarda la configuración (automatizaciones_config)
// POST { pack, detener } → "Ya pagó, no recordar" / volver a recordar
async function sesion(permiso: Permiso = 'ver_mensajes') {
  const s = await sesionPreguntas(permiso)
  if ('error' in s) return s
  if (!tieneModulo(s.session.user, 'pagos_me')) {
    return { error: NextResponse.json({ error: 'Los recordatorios de pago necesitan Pagos ME' }, { status: 403 }) } as const
  }
  return s
}

export async function GET() {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const cfg = await leerConfigDb(s.db)
    const [lista, turno, { rows: detenidos }] = await Promise.all([
      candidatos(s.db, cfg),
      ultimoTurno(s.db),
      s.db.query(
        `SELECT r.pack_id::text AS pack, r.detenido, r.detenido_at, r.enviados, o.comprador, COALESCE(o.detalle->0->>'titulo', o.productos) AS producto
         FROM ml_recordatorios r
         LEFT JOIN LATERAL (SELECT comprador, detalle, productos FROM ml_ordenes WHERE COALESCE(pack_id, id) = r.pack_id LIMIT 1) o ON TRUE
         WHERE r.detenido IS NOT NULL AND r.detenido_at > NOW() - INTERVAL '10 days' ORDER BY r.detenido_at DESC LIMIT 30`),
    ])
    return NextResponse.json({
      config: cfg, horas: HORAS.slice(0, cfg.veces), turno, puedeConfigurar: puede(s.session.user, 'automatizaciones_config'),
      // Cómo le llegaría a cada uno (el último del período con el texto final).
      lista: lista.map(c => ({
        pack: c.pack, cuenta: c.cuenta, comprador: c.comprador, producto: c.producto, fecha: c.fecha, dia: c.dia,
        enviados: c.enviados, ultimo_at: c.ultimo_at, error: c.error,
        ultimo: c.dia >= cfg.dias + 1,
        texto: armarTexto(c.dia >= cfg.dias + 1 && cfg.final.activo ? cfg.final.texto : cfg.texto, c.comprador_nombre, c.producto),
      })),
      detenidos,
    })
  } catch (err) {
    return apiError(err)
  }
}

const Config = z.object({
  activo: z.boolean(),
  dias: z.number().int().min(1).max(5),
  veces: z.union([z.literal(1), z.literal(2)]),
  texto: z.string().trim().min(10, 'Escribe el texto del recordatorio').max(MAX_TEXTO - 60, `El texto es muy largo (máximo ${MAX_TEXTO - 60})`),
  final: z.object({
    activo: z.boolean(),
    texto: z.string().trim().max(MAX_TEXTO - 60, `El último aviso es muy largo (máximo ${MAX_TEXTO - 60})`),
  }),
})

export async function PUT(req: NextRequest) {
  const s = await sesion('automatizaciones_config')
  if ('error' in s) return s.error
  try {
    const cfg = Config.parse(await req.json())
    if (cfg.final.activo && cfg.final.texto.length < 10) {
      return NextResponse.json({ error: 'Escribe el texto del último aviso (o apágalo)' }, { status: 400 })
    }
    await s.db.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [CLAVE_CONFIG, JSON.stringify(cfg)])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}

const Detener = z.object({ pack: z.string().regex(/^\d{6,20}$/), detener: z.boolean() })

export async function POST(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const b = Detener.parse(await req.json())
    await detenerRecordatorio(s.db, b.pack, Number(s.session.user.id) || null, b.detener)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
