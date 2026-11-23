// Medición Mensajes v2 (21-11, el dueño: «haslo y mide»). Muestra AL AZAR de todos los mensajes procesados desde el 11-11
// (así el % es el real, no solo de los frenados) y los pasa por evaluarMensajeV2 (lib/mensajesIAPrueba.ts): preguntas
// previas, ejemplos por paso (de la IA solo los que salieron bien), verificador, corrector y pedido especial sin repetir.
// NO manda nada ni toca ml_mensajes_ia; el gasto queda como prueba interna («Medición Mensajes v2»), sin créditos.
// Bundle y corrida: igual que scripts/medir-verificador-mensajes.ts →  node /tmp/medir2.js [n] > salida.jsonl
import { conEmpresa } from '@/lib/db'
import { evaluarMensajeV2 } from '@/lib/mensajesIAPrueba'
import { comoPruebaInterna, costoDe } from '@/lib/ia'
import { leerMiIA, MI_IA_KEY } from '@/lib/miIA'
import { textoPlano } from '@/lib/mensajesML'
import { readFileSync } from 'fs'
import type { Pool } from 'pg'

const EMPRESA = 1, PAIS = 'VE' as const
const N = Number(process.argv[2] ?? 400)
const PARALELO = 4
// 21-11 (segunda corrida): IDS=archivo.jsonl repite los mismos casos de una corrida anterior; MIIA_POSTVENTA='{...}'
// mezcla esos campos en «Después de la compra» de Mi IA SOLO dentro de la prueba (no se guarda en la base).
const IDS = process.env.IDS ? readFileSync(process.env.IDS, 'utf-8').split(/\r?\n/).filter(Boolean).map(l => String(JSON.parse(l).id)) : null
const POSTVENTA = process.env.MIIA_POSTVENTA ? JSON.parse(process.env.MIIA_POSTVENTA) : null
function conMiIA<T extends Pick<Pool, 'query'>>(db: T): T {
  if (!POSTVENTA) return db
  const query = (async (...args: Parameters<Pool['query']>) => {
    const r = await (db.query as (...a: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>)(...args)
    for (const row of r.rows ?? []) {
      if (row.key === MI_IA_KEY && typeof row.value === 'string') {
        const v = JSON.parse(row.value); v.postventa = { ...v.postventa, ...POSTVENTA }; row.value = JSON.stringify(v)
      } else if ('value' in row && typeof row.value === 'string' && args[1] && JSON.stringify(args[1]).includes(MI_IA_KEY) && !('key' in row)) {
        const v = JSON.parse(row.value); if (v?.version === 1) { v.postventa = { ...v.postventa, ...POSTVENTA }; row.value = JSON.stringify(v) }
      }
    }
    return r
  }) as unknown as T['query']
  return new Proxy(db, { get: (t, k) => k === 'query' ? query : Reflect.get(t, k) })
}

async function main() {
  const casos = await conEmpresa(EMPRESA, PAIS, async db => (await db.query(
    `SELECT i.id::text, i.pack_id::text AS pack, i.conexion_id, i.mensaje_at, i.respuesta AS antes, i.decision AS decision_antes,
            i.motivos AS motivos_antes, x.ml_user_id
     FROM ml_mensajes_ia i JOIN ml_conexiones x ON x.id = i.conexion_id
     WHERE i.mensaje_at >= '2026-11-11' AND i.estado = 'listo' AND ($2::text[] IS NULL OR i.id::text = ANY($2))
     ORDER BY random() LIMIT $1`, [IDS ? IDS.length : N, IDS])).rows)
  const miIA = await conEmpresa(EMPRESA, PAIS, async db => {
    const { rows: [mi] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [MI_IA_KEY])
    return leerMiIA(mi?.value)
  })
  console.error(`casos: ${casos.length}`)
  let i = 0, hechos = 0
  const uno = async (c: typeof casos[number]) => {
    const hasta = new Date(c.mensaje_at).toISOString()
    try {
      const r = await conEmpresa(EMPRESA, PAIS, async db0 => {
        const db = conMiIA(db0)
        const { rows: msgs } = await db.query(
          `SELECT propio, texto FROM ml_mensajes WHERE pack_id = $1 AND fecha <= $2::timestamptz + interval '1 second' ORDER BY fecha DESC LIMIT 10`, [c.pack, hasta])
        const corte = msgs.findIndex(m => m.propio)
        const comprador = (corte < 0 ? msgs : msgs.slice(0, corte)).reverse().map(m => String(m.texto)).join('\n').slice(0, 1000)
        const vendedor = msgs.filter(m => m.propio).map(m => String(m.texto)).join('\n')
        const { rows: eq } = await db.query(
          `SELECT texto FROM ml_mensajes WHERE pack_id = $1 AND propio AND fecha > $2::timestamptz ORDER BY fecha LIMIT 2`, [c.pack, hasta])
        const e = await evaluarMensajeV2(db, { conexionId: c.conexion_id, seller: Number(c.ml_user_id), pack: c.pack, country: PAIS,
          conInventario: true, comprador, persona: miIA?.persona ?? [], vendedor, hasta, historico: true, mensajeAt: hasta, tono: miIA?.tono })
        const decision = !e.b.respuesta && e.b.confianza === 'alta' && !e.motivos.length ? 'nada' : e.motivos.length ? 'revisar' : 'sola'
        return {
          id: c.id, pack: c.pack, fecha: hasta, comprador: textoPlano(comprador).slice(0, 400),
          decision_antes: c.decision_antes, motivos_antes: c.motivos_antes, antes: c.antes,
          decision, motivos: e.motivos, ahora: e.b.respuesta, conf: e.b.confianza, verif: e.verificacion,
          corregida: e.corregida, acuse: e.acuse, nota: e.nota ?? null, nota_pago: e.notaPago ?? null, pendiente: e.b.pendiente, original: e.original, pedido_repetido: e.pedidoRepetido, ejemplos: e.b.ejemplos,
          previas: /PREGUNTAS QUE ESTE COMPRADOR HIZO ANTES/.test(e.b.contexto),
          equipo: eq.map(x => textoPlano(String(x.texto))).join(' / ').slice(0, 400),
          llamadas: e.llamadas.length, costo: e.llamadas.reduce((s, l) => s + costoDe(l.modelo, l.uso), 0),
        }
      })
      process.stdout.write(JSON.stringify(r) + '\n')
    } catch (e) {
      process.stdout.write(JSON.stringify({ id: c.id, pack: c.pack, error: String(e).slice(0, 200) }) + '\n')
    }
    if (++hechos % 25 === 0) console.error(`${hechos}/${casos.length}`)
  }
  await comoPruebaInterna(async () => {
    await Promise.all(Array.from({ length: PARALELO }, async () => { while (i < casos.length) await uno(casos[i++]) }))
  }, 'Medición Mensajes v2')
  await new Promise(r => setTimeout(r, 3000))   // deja terminar los registros de gasto
  console.error('listo')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
