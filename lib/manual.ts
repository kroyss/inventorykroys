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

// ── Manual de Automatizaciones (18-11, el dueño: «el manual es el que estará más actualizado con sus pantallas; los
// videos ya grabados, como demostración de apoyo»). Mismo origen: docs/ayuda/sistema.md, una sección (o varias) por
// capítulo. Cada capítulo sale solo si la empresa tiene su módulo, y enlaza los videos que tratan ese tema.
export interface CapituloAuto { id: string; titulo: string; secciones: string[]; ruta?: string; modulo?: string; videos: string[] }
export const CAPITULOS_AUTOMATIZACIONES: CapituloAuto[] = [
  { id: 'empezar', titulo: 'Para empezar', secciones: ['1', '1b'], videos: ['asi trabajas', 'bienvenid'] },
  { id: 'cuentas', titulo: 'Cuentas de MercadoLibre', secciones: ['4'], ruta: '/cuentas-ml', modulo: 'preguntas', videos: ['conectar tu cuenta', 'cuenta de mercadolibre'] },
  { id: 'preguntas', titulo: 'Preguntas', secciones: ['5'], ruta: '/preguntas', modulo: 'preguntas', videos: ['pregunta'] },
  { id: 'mensajes', titulo: 'Mensajes', secciones: ['6'], ruta: '/mensajes', modulo: 'preguntas', videos: ['mensaje'] },
  { id: 'calificaciones', titulo: 'Calificaciones y reputación', secciones: ['11', '12'], ruta: '/calificaciones', modulo: 'preguntas', videos: ['calificacion'] },
  { id: 'stock', titulo: 'Stock', secciones: ['7'], ruta: '/alertas-stock', modulo: 'alertas_stock', videos: ['stock'] },
  { id: 'pagosme', titulo: 'Pagos ME', secciones: ['8'], ruta: '/pagos-me', modulo: 'pagos_me', videos: ['mercadoenvio', 'pagos me'] },
  { id: 'despachos', titulo: 'Despachos', secciones: ['9'], ruta: '/despachos', modulo: 'despachos', videos: ['despacho'] },
  { id: 'reportador', titulo: 'Reportador', secciones: ['10'], ruta: '/reportador', modulo: 'reportador', videos: ['reportador'] },
  { id: 'avisos', titulo: 'Mis avisos (Telegram)', secciones: ['13'], videos: ['telegram'] },
]
export const CAPTURAS_AUTOMATIZACIONES = CAPITULOS_AUTOMATIZACIONES.filter(c => c.ruta).map(c => ({ id: c.id, ruta: c.ruta! }))

/** Sin acentos y en minúsculas (para cruzar títulos de videos con los capítulos). */
export const plano = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Una sección entera como temas: lo de antes del primer tema va en «Cómo funciona»; cada «### X», «- **X**» o
 *  párrafo que empieza en «**X:**» abre un tema. Fuera: «Cómo lo pregunta la gente» (es para el asistente), la línea
 *  «**Video:**» (el manual enlaza los videos de verdad), separadores; los enlaces quedan como texto. */
async function seccionComoTemas(numero: string, primera = true): Promise<Tema[]> {
  const md = (await readFile(path.join(process.cwd(), 'docs', 'ayuda', 'sistema.md'), 'utf8')).replace(/<!--[\s\S]*?-->\n?/g, '')
  const ini = md.search(new RegExp(`^## ${numero.replace('.', '\\.')}\\.\\s`, 'm'))
  if (ini < 0) return []
  const resto = md.slice(ini)
  const fin = resto.slice(3).search(/^## \d/m)
  const todas = (fin < 0 ? resto : resto.slice(0, fin + 3)).split('\n')
  const lineas = todas.slice(1)
  // La primera sección del capítulo empieza en «Cómo funciona»; las siguientes, con su propio nombre («Reputación»).
  const intro = primera ? 'Cómo funciona'
    : todas[0].replace(/^##\s+\S+\.\s*/, '').replace(/\s*\(.*$/, '').replace(/\s*·.*$/, '').trim()
  const temas: Tema[] = []
  const actual = () => temas[temas.length - 1] ?? (temas.push({ titulo: intro, texto: '' }), temas[0])
  for (let l of lineas) {
    l = l.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    if (/^\*Cómo lo pregunta/.test(l) || /^---\s*$/.test(l) || /^\*\*Videos?:\*\*/.test(l)) continue
    const h3 = l.match(/^###\s+(.+)$/)
    const vineta = l.match(/^- \*\*(.+?)\*\*(.*)$/)
    const parrafo = l.match(/^\*\*([^*]{2,80}?):\*\*\s*(.*)$/)
    if (h3) { temas.push({ titulo: h3[1].trim(), texto: '' }); continue }
    const m = vineta ?? parrafo
    if (m) { temas.push({ titulo: m[1].replace(/:$/, '').trim(), texto: m[2].replace(/^:\s*/, '').trim() }); continue }
    const t = actual()
    if (!l.trim()) { if (t.texto && !t.texto.endsWith('\n\n')) t.texto += '\n\n'; continue }
    t.texto += (t.texto && !t.texto.endsWith('\n') ? '\n' : '') + l.replace(/^\s{2}/, '')
  }
  return temas.map(t => ({ ...t, texto: t.texto.trim() })).filter(t => t.texto || t.titulo)
}

/** Capítulos del manual de Automatizaciones que le tocan a la empresa (por sus módulos). */
export async function manualAutomatizaciones(tiene: (modulo: string) => boolean): Promise<(Capitulo & { videos: string[] })[]> {
  const caps: (Capitulo & { videos: string[] })[] = []
  for (const c of CAPITULOS_AUTOMATIZACIONES) {
    if (c.modulo && !tiene(c.modulo)) continue
    const temas = (await Promise.all(c.secciones.map((n, i) => seccionComoTemas(n, i === 0)))).flat()
    if (temas.length) caps.push({ id: c.id, titulo: c.titulo, ruta: c.ruta, temas, videos: c.videos })
  }
  return caps
}
