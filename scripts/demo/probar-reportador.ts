// Prueba del Reportador (cuenta por venta, {transportista}) contra una base (staging), en UNA
// transacción que se deshace. NO llama a MercadoLibre (los tokens de staging son copia de producción).
//   DATABASE_URL=… npx tsx scripts/demo/probar-reportador.ts
import { Client } from 'pg'
import type { Pool } from 'pg'
import { restaurarDemo, SECCIONES_DEMO } from '@/lib/demoDatos'
import { pendientesApi, reportarLote } from '@/lib/reportadorApi'
import { leerConfig, cuentaPorVenta, SQL_CUENTA_VENTA, SQL_PENDIENTE, SQL_REPORTABLE } from '@/lib/reportador'

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  const db = {
    query: (sql: string, params?: unknown[]) =>
      /^(BEGIN|COMMIT)$/i.test(sql.trim()) ? Promise.resolve({ rows: [], rowCount: 0 }) : c.query(sql, params),
  } as unknown as Pool
  const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FALLÓ: ' + msg); console.log('  ✓', msg) }
  await c.query('BEGIN')
  try {
    // 1) Empresa 1 (configuración vieja con cuentas por remitente): todo igual que antes.
    await c.query(`SELECT set_config('app.empresa_id', '1', true), set_config('TimeZone', 'America/Caracas', true)`)
    const cfg1 = await leerConfig(db)
    ok(!cuentaPorVenta(cfg1), `empresa 1 sigue por remitente (${cfg1.cuentas.map(x => x.nombre).join(', ')})`)
    const p1 = await pendientesApi(db)
    console.log('    pendientes empresa 1:', p1.porCuenta, 'problemas:', p1.problemas)
    ok(p1.problemas.length === 0, 'empresa 1 sin problemas de configuración')

    // 2) Empresa demo nueva (sin cuentas: por venta)
    const { rows: [o] } = await c.query(`INSERT INTO organizaciones (nombre, estado) VALUES ('Prueba rep', 'activo') RETURNING id`)
    const { rows: [e] } = await c.query(
      `INSERT INTO empresas (organizacion_id, nombre, country, modulos) VALUES ($1, 'Prueba rep', 'VE', $2) RETURNING id`,
      [o.id, ['despachos', 'reportador', 'preguntas', 'alertas_stock']])
    await c.query(`SELECT set_config('app.empresa_id', $1, true)`, [String(e.id)])
    await restaurarDemo(db, SECCIONES_DEMO.map(x => x.id))
    const cfg = await leerConfig(db)
    ok(cuentaPorVenta(cfg), 'demo: cuentas por venta (sin cuentas escritas)')
    const p = await pendientesApi(db)
    console.log('    pendientes demo:', p.porCuenta)
    ok(p.total === 24 && !p.porCuenta['Sin cuenta'] && p.problemas.length === 0, 'demo: 24 pendientes, todos con su cuenta')
    // Lo que tomaría el programa de escritorio para cada cuenta (mismo filtro que /api/reportador/tomar)
    for (const n of Object.keys(p.porCuenta)) {
      const { rows: [t] } = await c.query(
        `SELECT COUNT(*)::int AS n FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id JOIN despacho_jornadas j ON j.id = l.jornada_id
         WHERE ${SQL_REPORTABLE} AND ${SQL_PENDIENTE} AND ${SQL_CUENTA_VENTA} = $1`, [n])
      ok(t.n === p.porCuenta[n], `programa de escritorio tomaría ${t.n} de ${n}`)
    }
    // Reporte por API (modo demo: no sale a ML)
    const r = await reportarLote(db, { simular: false, limite: 24 })
    const malos = r.procesados.filter(x => x.resultado !== 'ENVIADO' || !x.cuenta || !x.mensaje || x.mensaje.includes('{'))
    ok(r.procesados.length === 24 && malos.length === 0, '24 reportados, con cuenta y sin {comodines} sin reemplazar')
    const tealca = r.procesados.filter(x => x.carrier === 'TEALCA')
    ok(tealca.length > 0 && tealca.every(x => x.mensaje!.includes('TEALCA') && !/zoom/i.test(x.mensaje!)), `${tealca.length} TEALCA dicen TEALCA`)
    const zoom = r.procesados.filter(x => x.carrier === 'ZOOM')
    ok(zoom.every(x => x.mensaje!.includes('ZOOM') && !/tealca/i.test(x.mensaje!)), `${zoom.length} ZOOM dicen ZOOM`)
    ok(r.procesados.every(x => x.mensaje!.includes('https://www.mercadolibre.com.ve/pagina/tecnova_store')), 'el texto final lleva el link escrito tal cual')
    const { problemasConfig } = await import('@/lib/reportador')
    ok(problemasConfig({ cuentas: [], plantillas: ['Tu guía es {guia}'], bloque: '' }).some(x => x.includes('{transportista}')), 'sin transportista no se puede guardar')
    ok(problemasConfig(cfg1).length === 0, 'las plantillas de empresa 1 (con ZOOM) siguen válidas')
    console.log('    ej. ZOOM  :', zoom[0].cuenta, '→', zoom[0].mensaje)
    console.log('    ej. TEALCA:', tealca[0].cuenta, '→', tealca[0].mensaje)
  } finally {
    await c.query('ROLLBACK')
    await c.end()
    console.log('ROLLBACK: la base quedó como estaba')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
