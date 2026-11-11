// Pedidos comunes de todas las pantallas, juntados (12-11, rapidez fase 1). Del lado del navegador.
//
//   comun('aprendizaje')                 → los datos (o null si no hay sesión / falló), como antes con fetch.
//   comun('avisos', { fresco: true })    → sin memoria (los que se refrescan solos cada minuto).
//   olvidar('novedades')                 → después de cambiar algo (marcar vistas, avanzar un video).
//
// Lo que se pide en el mismo momento (al abrir una pantalla, todos los componentes del menú a la vez) sale en
// UN solo pedido a /api/comun; lo ya traído se reusa unos segundos (cambiar de pantalla no vuelve a pedir todo).
export type ParteComun = 'avisos' | 'novedades' | 'aprendizaje' | 'soporte' | 'cola'

const MEMORIA_MS = 10_000
const memoria = new Map<ParteComun, { at: number; p: Promise<unknown> }>()
let tanda: Map<ParteComun, { ok: (v: unknown) => void }[]> | null = null

function pedirTanda() {
  const t = tanda!
  tanda = null
  const partes = [...t.keys()]
  fetch(`/api/comun?q=${partes.join(',')}`, { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((d: Record<string, { status: number; data: unknown } | undefined>) => {
      for (const k of partes) {
        const v = d[k]?.status === 200 ? d[k]!.data : null
        if (v === null) memoria.delete(k)   // lo fallido no se recuerda
        for (const e of t.get(k)!) e.ok(v)
      }
    })
}

export function comun<T = Record<string, unknown>>(parte: ParteComun, { fresco = false } = {}): Promise<T | null> {
  const m = memoria.get(parte)
  if (!fresco && m && Date.now() - m.at < MEMORIA_MS) return m.p as Promise<T | null>
  const p = new Promise<unknown>(ok => {
    if (!tanda) { tanda = new Map(); setTimeout(pedirTanda, 30) }
    const lista = tanda.get(parte) ?? []
    lista.push({ ok })
    tanda.set(parte, lista)
  })
  memoria.set(parte, { at: Date.now(), p })
  return p as Promise<T | null>
}

export function olvidar(parte: ParteComun) {
  memoria.delete(parte)
}
