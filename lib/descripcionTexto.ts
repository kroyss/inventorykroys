// Descripción de una publicación en 3 partes (08-11-2026, pedido del dueño): encabezado (arriba) + descripción del
// producto + pie (ubicación, horario, pagos, envíos, condiciones). En el sistema van separadas; a MercadoLibre se
// manda todo junto, cada parte separada por una línea en blanco. Sin dependencias: lo usan la pantalla y el servidor.

export const SEPARADOR = '\n\n'
export const MAX_DESCRIPCION = 50000

const normal = (s: string) => s.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim()

/** Orden en ML: encabezado, descripción del producto, condiciones de compra (mig 154) y pie. */
export function componer(encabezado: string | null | undefined, cuerpo: string, pie: string | null | undefined, condiciones?: string | null) {
  return [encabezado, cuerpo, condiciones, pie].map(x => normal(x ?? '')).filter(Boolean).join(SEPARADOR)
}

export type TipoTexto = 'encabezado' | 'condiciones' | 'pie'
export const TIPOS_TEXTO: TipoTexto[] = ['encabezado', 'condiciones', 'pie']
export const NOMBRE_TIPO: Record<TipoTexto, { titulo: string; plural: string; uno: string; columna: string }> = {
  encabezado: { titulo: 'Encabezado', plural: 'Encabezados', uno: 'un encabezado', columna: 'encabezado_id' },
  condiciones: { titulo: 'Condiciones de compra', plural: 'Condiciones de compra', uno: 'unas condiciones de compra', columna: 'condiciones_id' },
  pie: { titulo: 'Pie', plural: 'Pies', uno: 'un pie', columna: 'pie_id' },
}

/** ¿Son el mismo texto? (sin contar espacios al final de línea ni saltos de línea de Windows) */
export const mismoTexto = (a: string, b: string) => normal(a) === normal(b)

export interface PlantillaTexto { id: number; tipo: TipoTexto; texto: string }

/** Separa un texto de ML con las plantillas guardadas: si empieza con un encabezado conocido o termina con un pie
 *  conocido (texto exacto), los saca. Lo que queda es el cuerpo. Gana el más largo si hay varios. */
export function separar(texto: string, plantillas: PlantillaTexto[]) {
  let resto = normal(texto)
  let encabezado: PlantillaTexto | null = null, pie: PlantillaTexto | null = null, condiciones: PlantillaTexto | null = null
  const porLargo = [...plantillas].sort((a, b) => normal(b.texto).length - normal(a.texto).length)
  for (const p of porLargo.filter(x => x.tipo === 'encabezado')) {
    const t = normal(p.texto)
    if (t && resto.startsWith(t) && (resto.length === t.length || resto[t.length] === '\n')) { encabezado = p; resto = resto.slice(t.length).trim(); break }
  }
  for (const p of porLargo.filter(x => x.tipo === 'pie')) {
    const t = normal(p.texto)
    if (t && resto.endsWith(t) && (resto.length === t.length || resto[resto.length - t.length - 1] === '\n')) { pie = p; resto = resto.slice(0, resto.length - t.length).trim(); break }
  }
  // Las condiciones de compra van justo antes del pie (o al final si no hay pie).
  for (const p of porLargo.filter(x => x.tipo === 'condiciones')) {
    const t = normal(p.texto)
    if (t && resto.endsWith(t) && (resto.length === t.length || resto[resto.length - t.length - 1] === '\n')) { condiciones = p; resto = resto.slice(0, resto.length - t.length).trim(); break }
  }
  return { encabezado, pie, condiciones, cuerpo: resto }
}

// ── Bloques PARECIDOS (08-11, el dueño): en los cambios en lote, unas condiciones o un pie viejos pegados a mano
// (mismos títulos y casi las mismas líneas que un texto guardado, pero no idénticos) se reconocen y se reemplazan,
// en vez de saltar la publicación o dejarlos repetidos. Solo lo usan los lotes, no el editor.
const lineaUtil = (l: string) => {
  const t = l.trim().toLowerCase().replace(/\s+/g, ' ')
  return t.length > 3 && /[a-z0-9áéíóúñ]/i.test(t) ? t : null
}
const lineasUtiles = (s: string) => new Set(normal(s).split('\n').map(lineaUtil).filter((x): x is string => !!x))

/** Qué tanto se parecen dos textos: líneas en común sobre las del más corto (0 a 1). */
export function similitud(a: string, b: string) {
  const A = lineasUtiles(a), B = lineasUtiles(b)
  if (A.size < 3 || B.size < 3) return 0
  let c = 0
  for (const x of A) if (B.has(x)) c++
  return c / Math.min(A.size, B.size)
}

