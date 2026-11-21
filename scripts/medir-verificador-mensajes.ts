// Medición (21-11, el dueño: «sí, mídelo»): ¿cuántos mensajes post-venta frenados SOLO por confianza saldrían solos si
// Mensajes tuviera verificador (como Preguntas) y la IA viera también las preguntas que el comprador hizo antes de comprar?
// NO manda nada ni toca ml_mensajes_ia: regenera el borrador con la conversación hasta ese mensaje (historico) y lo
// verifica. El gasto queda como prueba interna. Grupo «control»: mensajes que hoy salieron solos (¿el verificador los frena?).
// Se corre DENTRO del contenedor (env de producción), con un bundle:
//   npx esbuild scripts/medir-verificador-mensajes.ts --bundle --platform=node --format=cjs --external:next --external:pg-native --outfile=<tmp>/medir.js
//   docker cp medir.js inventory_ecd:/tmp/ && docker exec -e NODE_PATH=/app/node_modules inventory_ecd node /tmp/medir.js [n_control] > salida.jsonl
import { conEmpresa } from '@/lib/db'
import { borradorMensaje } from '@/lib/mensajesIA'
import { motivosMensaje } from '@/lib/mensajesIAPrueba'
import { verificarMensaje } from '@/lib/verificadorIA'
import { comoPruebaInterna, costoDe } from '@/lib/ia'
import { leerMiIA, MI_IA_KEY } from '@/lib/miIA'
import { textoPlano } from '@/lib/mensajesML'

const EMPRESA = 1, PAIS = 'VE' as const
const N_CONTROL = Number(process.argv[2] ?? 80)
const PARALELO = 4

async function main() {
  const casos = await conEmpresa(EMPRESA, PAIS, async db => (await db.query(
    `(SELECT 'confianza' AS grupo, i.id::text, i.pack_id::text AS pack, i.conexion_id, i.mensaje_at, i.respuesta AS antes, i.confianza AS conf_antes, x.ml_user_id
      FROM ml_mensajes_ia i JOIN ml_conexiones x ON x.id = i.conexion_id
      WHERE i.mensaje_at >= '2026-11-11' AND i.estado = 'listo' AND cardinality(i.motivos) = 1 AND i.motivos[1] ~ '^Confianza')
     UNION ALL
     (SELECT 'control', i.id::text, i.pack_id::text, i.conexion_id, i.mensaje_at, i.respuesta, i.confianza, x.ml_user_id
      FROM ml_mensajes_ia i JOIN ml_conexiones x ON x.id = i.conexion_id
      WHERE i.mensaje_at >= '2026-11-14' AND i.estado = 'listo' AND i.decision = 'sola' ORDER BY random() LIMIT $1)`, [N_CONTROL])).rows)
  const persona = await conEmpresa(EMPRESA, PAIS, async db => {
    const { rows: [mi] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [MI_IA_KEY])
    return leerMiIA(mi?.value)?.persona ?? []
  })
  console.error(`casos: ${casos.length}`)
  let i = 0, hechos = 0
  const uno = async (c: typeof casos[number]) => {
    const hasta = new Date(c.mensaje_at).toISOString()
    try {
      const r = await conEmpresa(EMPRESA, PAIS, async db => {
        const b = await borradorMensaje(db, c.conexion_id, Number(c.ml_user_id), c.pack, PAIS, true, hasta, undefined,
          { preguntasPrevias: true, historico: true })
        const { rows: msgs } = await db.query(
          `SELECT propio, texto FROM ml_mensajes WHERE pack_id = $1 AND fecha <= $2::timestamptz + interval '1 second' ORDER BY fecha DESC LIMIT 10`, [c.pack, hasta])
        const corte = msgs.findIndex(m => m.propio)
        const comprador = (corte < 0 ? msgs : msgs.slice(0, corte)).reverse().map(m => String(m.texto)).join('\n').slice(0, 1000)
        const vendedor = msgs.filter(m => m.propio).map(m => String(m.texto)).join('\n')
        const { rows: eq } = await db.query(
          `SELECT texto FROM ml_mensajes WHERE pack_id = $1 AND propio AND fecha > $2::timestamptz ORDER BY fecha LIMIT 2`, [c.pack, hasta])
        const base = motivosMensaje(b, comprador, persona, vendedor)
        const v = b.respuesta ? await verificarMensaje(b.contexto, textoPlano(comprador), b.respuesta).catch(e => ({ ok: false, motivo: `error: ${e}`, llamada: null, sinRespaldo: [] })) : null
        let motivos = base
        if (v?.ok) motivos = base.filter(m => !/^Confianza/.test(m))
        else if (v) motivos = [...base, `Verificador: ${v.motivo}`]
        const costo = costoDe(b.modelo, b.uso) + (v?.llamada ? costoDe(v.llamada.modelo, v.llamada.uso) : 0)
        return {
          grupo: c.grupo, id: c.id, pack: c.pack, fecha: hasta, comprador: textoPlano(comprador).slice(0, 400),
          antes: c.antes, conf_antes: c.conf_antes, previas: /PREGUNTAS QUE ESTE COMPRADOR HIZO ANTES/.test(b.contexto),
          ahora: b.respuesta, conf: b.confianza, falta: b.falta_dato, pedido: b.pedido_especial ?? null, reclamo: b.reclamo ?? null,
          motivos_sin_verif: base, verif: v ? (v.ok ? 'ok' : v.motivo) : null, motivos,
          sola_sin_verif: !!b.respuesta && base.length === 0, sola_con_verif: !!b.respuesta && motivos.length === 0,
          equipo: eq.map(x => textoPlano(String(x.texto))).join(' / ').slice(0, 400), costo,
          contexto: b.contexto, comprador_completo: textoPlano(comprador),   // para re-verificar sin regenerar
        }
      })
      process.stdout.write(JSON.stringify(r) + '\n')
    } catch (e) {
      process.stdout.write(JSON.stringify({ grupo: c.grupo, id: c.id, pack: c.pack, error: String(e).slice(0, 200) }) + '\n')
    }
    if (++hechos % 20 === 0) console.error(`${hechos}/${casos.length}`)
  }
  await comoPruebaInterna(async () => {
    await Promise.all(Array.from({ length: PARALELO }, async () => { while (i < casos.length) await uno(casos[i++]) }))
  }, 'Medición verificador Mensajes')
  console.error('listo')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
