// Reportador por API: le escribe a cada comprador su guía desde el SERVIDOR, sin el
// programa de escritorio. Usa la MISMA cola (despacho_etiquetas), las MISMAS plantillas
// (Reportador → configuración) y registra el resultado igual que el programa, así los dos
// pueden convivir sin escribirle dos veces a nadie:
//   - la reserva (reporte_tomado_at) aparta los envíos mientras se procesan;
//   - antes de enviar se lee la conversación: si ya hay un mensaje nuestro con esa guía,
//     se marca ENVIADO sin repetir;
//   - si la venta es de una cuenta que NO está conectada a la API, se deja en la cola
//     (sin marcar) para el programa de escritorio.
// En STAGING siempre simula: los despachos son una copia de producción y los compradores
// son reales (repetirles la guía sería un error visible).
import type { Pool } from 'pg'
import { mlFetch, ErrorML, CuentaDesconectada } from '@/lib/ml'
import { buscarOrden, mensajesDeOrden, type MensajeML } from '@/lib/ventasML'
import { cuentaDe, leerConfig, paraTealca, problemasConfig, rellenar, RESERVA_HORAS, SQL_PENDIENTE, SQL_REPORTABLE } from '@/lib/reportador'
import { remitenteConfigurado } from '@/lib/despachos'
import { ES_STAGING } from '@/lib/entorno'
import { esDemo } from '@/lib/demo'

// MercadoLibre manda solo, A NOMBRE DEL VENDEDOR, "Gracias por tu compra. El número de guía
// para tu envío es: …" cuando el comprador llena el formulario. Tiene la misma guía pero NO es
// nuestro reporte: si se contara, nunca se le escribiría a nadie.
const AVISO_AUTOMATICO_ML = /n[uú]mero de gu[ií]a para tu env[ií]o es/i
function esReporteNuestro(m: MensajeML, guia: string) {
  return m.propio && m.texto.includes(guia) && !AVISO_AUTOMATICO_ML.test(m.texto)
}

export type ResultadoApi = 'ENVIADO' | 'YA_ENVIADO' | 'SIN_CHAT' | 'RECHAZADO' | 'ERROR' | 'SIN_CONEXION' | 'SIMULADO'

export interface EnvioProcesado {
  venta: string; guia: string; carrier: string; cuenta: string | null
  resultado: ResultadoApi; detalle: string | null; mensaje: string | null
}

export const SIMULA_SIEMPRE = ES_STAGING

const pausa = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Pendientes de reportar por cuenta de despacho + cuántos están reservados por un equipo. */
export async function pendientesApi(db: Pool) {
  const config = await leerConfig(db)
  const remitenteDefault = await remitenteConfigurado(db)
  const { rows } = await db.query(
    `SELECT e.remitente, (e.reporte_tomado_por IS NOT NULL
                          AND e.reporte_tomado_at > NOW() - make_interval(hours => $1)) AS en_equipo
     FROM despacho_etiquetas e
     JOIN despacho_lotes l ON l.id = e.lote_id
     JOIN despacho_jornadas j ON j.id = l.jornada_id
     WHERE ${SQL_REPORTABLE} AND ${SQL_PENDIENTE}`, [RESERVA_HORAS])
  const porCuenta: Record<string, number> = Object.fromEntries(config.cuentas.map(c => [c.nombre, 0]))
  let enEquipo = 0
  for (const r of rows) {
    if (r.en_equipo) { enEquipo++; continue }
    const c = cuentaDe(r.remitente, config.cuentas, remitenteDefault)
    porCuenta[c?.nombre ?? 'Sin cuenta'] = (porCuenta[c?.nombre ?? 'Sin cuenta'] ?? 0) + 1
  }
  return { porCuenta, enEquipo, total: rows.length - enEquipo, problemas: problemasConfig(config) }
}

/**
 * Procesa un lote chico (para que cada llamada dure poco; la pantalla repite hasta vaciar).
 * `simular`: arma y revisa todo pero no envía ni cambia la cola.
 */
