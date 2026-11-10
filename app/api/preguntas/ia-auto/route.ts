import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { CLAVE_IA_AUTO, configIA } from '@/lib/iaAutomatica'
import { cupoIA, CAMBIO_HAIKU55 } from '@/lib/ia'
import { tieneModulo } from '@/lib/modulos'
import { frenosDeFabrica } from '@/lib/iaFrenos'
import { errorFaltanMiIA, faltanMiIA } from '@/lib/miIA'

// GET /api/preguntas/ia-auto → Preguntas → Configuración → Respuesta automática con IA: el modo, los créditos y las
// últimas preguntas que procesó (qué decidió, la respuesta, la que se publicó y la marca bien/mal del vendedor).
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas('automatizaciones_config')
  if ('error' in s) return s.error
  if (!tieneModulo(s.session.user, 'ia_automatica')) return NextResponse.json({ error: 'Tu empresa no tiene la respuesta automática con IA' }, { status: 403 })
  try {
    const cfg = await configIA(s.db)
    // 06-11: por defecto se mide desde el cambio a Haiku 5.5 (?todo=1 = todo el historial).
    const desde = new URL(req.url).searchParams.get('todo') ? null : CAMBIO_HAIKU55
    const { rows } = await s.db.query(
      `SELECT id::text, texto, item_id, item_titulo, item_permalink, to_char(fecha, 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha, estado, respuesta, ia_auto
       FROM ml_preguntas WHERE ia_auto IS NOT NULL AND ia_auto->>'estado' IS DISTINCT FROM 'procesando'
         AND ($1::text IS NULL OR ia_auto->>'fecha' >= $1)
       ORDER BY fecha DESC LIMIT 400`, [desde])
    const sola = rows.filter(r => r.ia_auto.decision === 'sola')
    const marcadas = sola.filter(r => r.ia_auto.marca)
    // 08-11: en las que pasó a una persona, la marca dice si podía salir sola ('bien') o estuvo bien frenada ('mal').
    // Por motivo (lo que va antes de ":"), para saber qué regla frena de más.
    const frenadasMarcadas = rows.filter(r => r.ia_auto.decision === 'revisar' && r.ia_auto.marca)
    const porMotivo = new Map<string, { marcadas: number; podian: number }>()
    for (const r of frenadasMarcadas) {
      const ks = new Set<string>(((r.ia_auto.motivos ?? []) as string[]).map(m => String(m).split(':')[0].trim()).filter(Boolean))
      for (const k of ks.size ? ks : new Set(['Sin motivo'])) {
        const v = porMotivo.get(k) ?? { marcadas: 0, podian: 0 }
        v.marcadas++; if (r.ia_auto.marca === 'bien') v.podian++
        porMotivo.set(k, v)
      }
    }
    return NextResponse.json({
      ...cfg,
      faltanMiIA: tieneModulo(s.session.user, 'mi_ia') ? await faltanMiIA(s.db) : [],
      cupo: await cupoIA(s.db, s.session.user.empresaId),
      resumen: {
        procesadas: rows.length, solas: sola.length, revisar: rows.length - sola.length,
        marcadas: marcadas.length, bien: marcadas.filter(r => r.ia_auto.marca === 'bien').length,
        costo: rows.reduce((a, r) => a + (Number(r.ia_auto.costo) || 0), 0),
        frenadas: {
          marcadas: frenadasMarcadas.length, podian: frenadasMarcadas.filter(r => r.ia_auto.marca === 'bien').length,
          porMotivo: [...porMotivo.entries()].map(([motivo, v]) => ({ motivo, ...v })).sort((a, b) => b.marcadas - a.marcadas).slice(0, 8),
        },
      },
      economica: resumenEco(rows),
      haiku55: resumen55(rows),
      medirDesde: desde,
      preguntas: rows,
    })
  } catch (err) { return apiError(err) }
}

const Accion = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('modo'), modo: z.enum(['apagado', 'real']) }),   // 09-11: sin 'sombra' (Modo prueba)
  z.object({ accion: z.literal('todo'), todo: z.boolean() }),                      // 10-11: «Responder todo» (sin modo seguro)
  z.object({ accion: z.literal('marcar'), id: z.string().regex(/^\d+$/), marca: z.enum(['bien', 'mal']).nullable() }),
  z.object({ accion: z.literal('marcar_eco'), id: z.string().regex(/^\d+$/), marca: z.enum(['bien', 'mal']).nullable(),
    campo: z.enum(['eco', 'eco55']).default('eco') }),
])

// Versión económica en paralelo (04-11, lib/iaEconomica.ts): lo mismo que la real, medido sobre las mismas preguntas.
type FilaIA = { ia_auto: { decision: string; costo?: number; entrada?: number; salida?: number; marca?: string | null
  eco?: { estado?: string; decision?: string; via?: string; costo?: number; entrada?: number; salida?: number; marca?: string | null; error?: string } } }
