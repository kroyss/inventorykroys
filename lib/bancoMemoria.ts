// "Comprobar con el banco" con memoria (22-10). Los estados de cuenta subidos quedan en ESTE navegador durante el
// día (nunca van al servidor: ver ComprobarBanco) y se vuelven a cruzar solos cuando llegan pagos nuevos a Por
// confirmar, sin resubir el archivo. Se borran solos al cambiar el día (hora de Venezuela), al subir otro del mismo
// banco o con "Quitar". Al servidor va solo lo de siempre: el movimiento que le tocó a cada pago (mig. 110).
import type { EstadoCuenta, ResultadoCruce } from '@/lib/conciliacionBanco'

const CLAVE = 'comprobar_banco_v1'
export interface EstadoGuardado { nombre: string; at: string; estado: EstadoCuenta }

export const hoyVE = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date())

/** Los estados de cuenta de hoy (los de otro día se borran al leer). */
export function leerMemoria(): EstadoGuardado[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? 'null')
    if (!v || v.fecha !== hoyVE() || !Array.isArray(v.estados)) { localStorage.removeItem(CLAVE); return [] }
    return v.estados
  } catch { return [] }
}
export function guardarMemoria(estados: EstadoGuardado[]) {
  try {
    if (estados.length) localStorage.setItem(CLAVE, JSON.stringify({ fecha: hoyVE(), estados }))
    else localStorage.removeItem(CLAVE)
  } catch { /* sin storage (privado, lleno): solo no se recuerda */ }
  window.dispatchEvent(new Event('banco-memoria'))
}
export const borrarMemoria = () => guardarMemoria([])

/** Lo que se guarda de cada pago: solo el movimiento que le tocó; "sin estado de cuenta" no se guarda. */
export const resultadosParaGuardar = (r: ResultadoCruce) => r.pagos.filter(x => x.nivel !== 'sin_estado').map(x => ({
  ids: x.ventas.map(v => v.id), nivel: x.nivel, motivo: x.motivo.slice(0, 300),
  mov: x.mov ? { banco: x.mov.banco.slice(0, 40), fecha: x.mov.fecha, monto: x.mov.monto, ref: x.mov.ref.slice(0, 40), concepto: x.mov.concepto.slice(0, 200) } : null,
}))

/** Vuelve a cruzar los pagos de ahora con los estados en memoria y guarda lo que dijo el banco. Devuelve cuántos. */
export async function recruzarMemoria(): Promise<number> {
  const estados = leerMemoria().map(e => e.estado)
  if (!estados.length) return 0
  const r = await fetch('/api/pagos-me/comprobar', { cache: 'no-store' })
  if (!r.ok) return 0
  const d = await r.json()
  const { cruzarPagos } = await import('@/lib/conciliacionBanco')
  const res = cruzarPagos(d.pagos ?? [], estados, { margenEmbalaje: d.margen, hoy: hoyVE() })
  const resultados = resultadosParaGuardar(res)
  if (!resultados.length) return 0
  const g = await fetch('/api/pagos-me/comprobar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resultados }) })
  return g.ok ? Number((await g.json()).guardados) || 0 : 0
}