export async function reportarLote(db: Pool, opciones: { simular: boolean; limite: number; excluir?: string[] }) {
  const simular = opciones.simular || SIMULA_SIEMPRE
  const config = await leerConfig(db)
  const problemas = problemasConfig(config)
  if (problemas.length) throw new Error(`Configuración del Reportador incompleta: ${problemas.join(' · ')}`)
  const remitenteDefault = await remitenteConfigurado(db)
  // En demostración ni la vista previa consulta MercadoLibre (las ventas sembradas no existen allá).
  const demo = await esDemo(db)

  const baseSql = `
    SELECT e.id, e.venta, COALESCE(e.guia_final, e.guia) AS guia, e.carrier, e.remitente
    FROM despacho_etiquetas e
    JOIN despacho_lotes l ON l.id = e.lote_id
    JOIN despacho_jornadas j ON j.id = l.jornada_id
    WHERE ${SQL_REPORTABLE} AND ${SQL_PENDIENTE}
      AND e.venta IS NOT NULL AND NOT (e.venta = ANY($3::text[]))
      AND (e.reporte_tomado_at IS NULL OR e.reporte_tomado_at < NOW() - make_interval(hours => $2))
    ORDER BY j.closed_at, l.generated_at, e.original_name
    LIMIT $1`
  const excluir = opciones.excluir ?? []
  // Reserva (sin equipo): el programa de escritorio no los toma mientras tanto.
  const { rows } = simular
    ? await db.query(baseSql, [opciones.limite, RESERVA_HORAS, excluir])
    : await db.query(
        `UPDATE despacho_etiquetas t SET reporte_tomado_por = NULL, reporte_tomado_at = NOW()
         FROM (${baseSql} FOR UPDATE OF e SKIP LOCKED) s
         WHERE t.id = s.id
         RETURNING t.id, s.venta, s.guia, s.carrier, s.remitente`,
        [opciones.limite, RESERVA_HORAS, excluir])

  const procesados: EnvioProcesado[] = []
  for (const e of rows) {
    const cuenta = cuentaDe(e.remitente, config.cuentas, remitenteDefault)
    const base = { venta: String(e.venta), guia: String(e.guia), carrier: String(e.carrier), cuenta: cuenta?.nombre ?? null }
    const cerrar = async (estado: 'ENVIADO' | 'SIN_CHAT' | 'RECHAZADO' | 'ERROR', detalle: string | null, texto: string | null = null) => {
      if (simular) return
      const final = estado === 'ENVIADO' || estado === 'SIN_CHAT'
      await db.query(
        `UPDATE despacho_etiquetas
         SET reporte_estado = $2, reporte_detalle = $3, reporte_intentos = reporte_intentos + 1,
             reporte_mensaje = COALESCE($5, reporte_mensaje),
             reportado_at = CASE WHEN $4 THEN NOW() ELSE reportado_at END,
             reporte_tomado_por = NULL, reporte_tomado_at = NULL
         WHERE id = $1 AND (reporte_estado IS NULL OR reporte_estado IN ('RECHAZADO', 'ERROR'))`,
        [e.id, estado, detalle ? `API: ${detalle}`.slice(0, 500) : 'API', final, texto])
    }
    const soltar = async () => {
      if (!simular) await db.query(`UPDATE despacho_etiquetas SET reporte_tomado_at = NULL WHERE id = $1`, [e.id])
    }

    if (!cuenta) {
      await soltar()
      procesados.push({ ...base, resultado: 'ERROR', detalle: 'El remitente no coincide con ninguna cuenta del Reportador', mensaje: null })
      continue
    }
    // Modo demostración (lib/demo.ts): queda como enviado, sin escribirle a nadie en MercadoLibre.
    if (demo) {
      let mensaje = rellenar(config.plantillas[Math.floor(Math.random() * config.plantillas.length)], config.bloque, cuenta.pagina, base.guia)
      if (base.carrier === 'TEALCA') mensaje = paraTealca(mensaje)
      await cerrar('ENVIADO', 'demostración: no se envió a MercadoLibre', mensaje)
      procesados.push({ ...base, resultado: simular ? 'SIMULADO' : 'ENVIADO', detalle: `Desde ${cuenta.nombre}`, mensaje })
      await pausa(600)
      continue
    }
    try {
      const orden = await buscarOrden(db, base.venta)
      if (!orden) {
        await soltar()      // queda para el programa de escritorio
        procesados.push({ ...base, resultado: 'SIN_CONEXION', detalle: 'La cuenta de esta venta no está conectada a la API', mensaje: null })
        continue
      }
      let mensaje = rellenar(config.plantillas[Math.floor(Math.random() * config.plantillas.length)], config.bloque, cuenta.pagina, base.guia)
      if (base.carrier === 'TEALCA') mensaje = paraTealca(mensaje)

      const antes = await mensajesDeOrden(db, orden.conexionId, orden.orden)
      const previo = antes.find(m => esReporteNuestro(m, base.guia))
      if (previo) {
        await cerrar('ENVIADO', 'ya tenía la guía en la conversación', previo.texto)
        procesados.push({ ...base, resultado: 'YA_ENVIADO', detalle: 'El comprador ya tenía esta guía en la conversación', mensaje: null })
        continue
      }
      if (simular) {
        procesados.push({ ...base, resultado: 'SIMULADO', detalle: `Se enviaría desde ${orden.cuenta}`, mensaje })
        continue
      }

      const o = orden.orden
      await mlFetch(db, orden.conexionId, `/messages/packs/${o.pack_id ?? o.id}/sellers/${o.seller.id}?tag=post_sale`, {
        method: 'POST', body: { from: { user_id: o.seller.id }, to: { user_id: o.buyer.id }, text: mensaje },
      })
      // Relectura: la moderación de ML dice si el comprador lo recibe.
      const despues = await mensajesDeOrden(db, orden.conexionId, o).catch(() => [])
      const nuestro = despues.filter(m => esReporteNuestro(m, base.guia)).pop()
      const mod = nuestro?.moderacion ?? null
      if (mod && !['clean', 'non_moderated'].includes(mod)) {
        await cerrar('RECHAZADO', `moderación ${mod}`, mensaje)
        procesados.push({ ...base, resultado: 'RECHAZADO', detalle: `MercadoLibre lo moderó (${mod})`, mensaje })
      } else {
        await cerrar('ENVIADO', mod ? `moderación ${mod}` : null, mensaje)
        procesados.push({ ...base, resultado: 'ENVIADO', detalle: `Desde ${orden.cuenta}`, mensaje })
      }
      await pausa(1200)
    } catch (err) {
      if (err instanceof CuentaDesconectada) {
        await soltar()
        procesados.push({ ...base, resultado: 'SIN_CONEXION', detalle: err.message, mensaje: null })
      } else if (err instanceof ErrorML && err.status === 403) {
        await cerrar('SIN_CHAT', err.message)
        procesados.push({ ...base, resultado: 'SIN_CHAT', detalle: err.message, mensaje: null })
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        await cerrar('ERROR', msg)
        procesados.push({ ...base, resultado: 'ERROR', detalle: msg, mensaje: null })
      }
    }
  }
  return { procesados, simulado: simular }
}