type Eco = NonNullable<FilaIA['ia_auto']['eco']>
// Haiku 5.5 vs Haiku 4.5 (06-11): las dos recetas económicas medidas sobre LAS MISMAS preguntas (las que tienen las dos).
function resumen55(rows: FilaIA[]) {
  const de = (r: FilaIA, k: 'eco' | 'eco55') => (r.ia_auto as { eco?: Eco; eco55?: Eco })[k]
  const con = rows.filter(r => de(r, 'eco')?.decision && de(r, 'eco55')?.decision)
  const lado = (k: 'eco' | 'eco55') => {
    const solas = con.filter(r => de(r, k)!.decision === 'sola')
    const marcadas = solas.filter(r => de(r, k)!.marca)
    return {
      costo: con.reduce((a, r) => a + (Number(de(r, k)!.costo) || 0), 0),
      tokens: con.reduce((a, r) => a + (de(r, k)!.entrada ?? 0) + (de(r, k)!.salida ?? 0), 0),
      solas: solas.length, marcadas: marcadas.length, bien: marcadas.filter(r => de(r, k)!.marca === 'bien').length,
    }
  }
  return {
    comparadas: con.length, errores: rows.filter(r => de(r, 'eco55')?.error).length,
    costoReal: con.reduce((a, r) => a + (Number(r.ia_auto.costo) || 0), 0),
    h45: lado('eco'), h55: lado('eco55'),
    sinMarcar: con.filter(r => de(r, 'eco55')!.decision === 'sola' && !de(r, 'eco55')!.marca).length,
  }
}

function resumenEco(rows: FilaIA[]) {
  const con = rows.filter(r => r.ia_auto.eco?.decision)
  const n = (f: (r: FilaIA) => number | undefined) => con.reduce((a, r) => a + (Number(f(r)) || 0), 0)
  const ecoSola = con.filter(r => r.ia_auto.eco!.decision === 'sola')
  const marcadas = ecoSola.filter(r => r.ia_auto.eco!.marca)
  return {
    comparadas: con.length, errores: rows.filter(r => r.ia_auto.eco?.error).length,
    costoReal: n(r => r.ia_auto.costo), costoEco: n(r => r.ia_auto.eco!.costo),
    // Tokens: solo donde la real los guardó (desde el 04-11; las del modo prueba no los tienen).
    conTokens: con.filter(r => r.ia_auto.entrada).length,
    tokensReal: con.filter(r => r.ia_auto.entrada).reduce((a, r) => a + (r.ia_auto.entrada ?? 0) + (r.ia_auto.salida ?? 0), 0),
    tokensEco: con.filter(r => r.ia_auto.entrada).reduce((a, r) => a + (r.ia_auto.eco!.entrada ?? 0) + (r.ia_auto.eco!.salida ?? 0), 0),
    tokensEcoTodas: n(r => (r.ia_auto.eco!.entrada ?? 0) + (r.ia_auto.eco!.salida ?? 0)),
    solasReal: con.filter(r => r.ia_auto.decision === 'sola').length, solasEco: ecoSola.length,
    sinIA: con.filter(r => r.ia_auto.eco!.via === 'plantilla').length,
    ambasSolas: con.filter(r => r.ia_auto.decision === 'sola' && r.ia_auto.eco!.decision === 'sola').length,
    marcadas: marcadas.length, bien: marcadas.filter(r => r.ia_auto.eco!.marca === 'bien').length,
  }
}

export async function POST(req: NextRequest) {
  const s = await sesionPreguntas('automatizaciones_config')
  if ('error' in s) return s.error
  if (!tieneModulo(s.session.user, 'ia_automatica')) return NextResponse.json({ error: 'Tu empresa no tiene la respuesta automática con IA' }, { status: 403 })
  try {
    const b = Accion.parse(await req.json())
    if (b.accion === 'modo') {
      // 09-11: solo se activa con Mi IA completo (mejores respuestas desde el primer día).
      if (b.modo === 'real' && tieneModulo(s.session.user, 'mi_ia')) {
        const faltan = await faltanMiIA(s.db)
        if (faltan.length) return NextResponse.json({ error: errorFaltanMiIA(faltan), faltanMiIA: faltan }, { status: 400 })
      }
      const actual = await configIA(s.db)
      // "desde" = desde cuándo se procesan preguntas: al prender, solo las que llegan de ahí en adelante.
      const desde = b.modo === 'apagado' ? null : actual.modo === 'apagado' ? new Date().toISOString() : actual.desde
      await s.db.query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [CLAVE_IA_AUTO, JSON.stringify({ modo: b.modo, desde, v2: actual.v2 !== false, todo: b.modo === 'real' && actual.todo === true,
          ...(b.modo === 'real' ? { por: s.session.user.id, at: new Date().toISOString() } : {}) })])
      if (b.modo === 'real') await frenosDeFabrica(s.db)
    } else if (b.accion === 'todo') {
      const { rows: [a] } = await s.db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_IA_AUTO])
      let v: Record<string, unknown> = {}
      try { v = JSON.parse(a?.value ?? '{}') } catch { /* vacío */ }
      await s.db.query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [CLAVE_IA_AUTO, JSON.stringify({ ...v, todo: b.todo, todoPor: s.session.user.id, todoAt: new Date().toISOString() })])
    } else if (b.accion === 'marcar_eco') {
      await s.db.query(
        `UPDATE ml_preguntas SET ia_auto = jsonb_set(ia_auto, ARRAY[$3::text, 'marca'], to_jsonb($2::text))
         WHERE id = $1 AND ia_auto ? $3`, [b.id, b.marca, b.campo])
    } else {
      await s.db.query(
        `UPDATE ml_preguntas SET ia_auto = ia_auto || jsonb_build_object('marca', $2::text, 'marcada_at', NOW())
         WHERE id = $1 AND ia_auto IS NOT NULL`, [b.id, b.marca])
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
