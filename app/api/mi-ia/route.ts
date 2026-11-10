import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionMiIA } from '@/lib/miIASesion'
import { configIA } from '@/lib/iaAutomatica'
import { esDuenoPlataforma } from '@/lib/empresa'
import { tieneModulo } from '@/lib/modulos'
import { EsquemaMiIA } from '@/lib/miIAEsquema'
import { leerMiIA, MI_IA_KEY, textoMiIA, datoDeContacto } from '@/lib/miIA'
import { leerPoliticas } from '@/lib/miIAPoliticas'
import { CLAVE_AUTO, autoTodo } from '@/lib/mensajesIAPrueba'
import type { Pool } from 'pg'
import { pruebasQuedan } from '@/lib/miIAPruebasTope'

async function mensajesAuto(db: Pool) {
  const { rows: [a] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_AUTO])
  try { return JSON.parse(a?.value ?? '{}').modo === 'real' } catch { return false }
}

// Mi IA (06-11, lib/miIA.ts): el cuestionario de reglas del negocio para la IA de Preguntas y Mensajes.
// GET → lo guardado (o null), el país y cuántas cuentas de ML tiene. PUT → guarda todo el cuestionario.
const sesion = sesionMiIA

export async function GET() {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const { rows: [c] } = await s.db.query(`SELECT value FROM app_settings WHERE key = $1`, [MI_IA_KEY])
    const { rows: [n] } = await s.db.query(`SELECT COUNT(*)::int AS n FROM ml_conexiones WHERE estado = 'activa'`)
    const politicas = await leerPoliticas(s.db)
    const miIA = leerMiIA(c?.value)
    return NextResponse.json({
      miIA, pais: s.session.user.country, cuentas: n?.n ?? 0,
      // 08-11: ¿tiene "Políticas para la IA" escritas aparte? → ofrece pasarlas a Mi IA (un solo lugar).
      politicas: politicas.length > 0,
      // 06-11 (el dueño): cómo se lo pasamos a la IA solo lo ve el dueño de la plataforma (no a clientes: se puede copiar).
      texto: miIA && esDuenoPlataforma(s.session.user) ? { preguntas: textoMiIA(miIA, 'preguntas'), mensajes: textoMiIA(miIA, 'mensajes') } : null,
      // Parte D: ¿puede encender la respuesta automática desde aquí? (módulo ia_automatica) y en qué modo está.
      iaAuto: tieneModulo(s.session.user, 'ia_automatica') ? (await configIA(s.db)).modo : null,
      // 10-11: «Responder todo» (sin modo seguro) de cada lado.
      iaTodo: tieneModulo(s.session.user, 'ia_automatica') ? (await configIA(s.db)).todo === true : false,
      msgTodo: tieneModulo(s.session.user, 'mensajes_ia') ? await autoTodo(s.db) : false,
      // 09-11: Mensajes automáticos (módulo mensajes_ia): encendido sí/no; null = no lo tiene.
      msgAuto: tieneModulo(s.session.user, 'mensajes_ia') ? await mensajesAuto(s.db) : null,
      // 09-11: pruebas gratis que le quedan hoy (null = sin tope).
      pruebas: await pruebasQuedan(s.db, s.session.user),
    })
  } catch (err) { return apiError(err) }
}

const Esquema = EsquemaMiIA

export async function PUT(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const p = Esquema.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
    const c = p.data
    // MercadoLibre borra o sanciona teléfonos, correos y links: no se dejan en lo que la IA repite siempre.
    for (const [campo, v] of [['La oferta fija', c.oferta?.texto], ['El saludo', c.tono?.saludo], ['La despedida', c.tono?.despedida]] as const) {
      if (datoDeContacto(v)) return NextResponse.json({ error: `${campo} tiene un teléfono, correo o link: MercadoLibre borra o sanciona esas respuestas.` }, { status: 400 })
    }
    const valor = JSON.stringify({ ...c, actualizado: new Date().toISOString() })
    await s.db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [MI_IA_KEY, valor])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
