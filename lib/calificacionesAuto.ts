// Calificar una venta en ML (lo usan el botón "Calificar N" y la corrida automática) y la
// CALIFICACIÓN AUTOMÁTICA de las concretadas (decisión del dueño, 2026-10-11):
//   - switch por empresa (plantillas.auto), APAGADO por defecto, a riesgo de quien lo prende;
//   - una vez al día, desde HORA_AUTO (hora del país de la empresa), califica en lote las que el
//     sistema sugiere "concretada" (en el sistema / despachada) y ya pasaron los días de espera;
//   - las NO concretadas nunca se califican solas (ventas personales, cobro a destino… que no
//     pasan por el sistema): siguen esperando revisión a mano.
import type { Pool } from 'pg'
import { mlFetch, ErrorML } from '@/lib/ml'
import { esDemo } from '@/lib/demo'
import { leerPlantillasCal, sqlBandeja, sqlLista, type PlantillasCalificacion } from '@/lib/calificacionesML'
import { registrarUso } from '@/lib/usoAcciones'

export interface ResultadoCal { id: string; ok: boolean; detalle?: string; quitada?: boolean }

/** Califica UNA venta con los textos de la empresa y relee para confirmar. */
export async function calificarUna(db: Pool, id: string, tipo: 'concretada' | 'no_concretada',
  p: PlantillasCalificacion, demo: boolean): Promise<ResultadoCal> {
  const { rows: [fila] } = await db.query(
    `SELECT conexion_id, cal_vendedor, fecha::date > CURRENT_DATE - $2::int AS en_espera FROM ml_ordenes WHERE id = $1`,
    [id, p.esperaDias])
  if (!fila) return { id, ok: false, detalle: 'Venta no encontrada' }
  if (fila.en_espera) return { id, ok: false, detalle: `Todavía en los ${p.esperaDias} días de espera` }
  if (fila.cal_vendedor) return { id, ok: true, detalle: 'Ya estaba calificada' }
  const cuerpo = tipo === 'concretada'
    ? { fulfilled: true, rating: p.concretada.rating, message: p.concretada.mensaje }
    : { fulfilled: false, rating: p.noConcretada.rating, reason: p.noConcretada.motivo, message: p.noConcretada.mensaje }
  if (demo) {
    await db.query(`UPDATE ml_ordenes SET cal_vendedor = $2, cal_concretada = $3, actualizada_at = NOW() WHERE id = $1`,
      [id, cuerpo.rating, cuerpo.fulfilled])
    return { id, ok: true }
  }
  try {
    await mlFetch(db, fila.conexion_id, `/orders/${id}/feedback`, { method: 'POST', body: cuerpo })
    const v = await mlFetch<{ sale: { rating?: string; fulfilled?: boolean } | null }>(
      db, fila.conexion_id, `/orders/${id}/feedback`).catch(() => ({ sale: null }))
    await db.query(
      `UPDATE ml_ordenes SET cal_vendedor = $2, cal_concretada = $3, actualizada_at = NOW() WHERE id = $1`,
      [id, v.sale?.rating ?? cuerpo.rating, v.sale?.fulfilled ?? cuerpo.fulfilled])
    return { id, ok: !!v.sale, detalle: v.sale ? undefined : 'ML no la mostró al releer' }
  } catch (e) {
    const msg = e instanceof ErrorML ? e.message : e instanceof Error ? e.message : String(e)
    // Si ML dice que ya existe, se registra como calificada para que salga de la lista.
    if (e instanceof ErrorML && /already|exist/i.test(JSON.stringify(e.datos ?? ''))) {
      await db.query(`UPDATE ml_ordenes SET cal_vendedor = COALESCE(cal_vendedor, 'ya_calificada') WHERE id = $1`, [id])
      return { id, ok: false, detalle: msg }
    }
    // ML ya no deja calificar una orden vieja (20-10, BUYBOOK_SHOP con ventas de julio): "You can't submit a not
    // fulfilled feedback after order has expired". Nunca se va a poder: sale de la lista para no confundir.
    if (e instanceof ErrorML && e.status >= 400 && e.status < 500 && /expired/i.test(`${msg} ${JSON.stringify(e.datos ?? '')}`)) {
      await db.query(`UPDATE ml_ordenes SET cal_vendedor = 'cerrada_ml' WHERE id = $1 AND cal_vendedor IS NULL`, [id])
      return { id, ok: false, quitada: true, detalle: 'MercadoLibre ya no deja calificarla: pasó su plazo' }
    }
    // ML cierra la calificación del vendedor cuando el comprador ya calificó y pasó el plazo
    // (visto con SHOPIT_VE: compradores arrepentidos que calificaron el mismo día). Se confirma
    // releyendo: si el comprador calificó y ML rechazó (4xx, no sesión ni límite), sale de la lista.
    if (e instanceof ErrorML && e.status >= 400 && e.status < 500 && ![401, 429].includes(e.status)) {
      const v = await mlFetch<{ sale: unknown; purchase: { date_created?: string } | null }>(
        db, fila.conexion_id, `/orders/${id}/feedback`).catch(() => null)
      if (v?.purchase && !v.sale) {
        await db.query(`UPDATE ml_ordenes SET cal_vendedor = 'cerrada_ml' WHERE id = $1 AND cal_vendedor IS NULL`, [id])
        const f = v.purchase.date_created
        return { id, ok: false, quitada: true, detalle: `el comprador calificó${f ? ` el ${f.slice(8, 10)}/${f.slice(5, 7)}` : ''} y pasó el plazo` }
      }
    }
    return { id, ok: false, detalle: msg }
  }
}

