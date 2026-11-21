// Re-verificación (21-11): toma la salida de medir-verificador-mensajes.ts (con el contexto guardado de cada caso) y
// vuelve a pasar SOLO el verificador de Mensajes, sin regenerar la respuesta. No toca la base de negocio; el gasto
// queda como prueba interna («Medición verificador Mensajes»), no como uso de la cuenta.
//   node reverificar.js entrada.jsonl > salida.jsonl   (dentro del contenedor, igual que el otro script)
import { readFileSync } from 'fs'
import { verificarMensaje } from '@/lib/verificadorIA'
import { comoPruebaInterna, costoDe } from '@/lib/ia'

const PARALELO = 6
const filas = readFileSync(process.argv[2], 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l))

async function main() {
  console.error(`casos: ${filas.length}`)
  let i = 0, hechos = 0
  const uno = async (f: Record<string, any>) => {
    const { contexto, comprador_completo, ...resto } = f
    if (f.error || !f.ahora) { process.stdout.write(JSON.stringify({ ...resto, verif3: null, sola3: false }) + '\n'); return }
    try {
      const v = await verificarMensaje(contexto, comprador_completo, f.ahora)
      const base: string[] = f.motivos_sin_verif ?? []
      const motivos = v.ok ? base.filter(m => !/^Confianza/.test(m)) : [...base, `Verificador: ${v.motivo}`]
      process.stdout.write(JSON.stringify({ ...resto, verif3: v.ok ? 'ok' : v.motivo, motivos3: motivos, sola3: motivos.length === 0,
        costo3: costoDe(v.llamada.modelo, v.llamada.uso) }) + '\n')
    } catch (e) {
      process.stdout.write(JSON.stringify({ ...resto, verif3: `error: ${String(e).slice(0, 150)}`, sola3: false }) + '\n')
    }
    if (++hechos % 50 === 0) console.error(`${hechos}/${filas.length}`)
  }
  await comoPruebaInterna(async () => {
    await Promise.all(Array.from({ length: PARALELO }, async () => { while (i < filas.length) await uno(filas[i++]) }))
  }, 'Medición verificador Mensajes')
  // Deja terminar los INSERT del registro de gasto (no se esperan).
  await new Promise(r => setTimeout(r, 3000))
  console.error('listo')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
