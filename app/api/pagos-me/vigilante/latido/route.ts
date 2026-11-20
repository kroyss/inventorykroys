import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante, cuentaDePerfil, PEDIDO_VIGENTE_MIN, SQL_PERFIL_PENDIENTE, versionAlMenos, versionExtension } from '@/lib/pagosME'

/** Sin una lectura buena de este perfil en estos días, se lee completo (7 días). */
const COMPLETA_SI_NO_HAY_DIAS = 3
/** Con más órdenes pendientes que esto, sale más barato leer la lista completa. */
const MAX_REVISAR = 200
/** Margen hacia atrás de la fecha de corte (reloj del portal vs el nuestro, órdenes creadas mientras se leía). */
const MARGEN_CORTE_MIN = 30
/** 1.4.1: margen hacia atrás del último aviso leído (avisos publicados mientras se leía). */
const MARGEN_AVISOS_MIN = 10

/**
 * POST /api/pagos-me/vigilante/latido (clave del vigilante + x-perfil) → cada ~1 min desde la extensión.
 * Solo toca este servidor (nunca MercadoEnvíos). Responde si hay un "Traer pagos y guías" vigente que
 * este perfil todavía no hizo.
 */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    await a.db.query(
      `INSERT INTO me_latidos (perfil, visto_at) VALUES ($1, NOW())
       ON CONFLICT (empresa_id, perfil) DO UPDATE SET visto_at = NOW()`, [a.perfil])
    const { rows: [p] } = await a.db.query(
      `SELECT id, pesos FROM me_pedidos
       WHERE pedido_at > NOW() - make_interval(mins => $1) AND ${SQL_PERFIL_PENDIENTE('$2')}   -- 19-11: si leyó con error, reintenta una vez
       ORDER BY id DESC LIMIT 1`, [PEDIDO_VIGENTE_MIN, a.perfil])
    // Pesos del portal (Promociones, migración 094): la primera traída del día de cada cuenta, o la
    // pedida con "Actualizar pesos". La extensión 1.3.2+ los lee; las anteriores ignoran el dato.
    let pesos = false
    // 13-11 (mig. 174): también con Inventario (los pesos pasan a los productos: precios, margen, Costos ML).
    if (p && (a.modulos.includes('promociones') || a.modulos.includes('inventario'))) {
      if (p.pesos) pesos = true
      else {
        const { rows: [f] } = await a.db.query(
          `SELECT MAX(m.actualizado_at) > NOW() - INTERVAL '20 hours' AS fresco
           FROM me_latidos l LEFT JOIN me_productos m ON m.cuenta = l.cuenta
           WHERE l.perfil = $1`, [a.perfil])
        pesos = !f?.fresco
      }
    }
    // 19-11 noche (extensión 1.4.0): lectura corta SEGURA. La 1.3.9 leía por «última modificación» del portal, pero
    // MercadoEnvíos NO siempre la cambia al llegar un pago (6 de 14 pagos tardíos de PIKEKE quedaron con la fecha de
    // creación): se perdían. Ahora `corte` es por FECHA DE CREACIÓN (lo nuevo desde la última lectura buena, menos un
    // margen) y `revisar` son los números de las órdenes que esa lectura dejó esperando pago o guía (saltadas, o con pago
    // y sin guía o al revés): la extensión las pide de a una (/orders/{id}/, ~10 KB). Lo que ya tenía pago y guía no se
    // vuelve a bajar. Lectura completa (7 días: las órdenes vencen a los 7) si no hubo una lectura buena en 3 días.
    // `desde` (la de la 1.3.9) ya no se manda: la 1.3.9 lee siempre completo (lenta pero no pierde nada).
    // 20-11 (mig. 191): las pendientes salen de la lista de SEGUIMIENTO (me_seguimiento), no solo de la última traída:
    // la 1.4.0 dejaba caer las que estaban en la última página leída pero eran más viejas que el corte (las marcaba
    // vistas y no las pedía aparte) y se perdían para siempre (venta 2000019671715396). Ahora quedan anotadas hasta que
    // llegan con pago y guía o vencen (7 días). Si una se mandó a revisar y no volvió (caida_at, la marca el fin), el
    // corte se corre hasta su fecha: así la lista la procesa (esas páginas ya se leían igual: no cuesta más).
    // 1.4.1 (x-version): en vez de la lista lee los AVISOS del portal («Tienes un nuevo pago», 50 por página, ~15 KB)
    // desde el último leído; `revisar` = solo las que tienen algo a medias o no se pudieron leer.
    let corte: string | null = null
    let revisar: string[] = []
    let avisos: { desde: string; hasta: string | null } | null = null
    const barrido = false   // 20-11: sin barrido (el campo queda para la 1.4.1, que lo entiende)
    if (p) {
      const conAvisos = versionAlMenos(versionExtension(req), [1, 4, 1])
      const cuenta = await cuentaDePerfil(a.db, a.perfil)
      // Fuera las vencidas en el portal y las que ya llegaron completas.
      await a.db.query(
        `DELETE FROM me_seguimiento s WHERE s.cuenta = $1 AND (COALESCE(s.fecha_orden, s.creado_at) < NOW() - INTERVAL '7 days'
           OR EXISTS (SELECT 1 FROM me_pagos m WHERE m.venta IN (s.orden, COALESCE(s.venta, ''))
                      AND m.guia_path IS NOT NULL AND m.comprobante_path IS NOT NULL))`, [cuenta])
      const { rows: [u] } = await a.db.query(
        `SELECT id, pedido_at, pedido_at - make_interval(mins => $2) AS corte
         FROM me_pedidos, LATERAL (SELECT resultados->$1::text AS r) x
         WHERE pedido_at > NOW() - make_interval(days => $3) AND r->>'ok' = 'true' AND r->>'modo' IN ('completa', 'corta')
         ORDER BY pedido_at DESC LIMIT 1`,
        [a.perfil, MARGEN_CORTE_MIN, COMPLETA_SI_NO_HAY_DIAS])
      const { rows: seg } = await a.db.query(
        `SELECT orden, motivo, fecha_orden, caida_at FROM me_seguimiento WHERE cuenta = $1
         ORDER BY fecha_orden DESC NULLS LAST LIMIT 1000`, [cuenta])
      // Traídas a medias (pago sin guía o guía sin pago) de esta cuenta en la ventana: la otra mitad puede llegar.
      const { rows: medias } = await a.db.query(
        `SELECT p.venta FROM me_pagos p
         WHERE p.creado_at > NOW() - INTERVAL '7 days' AND (p.guia_path IS NULL OR p.comprobante_path IS NULL)
           AND p.cuenta = $1
         LIMIT 300`, [cuenta])
      const mediasIds = medias.map(m => String(m.venta)).filter(v => /^\d{10,}$/.test(v))

      // 20-11 (el dueño): SIN barrido. Probado con PIKEKE (5 días): el portal publicó el aviso del 100 % de las órdenes
      // (289/289) y de los pagos (240/240). Sin avisos leídos todavía (o hace más de 7 días) se leen los avisos de los 7
      // días (~600, ~12 páginas de 15 KB). Si el vigía vio que los avisos no funcionan (avisos route), 24 h con la
      // lectura de la lista de siempre.
      const { rows: [l] } = await a.db.query(
        `SELECT avisos_fallan_at > NOW() - INTERVAL '24 hours' AS fallan FROM me_latidos WHERE perfil = $1`, [a.perfil])
      if (conAvisos && !l?.fallan) {
        const { rows: [c] } = await a.db.query(
          `SELECT r->>'avisos_hasta' AS hasta
           FROM me_pedidos, LATERAL (SELECT resultados->$1::text AS r) x
           WHERE pedido_at > NOW() - INTERVAL '7 days' AND r->>'ok' = 'true' AND r->>'avisos_hasta' IS NOT NULL
           ORDER BY pedido_at DESC LIMIT 1`, [a.perfil])
        const hasta = c?.hasta ? Date.parse(c.hasta) : NaN
        const sieteDias = Date.now() - 7 * 864e5
        const desde = Number.isFinite(hasta) ? Math.max(sieteDias, hasta - MARGEN_AVISOS_MIN * 60e3) : sieteDias
        avisos = { desde: new Date(desde).toISOString(), hasta: Number.isFinite(hasta) ? new Date(hasta).toISOString() : null }
        const ids = new Set<string>(mediasIds)
        // 'cuadre' (20-11): ventas de ML que el cuadre diario no encontró en ninguna lectura: se piden por su número.
        for (const s of seg) if (s.motivo === 'no_leida' || s.motivo === 'cuadre' || s.caida_at) ids.add(String(s.orden))
        revisar = [...ids].slice(0, MAX_REVISAR)
      }
      if (!avisos && u?.corte) {
        const ids = new Set<string>([...seg.map(s => String(s.orden)), ...mediasIds])
        // Con más pendientes que esto sale más barato leer la lista completa (corte null).
        if (ids.size <= MAX_REVISAR) {
          let c = new Date(u.corte).getTime()
          for (const s of seg) if (s.caida_at && s.fecha_orden) c = Math.min(c, new Date(s.fecha_orden).getTime() - 60e3)
          corte = new Date(c).toISOString()
          revisar = [...ids]
        }
      }
      if (revisar.length) await a.db.query(
        `UPDATE me_seguimiento SET enviada_pedido = $2 WHERE cuenta = $1 AND orden = ANY($3::text[])`,
        [cuenta, p.id, revisar])
    }
    return NextResponse.json({ pedido: p ? Number(p.id) : null, pesos, corte, revisar, avisos, barrido })
  } catch (err) {
    return apiError(err)
  }
}