/** Quita del final (o del inicio) del texto el bloque más grande que se parece a alguna referencia. null = no hay. */
export function quitarParecido(texto: string, referencias: string[], lado: 'final' | 'inicio'): string | null {
  const ls = normal(texto).split('\n')
  const n = ls.length
  let corte: number | null = null
  for (const ref of referencias) {
    const set = lineasUtiles(ref)
    if (set.size < 3) continue
    let comunes = 0, utiles = 0
    for (let k = 0; k < n; k++) {
      const i = lado === 'final' ? n - 1 - k : k
      const u = lineaUtil(ls[i])
      if (!u) continue
      utiles++
      if (!set.has(u)) continue
      comunes++
      // El bloque empieza (o termina) en una línea conocida, la mayoría de sus líneas están en la referencia y trae
      // buena parte de ella.
      if (comunes >= 3 && comunes / utiles >= 0.6 && comunes >= set.size * 0.4) {
        const c = lado === 'final' ? i : i + 1
        if (corte === null || (lado === 'final' ? c < corte : c > corte)) corte = c
      }
    }
  }
  if (corte === null) return null
  // Con sus separadores (***, líneas vacías) pegados.
  if (lado === 'final') { while (corte > 0 && !lineaUtil(ls[corte - 1])) corte-- }
  else { while (corte < n && !lineaUtil(ls[corte])) corte++ }
  return (lado === 'final' ? ls.slice(0, corte) : ls.slice(corte)).join('\n').trim()
}

// Lo que MercadoLibre acepta en la descripción: texto plano. Letras (con acentos y ñ), números, espacios y los signos
// básicos (12-11: también × ½ ¼ ¾ ² ³ ± ÷ ® ™ ©, que ML acepta: vienen en descripciones ya publicadas). Lo demás (emojis, símbolos raros, viñetas especiales) ML lo rechaza o lo borra.
const PERMITIDO = /[\p{L}\p{N}\s.,;:¿?¡!()[\]{}"'`´\-_+*/\\#%&@$=<>|°ºª~^€£¥…·•–—“”‘’×½¼¾²³±÷®™©]/u

/** Los caracteres que ML no acepta (sin repetir), para avisar antes de guardar. */
export function caracteresNoPermitidos(texto: string): string[] {
  const malos = new Set<string>()
  for (const ch of texto) if (!PERMITIDO.test(ch)) malos.add(ch)
  return [...malos]
}

/** Quita los caracteres que ML no acepta (y los espacios dobles que quedan). */
export function limpiarTexto(texto: string) {
  let out = ''
  for (const ch of texto) if (PERMITIDO.test(ch)) out += ch
  return out.replace(/[ \t]{2,}/g, ' ')
}

/** Teléfonos, correos o links: ML no los permite en la descripción (puede pausar la publicación). */
export function tieneContacto(texto: string) {
  return /\b[\w.+-]+@[\w-]+\.[\w.]+\b/.test(texto) || /(https?:\/\/|www\.)\S+/i.test(texto) || /(\+?\d[\d\s-]{8,}\d)/.test(texto)
}

// ── Detectar textos repetidos (pies y encabezados que ya están pegados en muchas descripciones) ──
export interface Candidato { tipo: 'encabezado' | 'pie'; texto: string; lineas: number; items: string[] }

/** De las descripciones de una cuenta, los finales (pies) e inicios (encabezados) que se repiten en al menos
 *  `minimo` publicaciones. Por cada largo se cuentan las publicaciones que comparten exactamente esas líneas; se
 *  queda con los más largos que no son parte de otro mejor. */
export function detectarRepetidos(textos: { item: string; texto: string }[], minimo = 3, maxLineas = 40): Candidato[] {
  const out: Candidato[] = []
  for (const tipo of ['pie', 'encabezado'] as const) {
    const cuenta = new Map<string, { lineas: number; items: string[] }>()
    for (const { item, texto } of textos) {
      const ls = normal(texto).split('\n')
      const vistos = new Set<string>()
      for (let k = 2; k <= Math.min(maxLineas, ls.length - 1); k++) {
        const parte = (tipo === 'pie' ? ls.slice(ls.length - k) : ls.slice(0, k)).join('\n').trim()
        if (!parte || vistos.has(parte)) continue
        vistos.add(parte)
        const c = cuenta.get(parte) ?? { lineas: k, items: [] }
        c.items.push(item)
        cuenta.set(parte, c)
      }
    }
    const buenos = [...cuenta.entries()].filter(([, c]) => c.items.length >= minimo)
      .sort((a, b) => b[1].lineas * b[1].items.length - a[1].lineas * a[1].items.length)
    const elegidos: Candidato[] = []
    for (const [texto, c] of buenos) {
      // Fuera si es parte de uno ya elegido que lo tiene casi en las mismas publicaciones.
      if (elegidos.some(e => (tipo === 'pie' ? e.texto.endsWith(texto) : e.texto.startsWith(texto)) && e.items.length >= c.items.length * 0.8)) continue
      elegidos.push({ tipo, texto, lineas: c.lineas, items: c.items })
      if (elegidos.length >= 6) break
    }
    out.push(...elegidos)
  }
  return out
}
