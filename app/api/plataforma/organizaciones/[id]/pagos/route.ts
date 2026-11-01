import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { soloDueno } from '@/lib/plataforma'
import { ESCALONES, MODULOS_CONTROLADOS, MODULOS_PLAN, RECARGA_IA, planConRadar, sumarMeses } from '@/lib/planes'
import { currentDate } from '@/lib/tz'

// Plataforma → ficha del cliente → Plan y pagos (01-11-2026, migración 138).
//   POST { tipo: 'plan' }: activa o renueva el plan (estado activo, pagado hasta, módulos del plan y créditos del escalón;
//        Automatizaciones y Completo traen el Radar Gratis y, el PRIMER plan con Radar, 1 mes de PRO de fin de semana
//        de regalo; Esencial no trae Radar).
//   POST { tipo: 'recarga' }: créditos de IA que no vencen (suman al tope del mes, lib/ia.ts cupoIA).
//   POST { tipo: 'radar_pro' }: Radar PRO de fin de semana pagado ($6/mes) hasta una fecha.
//   GET: el historial de pagos.
const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
const Body = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('plan'), plan: z.enum(['esencial', 'automatizaciones', 'completo']),
    escalon: z.number().int().min(0).max(ESCALONES.length - 1), ciclo: z.enum(['mensual', 'trimestral']),
    hasta: Fecha, monto: z.number().min(0).max(100000), nota: z.string().max(300).optional(),
  }),
  z.object({
    tipo: z.literal('recarga'), empresa_id: z.number().int(), creditos: z.number().int().min(1).max(100000),
    monto: z.number().min(0).max(100000), nota: z.string().max(300).optional(),
  }),
  z.object({ tipo: z.literal('radar_pro'), hasta: Fecha, monto: z.number().min(0).max(100000), nota: z.string().max(300).optional() }),
])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await soloDueno()
  if (error) return error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const org = Number(id)
  const db = dbGlobal()
  try {
    const b = Body.parse(await req.json())
    const { rows: [o] } = await db.query(
      `SELECT estado, plan, to_char(plan_hasta, 'YYYY-MM-DD') AS plan_hasta, to_char(radar_pro_hasta, 'YYYY-MM-DD') AS radar_pro_hasta,
              EXISTS (SELECT 1 FROM organizacion_pagos p WHERE p.organizacion_id = o.id AND p.tipo = 'plan') AS pago_antes
       FROM organizaciones o WHERE id = $1`, [org])
    if (!o) return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 })
    const hoy = currentDate()
    const por = session!.user.id

    if (b.tipo === 'recarga') {
      const { rowCount } = await db.query(`SELECT 1 FROM empresas WHERE id = $1 AND organizacion_id = $2`, [b.empresa_id, org])
      if (!rowCount) return NextResponse.json({ error: 'La empresa no es de este cliente' }, { status: 400 })
      await db.query(
        `INSERT INTO organizacion_pagos (organizacion_id, empresa_id, tipo, monto, creditos, nota, por) VALUES ($1, $2, 'recarga', $3, $4, $5, $6)`,
        [org, b.empresa_id, b.monto, b.creditos, b.nota || null, por])
      return NextResponse.json({ ok: true, mensaje: `Recarga de ${b.creditos} créditos guardada: ya los puede usar.` })
    }

    if (org === ORGANIZACION_PLATAFORMA) return NextResponse.json({ error: 'Tu organización es la propietaria: no tiene plan' }, { status: 400 })

    if (b.tipo === 'radar_pro') {
      if (!planConRadar(o.plan)) return NextResponse.json({ error: 'El Radar viene con Automatizaciones o Completo: primero registra uno de esos planes' }, { status: 400 })
      const desde = o.radar_pro_hasta && o.radar_pro_hasta >= hoy ? o.radar_pro_hasta : hoy
      await db.query(`UPDATE organizaciones SET radar_pro_hasta = $2 WHERE id = $1`, [org, b.hasta])
      await db.query(
        `INSERT INTO organizacion_pagos (organizacion_id, tipo, monto, desde, hasta, nota, por) VALUES ($1, 'radar_pro', $2, $3, $4, $5, $6)`,
        [org, b.monto, desde, b.hasta, b.nota || null, por])
      return NextResponse.json({ ok: true, mensaje: `Radar PRO de fin de semana hasta el ${b.hasta.split('-').reverse().join('/')}.` })
    }

    // Plan: desde el día siguiente al pagado (si sigue vigente) o desde hoy.
    if (b.hasta < hoy) return NextResponse.json({ error: 'La fecha "pagado hasta" ya pasó' }, { status: 400 })
    const desde = o.plan_hasta && o.plan_hasta >= hoy ? o.plan_hasta : hoy
    const bienvenida = planConRadar(b.plan) && !o.radar_pro_hasta    // primer plan con Radar: 1 mes de PRO de regalo
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `UPDATE organizaciones SET estado = 'activo', plan = $2, escalon = $3, ciclo = $4, plan_hasta = $5,
           prueba_dias = NULL, motivo_pausa = NULL, pausa_fecha = NULL,
           radar_pro_hasta = CASE WHEN $6 THEN $7::date ELSE radar_pro_hasta END,
           -- Créditos de IA (mig. 140): el primer plan o el que vuelve tras vencer arranca su mes hoy; renovar
           -- un plan vigente sigue con el mismo día de renovación.
           creditos_desde = CASE WHEN $8 THEN NOW() ELSE creditos_desde END
         WHERE id = $1`, [org, b.plan, b.escalon, b.ciclo, b.hasta, bienvenida, sumarMeses(hoy, 1),
          !(o.estado === 'activo' && o.plan_hasta && o.plan_hasta >= hoy)])
      // Módulos del plan (los demás no se tocan; el Radar solo en Automatizaciones y Completo); créditos del escalón.
      await client.query(
        `UPDATE empresas SET
           modulos = ARRAY(SELECT DISTINCT m FROM unnest(
             ARRAY(SELECT x FROM unnest(modulos) x WHERE x <> ALL($2::text[])) || $3::text[]) m),
           ia_limite_mes = $4
         WHERE organizacion_id = $1`, [org, [...MODULOS_CONTROLADOS], [...MODULOS_PLAN[b.plan]], ESCALONES[b.escalon].creditos])
      await client.query(
        `INSERT INTO organizacion_pagos (organizacion_id, tipo, monto, plan, escalon, ciclo, desde, hasta, nota, por)
         VALUES ($1, 'plan', $2, $3, $4, $5, $6, $7, $8, $9)`,
        [org, b.monto, b.plan, b.escalon, b.ciclo, desde, b.hasta, b.nota || null, por])
      await client.query(`INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle, por) VALUES ($1, $2, $3, $4)`,
        [org, o.estado === 'activo' ? 'renovada' : 'activa', `${b.plan} hasta ${b.hasta}`, por])
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally { client.release() }
    return NextResponse.json({ ok: true, mensaje: `Plan activo hasta el ${b.hasta.split('-').reverse().join('/')}.`
      + (bienvenida ? ` Incluye Radar PRO de fin de semana hasta el ${sumarMeses(hoy, 1).split('-').reverse().join('/')} (bienvenida).` : '') })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  try {
    const { rows } = await dbGlobal().query(
      `SELECT p.id, p.tipo, p.fecha, p.monto::float, p.plan, p.escalon, p.ciclo, to_char(p.desde, 'YYYY-MM-DD') AS desde,
              to_char(p.hasta, 'YYYY-MM-DD') AS hasta, p.creditos, p.nota, e.nombre AS empresa, u.full_name AS por
       FROM organizacion_pagos p LEFT JOIN empresas e ON e.id = p.empresa_id LEFT JOIN users u ON u.id = p.por
       WHERE p.organizacion_id = $1 ORDER BY p.fecha DESC LIMIT 100`, [id])
    return NextResponse.json({ pagos: rows, recarga: RECARGA_IA })
  } catch (err) { return apiError(err) }
}
