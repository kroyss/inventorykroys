import { DIAS_INACTIVA, MINUTOS_INACTIVA, SQL_CUENTA_SINCRONIZA } from '@/lib/cuenta'
import { after, NextRequest, NextResponse } from 'next/server'
import { conEmpresa, dbGlobal } from '@/lib/db'
import { revisarStockPendiente } from '@/lib/alertasStock'
import { limpiarDespachos } from '@/lib/limpiezaDespachos'
import { sincronizarEmpresa } from '@/lib/preguntas'
import { calificarAutomatico } from '@/lib/calificacionesAuto'
import { recordarPagos } from '@/lib/recordatoriosPago'
import { responderAutomaticas } from '@/lib/automaticasPreguntas'
import { actualizarCatalogo, importarHistorial } from '@/lib/catalogoML'
import { generarFichasPendientes } from '@/lib/fichasIA'
import { iaConfigurada } from '@/lib/ia'
import { mlConfigurado } from '@/lib/ml'
import { esDemoEmpresa } from '@/lib/demo'
import { enviarAvisosTelegram } from '@/lib/avisosTelegram'
import { corteFundadores } from '@/lib/fundadoresCorte'
import { vigilarCampanas } from '@/lib/promocionesML'
import type { Country } from '@/lib/types'

// Cron de preguntas (crontab del VPS, cada minuto, con CRON_SECRET):
//   curl -fsS "https://<dominio>/api/cron/preguntas?key=EL_SECRETO"
// Recorre las empresas con el módulo `preguntas` y trae lo nuevo de sus cuentas ML.
// Solo LEE de MercadoLibre (no publica nada). Cada empresa en su propia conexión (RLS).
function autorizado(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const url = new URL(req.url)
  return url.searchParams.get('key') === secret || req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!mlConfigurado()) return NextResponse.json({ omitido: 'ML sin configurar' })

  const { rows: todas } = await dbGlobal().query(
    // Solo cuentas al día o vencidas hace poco (lib/cuenta.ts): de quien no volvió no se trae nada.
    // Inactiva: ningún usuario suyo usó el sistema en DIAS_INACTIVA días (la plataforma nunca).
    `SELECT e.id, e.country, 'alertas_stock' = ANY(e.modulos) AS stock, 'inventario' = ANY(e.modulos) AS inventario, 'pagos_me' = ANY(e.modulos) AS pagos_me,
            'promociones' = ANY(e.modulos) AS promociones,
            o.estado <> 'propietario' AND COALESCE((
              SELECT MAX(GREATEST(u.ultima_actividad, u.last_login)) FROM usuario_empresas ue JOIN users u ON u.id = ue.user_id
              WHERE ue.empresa_id = e.id) < NOW() - INTERVAL '${DIAS_INACTIVA} days', TRUE) AS inactiva
     FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id
     WHERE e.is_active AND 'preguntas' = ANY(e.modulos) AND ${SQL_CUENTA_SINCRONIZA} ORDER BY e.id`)
  const resultado: Record<number, unknown> = {}
  const sincronizadas: typeof todas = []
  // Cada empresa con conEmpresa (se devuelve la conexión al terminar con ESA empresa), NUNCA dbEmpresa:
  // dbEmpresa la retiene hasta el final del request y con más empresas que conexiones del pool (10)
  // el cron se quedaba esperando una que nunca llegaba y bloqueaba la app entera (13-10, 18 empresas).
  for (const e of todas) {
    try {
      // Inactiva: solo si su última sincronización tiene más de MINUTOS_INACTIVA minutos.
      if (e.inactiva) {
        const { rows: [u] } = await conEmpresa(e.id, e.country as Country, db => db.query(
          `SELECT MAX(ultima_sync) > NOW() - INTERVAL '${MINUTOS_INACTIVA} minutes' AS reciente FROM ml_conexiones WHERE estado = 'activa'`))
        if (u?.reciente) { resultado[e.id] = { omitida: 'inactiva' }; continue }
      }
      // Demostración: datos sembrados, nada que traer ni revisar (lib/demo.ts).
      if (await esDemoEmpresa(e.id, e.country as Country)) { resultado[e.id] = { omitida: 'demo' }; continue }
      sincronizadas.push(e)
      resultado[e.id] = await conEmpresa(e.id, e.country as Country, db => sincronizarEmpresa(db))
    } catch (err) {
      resultado[e.id] = { error: err instanceof Error ? err.message : String(err) }
    }
  }
  // Alertas de stock: una cuenta por empresa y por pasada, si pasó la hora (lib/alertasStock.ts).
  // En segundo plano (después de responder) para no atrasar preguntas y mensajes.
  after(async () => {
    // Avisos por Telegram (lib/avisosTelegram.ts): lo primero, con lo recién sincronizado y sin esperar
    // al resto (stock, calificaciones, contexto de la IA).
    try {
      const r = await enviarAvisosTelegram()
      if (r) console.log('[avisos telegram]', r)
    } catch (err) {
      console.error('[avisos telegram]', err instanceof Error ? err.message : err)
    }
    // Corte de Fundadores sin MercadoLibre conectado (lib/fundadoresCorte.ts): una sola vez, el lunes 19/10.
    try {
      const r = await corteFundadores()
      if (r) console.log('[corte fundadores]', r)
    } catch (err) {
      console.error('[corte fundadores]', err instanceof Error ? err.message : err)
    }
    for (const e of sincronizadas.filter(x => x.stock)) {
      try {
        await conEmpresa(e.id, e.country as Country, db => revisarStockPendiente(db))
      } catch (err) {
        console.error('[alertas stock]', e.id, err instanceof Error ? err.message : err)
      }
    }
    // Respuestas automáticas (lib/automaticasPreguntas.ts): solo las respuestas rápidas que el
    // vendedor activó como automáticas; lo primero, para responder en menos de un minuto.
    for (const e of sincronizadas) {
      try {
        const r = await conEmpresa(e.id, e.country as Country, db => responderAutomaticas(db))
        if (r) console.log('[respuestas automaticas]', e.id, r)
      } catch (err) {
        console.error('[respuestas automaticas]', e.id, err instanceof Error ? err.message : err)
      }
    }
    // Calificación automática de las concretadas (lib/calificacionesAuto.ts): solo empresas que la
    // prendieron, una vez al día desde las 10:00 de su país. Antes del contexto de la IA (que tarda).
    for (const e of sincronizadas) {
      try {
        const r = await conEmpresa(e.id, e.country as Country, db => calificarAutomatico(db, e.inventario))
        if (r) console.log('[calificacion automatica]', e.id, r)
      } catch (err) {
        console.error('[calificacion automatica]', e.id, err instanceof Error ? err.message : err)
      }
    }
    // Promociones (migración 097): campañas nuevas de ML cada 6 h, solo empresas con Inventario + Promociones
    // (VE). De ahí sale el aviso por Telegram de campaña nueva o por cerrar.
    for (const e of sincronizadas.filter(x => x.promociones && x.inventario && x.country === 'VE')) {
      try {
        const r = await conEmpresa(e.id, e.country as Country, db => vigilarCampanas(db))
        if (r?.nuevas) console.log('[promociones]', e.id, r)
      } catch (err) {
        console.error('[promociones]', e.id, err instanceof Error ? err.message : err)
      }
    }
    // Recordatorios de pago (lib/recordatoriosPago.ts): solo empresas con Pagos ME que los prendieron;
    // cada turno pide "Traer ME", espera que termine y recién ahí manda.
    for (const e of sincronizadas.filter(x => x.pagos_me && x.country === 'VE')) {
      try {
        const r = await conEmpresa(e.id, e.country as Country, db => recordarPagos(db))
        if (r) console.log('[recordatorios pago]', e.id, r)
      } catch (err) {
        console.error('[recordatorios pago]', e.id, err instanceof Error ? err.message : err)
      }
    }
    // Contexto de la IA (lib/catalogoML.ts, lib/fichasIA.ts): catálogo cada 6 h por cuenta, el
    // historial completo de a pocas publicaciones y las fichas de conocimiento de a 2 por pasada.
    for (const e of sincronizadas) {
      try {
        await conEmpresa(e.id, e.country as Country, async db => {
          const { rows: cuentas } = await db.query(`SELECT id FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
          for (const c of cuentas) await actualizarCatalogo(db, c.id)
          await importarHistorial(db)
          if (iaConfigurada()) await generarFichasPendientes(db)
        })
      } catch (err) {
        console.error('[contexto IA]', e.id, err instanceof Error ? err.message : err)
      }
    }
    // Limpieza de PDF viejos de Despachos: una vez al día (la primera pasada que lo logra marcar).
    const { rowCount } = await dbGlobal().query(
      `INSERT INTO plataforma_ajustes (key, value) VALUES ('limpieza_despachos_at', NOW()::text)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
       WHERE plataforma_ajustes.value::timestamptz < NOW() - INTERVAL '1 day'`)
    if (rowCount) {
      const { rows: conDespachos } = await dbGlobal().query(
        `SELECT id, country FROM empresas WHERE 'despachos' = ANY(modulos) ORDER BY id`)
      for (const e of conDespachos) {
        try {
          const r = await conEmpresa(e.id, e.country as Country, db => limpiarDespachos(db))
          if (r.archivos) console.log('[limpieza despachos]', e.id, r)
        } catch (err) {
          console.error('[limpieza despachos]', e.id, err instanceof Error ? err.message : err)
        }
      }
    }
  })
  return NextResponse.json({ ok: true, resultado })
}