/** Hora (del país de la empresa) por defecto de la calificación automática; cada empresa elige la suya (plantillas.hora). */
export const HORA_AUTO = 10
const MAX_POR_DIA = 300
/** Minutos sin avanzar para dar por muerta una tanda "corriendo" (guarda avance cada 10 ventas, ~10 s). */
const MIN_SIN_AVANCE = 10
export const CLAVE_ULTIMO = 'calificaciones_auto_ultimo'

/** Si la empresa lo tiene prendido y hoy no corrió: califica las concretadas. Lo llama el cron. */
export async function calificarAutomatico(db: Pool, conInventario: boolean) {
  const { rows: [pl] } = await db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_plantillas'`)
  const p = leerPlantillasCal(pl?.value)
  if (!p.auto) return null
  // Una vez al día, desde la hora elegida en Configuración (p.hora; antes fija HORA_AUTO): se "toma" el
  // día antes de calificar (dos pasadas del cron no lo repiten). Si se elige una hora que ya pasó y hoy
  // no corrió, corre en la próxima pasada. La conexión tiene el TimeZone de la empresa (hora del país).
  // Latido (22-10): la tanda guarda su avance (cuenta + updated_at) mientras califica. Si quedó "corriendo"
  // y lleva MIN_SIN_AVANCE sin avanzar, murió (p. ej. un reinicio por actualización a las 10:00: el 20 y
  // 21-10 no calificó nada) y la próxima pasada la retoma, sumando a lo ya contado. Repetirla es seguro:
  // las ya calificadas se saltan.
  const { rows: [tomada] } = await db.query(
    `INSERT INTO app_settings (key, value) SELECT $1, json_build_object('fecha', CURRENT_DATE::text, 'estado', 'corriendo')::text
     WHERE EXTRACT(HOUR FROM LOCALTIME) >= $2
     ON CONFLICT (empresa_id, key) DO UPDATE SET value = CASE
         WHEN (app_settings.value::json->>'fecha') IS DISTINCT FROM CURRENT_DATE::text THEN EXCLUDED.value
         ELSE app_settings.value END, updated_at = NOW()
     WHERE (app_settings.value::json->>'fecha') IS DISTINCT FROM CURRENT_DATE::text
        OR ((app_settings.value::json->>'estado') = 'corriendo' AND app_settings.updated_at < NOW() - make_interval(mins => $3))
     RETURNING value`, [CLAVE_ULTIMO, p.hora, MIN_SIN_AVANCE])
  if (!tomada) return null
  const previo = (() => { try { return JSON.parse(tomada.value) } catch { return {} } })()
  let calificadas = Number(previo.calificadas) || 0, errores = Number(previo.errores) || 0, quitadas = Number(previo.quitadas) || 0
  let sinRegistrar = 0
  const guardar = async (estado: 'corriendo' | 'listo') => {
    await registrarUso(db, 'calificacion', sinRegistrar)
    sinRegistrar = 0
    await db.query(
      `UPDATE app_settings SET value = json_build_object('fecha', CURRENT_DATE::text, 'estado', $2::text, 'at', $3::text,
         'calificadas', $4::int, 'errores', $5::int, 'quitadas', $6::int)::text, updated_at = NOW() WHERE key = $1`,
      [CLAVE_ULTIMO, estado, new Date().toISOString(), calificadas, errores, quitadas])
  }
  const { rows } = await db.query(
    `SELECT b.id FROM (${sqlBandeja(!conInventario)}) b
     WHERE b.sugerencia = 'concretada' AND ${sqlLista(p.esperaDias)}
     ORDER BY b.fecha LIMIT ${MAX_POR_DIA}`, [p.noConcretada.dias])
  const demo = await esDemo(db)
  for (const [i, { id }] of rows.entries()) {
    const r = await calificarUna(db, id, 'concretada', p, demo)
    if (r.ok && r.detalle !== 'Ya estaba calificada') { calificadas++; sinRegistrar++ }
    else if (r.quitada) quitadas++
    else if (!r.ok) errores++
    if ((i + 1) % 10 === 0) await guardar('corriendo')
  }
  await guardar('listo')
  return { calificadas, errores, quitadas }
}
