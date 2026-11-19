import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante, PEDIDO_VIGENTE_MIN, SQL_PERFIL_PENDIENTE } from '@/lib/pagosME'

/** Sin una lectura buena de este perfil en estos días, se lee completo (7 días). */
const COMPLETA_SI_NO_HAY_DIAS = 3
/** Con más órdenes pendientes que esto, sale más barato leer la lista completa. */
const MAX_REVISAR = 200
/** Margen hacia atrás de la fecha de corte (reloj del portal vs el nuestro, órdenes creadas mientras se leía). */
const MARGEN_CORTE_MIN = 30

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
    // 19-11 noche (extensión 1.3.10): lectura corta SEGURA. La 1.3.9 leía por «última modificación» del portal, pero
    // MercadoEnvíos NO siempre la cambia al llegar un pago (6 de 14 pagos tardíos de PIKEKE quedaron con la fecha de
    // creación): se perdían. Ahora `corte` es por FECHA DE CREACIÓN (lo nuevo desde la última lectura buena, menos un
    // margen) y `revisar` son los números de las órdenes que esa lectura dejó esperando pago o guía (saltadas, o con pago
    // y sin guía o al revés): la extensión las pide de a una (/orders/{id}/, ~10 KB). Lo que ya tenía pago y guía no se
    // vuelve a bajar. Lectura completa (7 días: las órdenes vencen a los 7) si no hubo una lectura buena en 3 días.
    // `desde` (la de la 1.3.9) ya no se manda: la 1.3.9 lee siempre completo (lenta pero no pierde nada).
    let corte: string | null = null
    let revisar: string[] = []
    if (p) {
      const { rows: [u] } = await a.db.query(
        `SELECT id, pedido_at - make_interval(mins => $2) AS corte, r->'saltadas' AS saltadas
         FROM me_pedidos, LATERAL (SELECT resultados->$1::text AS r) x
         WHERE pedido_at > NOW() - make_interval(days => $3) AND r->>'ok' = 'true' AND r->>'modo' IN ('completa', 'corta')
         ORDER BY pedido_at DESC LIMIT 1`,
        [a.perfil, MARGEN_CORTE_MIN, COMPLETA_SI_NO_HAY_DIAS])
      // Con la lista de saltadas llena (500, el tope que guarda fin) puede faltar alguna: completa.
      if (u?.corte && !(Array.isArray(u.saltadas) && u.saltadas.length >= 500)) {
        const ids = new Set<string>()
        for (const x of (Array.isArray(u.saltadas) ? u.saltadas : []) as { orden?: string; motivo?: string; fecha?: string }[]) {
          if (!x?.orden || !['sin_pago_ni_guia', 'no_leida'].includes(x.motivo ?? '')) continue
          if (x.fecha && Date.parse(x.fecha) < Date.now() - 7 * 864e5) continue   // ya vencida en el portal
          ids.add(String(x.orden))
        }
        // Traídas a medias (pago sin guía o guía sin pago) de esta cuenta en la ventana: la otra mitad puede llegar.
        const { rows: medias } = await a.db.query(
          `SELECT p.venta FROM me_pagos p
           WHERE p.creado_at > NOW() - INTERVAL '7 days' AND (p.guia_path IS NULL OR p.comprobante_path IS NULL)
             AND p.cuenta = (SELECT cuenta FROM me_latidos WHERE perfil = $1)
           LIMIT 300`, [a.perfil])
        for (const m of medias) if (/^\d{10,}$/.test(m.venta)) ids.add(m.venta)
        if (ids.size <= MAX_REVISAR) { corte = new Date(u.corte).toISOString(); revisar = [...ids] }
      }
    }
    return NextResponse.json({ pedido: p ? Number(p.id) : null, pesos, corte, revisar })
  } catch (err) {
    return apiError(err)
  }
}
