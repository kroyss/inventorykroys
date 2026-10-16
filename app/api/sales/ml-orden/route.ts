import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'
import { ventaParaFormulario } from '@/lib/ventasML'
import { unidadesDelTitulo } from '@/lib/combos'

// GET /api/sales/ml-orden?numero=2000018737735322 → comprador y productos de esa venta en
// MercadoLibre, para llenar el formulario de Ventas (nombre del cliente; productos sugeridos por
// su código ML). Necesita cuentas conectadas (módulo `preguntas`); sin ellas responde 404 y el
// formulario sigue manual.
export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!tieneModulo(session.user, 'preguntas')) return NextResponse.json({ error: 'Sin cuentas de ML conectadas' }, { status: 404 })
  const numero = new URL(req.url).searchParams.get('numero')?.trim() ?? ''
  if (!/^\d{10,20}$/.test(numero)) return NextResponse.json({ error: 'Número inválido' }, { status: 400 })
  try {
    const v = await ventaParaFormulario(db, numero)
    if (!v) return NextResponse.json({ error: 'No se encontró en tus cuentas de MercadoLibre' }, { status: 404 })
    // Productos del sistema por su código ML (se guarda sin el prefijo: MLV768007052 → 768007052).
    // Un mismo código puede estar en varios productos (combos o publicaciones repetidas): entonces
    // no se elige ninguno solo; van todos en `opciones` y la persona decide.
    // Producto por variante (Importar desde ML, 2026-10-12): "768007052:180012345"; si la variante no
    // tiene producto propio se usa el de la publicación, como siempre; y si tampoco, se ofrecen los de las
    // otras variantes de esa publicación para elegir.
    const sinPrefijo = (id: string) => id.replace(/^[A-Z]{3}/, '')
    const deVariante = (i: { itemId: string; variacionId: number | null }) => i.variacionId ? `${sinPrefijo(i.itemId)}:${i.variacionId}` : null
    const publicaciones = v.items.map(i => sinPrefijo(i.itemId))
    const { rows } = await db.query(
      `SELECT DISTINCT m.ml_code, split_part(m.ml_code, ':', 1) AS publicacion, p.id AS product_id, p.code, p.name, m.unidades
       FROM product_ml_codes m JOIN products p ON p.id = m.product_id
       WHERE m.is_active AND p.is_active AND split_part(m.ml_code, ':', 1) = ANY($1::text[])
       ORDER BY m.ml_code, p.code`, [publicaciones])
    const items = v.items.map(i => {
      const exactas = rows.filter(x => x.ml_code === deVariante(i))
      const dePublicacion = rows.filter(x => x.ml_code === sinPrefijo(i.itemId))
      const otrasVariantes = rows.filter(x => x.publicacion === sinPrefijo(i.itemId) && x.ml_code.includes(':'))
      const opciones = (exactas.length ? exactas : dePublicacion.length ? dePublicacion : otrasVariantes)
        .map(r => ({ id: r.product_id as number, code: r.code as string, name: r.name as string, unidades: (r.unidades as number) ?? 1 }))
      // De otra variante nunca se elige solo (aunque sea una): sería el color o la talla equivocada.
      const segura = exactas.length > 0 || dePublicacion.length > 0
      // Combos (migración 098): la cantidad del producto = lo comprado × unidades de la publicación.
      // `sugeridas`: lo que dice el título, para proponerlo al vincular una publicación nueva.
      return { ...i, producto: segura && opciones.length === 1 ? opciones[0] : null, opciones, sugeridas: unidadesDelTitulo(i.titulo) }
    })
    return NextResponse.json({ cuenta: v.cuenta, comprador: v.comprador, fecha: v.fecha, items })
  } catch (err) {
    return apiError(err)
  }
}
