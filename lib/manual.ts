import { readFile } from 'fs/promises'
import path from 'path'

// Aprendizaje → Manuales (14-11, el dueño: piloto del formato nuevo en Inventario, en vez de videos). El manual web
// se arma SOLO desde docs/ayuda/sistema.md (la misma fuente del asistente): una sola cosa que mantener. Cada viñeta
// de primer nivel «- **Título:** …» de la sección es un tema; los temas se agrupan en capítulos con su captura.
export interface Tema { titulo: string; texto: string }
export interface Capitulo { id: string; titulo: string; ruta?: string; temas: Tema[] }

// Capítulos del manual de Inventario: a cuál va cada tema (por cómo empieza su título) y la pantalla que se captura
// (scripts/capturas-manual.js guarda public/manual/inventario/<id>.png).
const CAPITULOS_INVENTARIO: { id: string; titulo: string; ruta?: string; empieza: string[] }[] = [
  { id: 'empezar', titulo: 'Para empezar', empieza: ['Primeros pasos', 'Cómo cargar productos'] },
  { id: 'inicio', titulo: 'Inicio', ruta: '/dashboard', empieza: ['Inicio'] },
  { id: 'productos', titulo: 'Productos', ruta: '/productos', empieza: ['Productos', 'Fotos', 'Catálogo PDF', 'Publicaciones de MercadoLibre en la ficha'] },
  { id: 'publicaciones', titulo: 'Publicaciones', empieza: ['Publicaciones', 'Vincular', 'Stock en ML', 'Actualizar desde ML', 'Pesos', 'Promociones'] },
  { id: 'ventas', titulo: 'Ventas', ruta: '/ventas', empieza: ['Ventas', 'Presupuestos'] },
  { id: 'inventario', titulo: 'Inventario', ruta: '/inventario', empieza: ['Inventario'] },
  { id: 'compras', titulo: 'Compras', ruta: '/compras', empieza: ['Compras'] },
  { id: 'reportes', titulo: 'Reportes', ruta: '/reportes', empieza: ['Reportes'] },
  { id: 'ajustes', titulo: 'Ajustes', empieza: ['Ajustes'] },
]
export const CAPTURAS_INVENTARIO = CAPITULOS_INVENTARIO.filter(c => c.ruta).map(c => ({ id: c.id, ruta: c.ruta! }))

/** Los temas de una sección del manual («## 15. Inventario …» → numero 15). */
async function temasDeSeccion(numero: number): Promise<Tema[]> {
  const md = (await readFile(path.join(process.cwd(), 'docs', 'ayuda', 'sistema.md'), 'utf8')).replace(/<!--[\s\S]*?-->\n?/g, '')
  const ini = md.search(new RegExp(`^## ${numero}\\.`, 'm'))
  if (ini < 0) return []
  const resto = md.slice(ini)
  const fin = resto.slice(3).search(/^## \d/m)
  const seccion = fin < 0 ? resto : resto.slice(0, fin + 3)
  const temas: Tema[] = []
  for (const linea of seccion.split('\n')) {
    const m = linea.match(/^- \*\*(.+?)\*\*(.*)$/)
    if (m) {
      const titulo = m[1].replace(/:$/, '').trim()
      temas.push({ titulo, texto: m[2].replace(/^:\s*/, '').replace(/^\s*/, '') })
    } else if (temas.length && /^\s{2,}\S/.test(linea)) {
      temas[temas.length - 1].texto += '\n' + linea.replace(/^\s{2}/, '')
    } else if (temas.length && linea.trim() && !linea.startsWith('  ')) {
      // texto suelto entre viñetas (notas): fuera de los temas
    }
  }
  return temas
}

export async function manualInventario(): Promise<Capitulo[]> {
  const temas = await temasDeSeccion(15)
  const caps: Capitulo[] = CAPITULOS_INVENTARIO.map(c => ({ id: c.id, titulo: c.titulo, ruta: c.ruta, temas: [] }))
  const otros: Tema[] = []
  for (const t of temas) {
    // El prefijo más largo gana («Publicaciones de MercadoLibre en la ficha» va a Productos, no a Publicaciones).
    let mejor: { i: number; largo: number } | null = null
    CAPITULOS_INVENTARIO.forEach((c, i) => c.empieza.forEach(p => {
      if (t.titulo.startsWith(p) && (!mejor || p.length > mejor.largo)) mejor = { i, largo: p.length }
    }))
    if (mejor) caps[(mejor as { i: number }).i].temas.push(t); else otros.push(t)
  }
  // El tema que se llama como el capítulo va primero (Productos antes que Fotos de los productos).
  for (const c of caps) c.temas.sort((a, b) => Number(b.titulo === c.titulo) - Number(a.titulo === c.titulo))
  if (otros.length) caps.push({ id: 'mas', titulo: 'Más', temas: otros })
  return caps.filter(c => c.temas.length)
}
