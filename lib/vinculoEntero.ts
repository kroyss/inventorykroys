// 17-11 (el dueño: «parece bien vinculado pero está mal»): una publicación con variantes puede tener a la vez un vínculo
// VIEJO por la publicación entera (MLV861533294 → COD-0180, de marzo) y los vínculos nuevos por variante. Lo que mira
// la publicación COMPLETA (Preguntas, IA, Stock en ML, pesos, fotos, «No reponer», gemelas) tomaba el vínculo entero:
// la IA contestaba con el stock y el precio de otro producto, el peso del portal pasaba a ese producto y Stock en ML
// podía bajar a 0 todas las variantes. Regla: si la publicación tiene variantes vinculadas, el vínculo entero no cuenta
// para la publicación completa (las variantes sin vínculo propio lo siguen heredando donde se mira UNA variante).

/** SQL: TRUE si el vínculo `alias` (product_ml_codes) vale para la publicación completa. */
export const sinEnteraVieja = (alias: string) => `(${alias}.ml_code LIKE '%:%' OR NOT EXISTS (
  SELECT 1 FROM product_ml_codes vv WHERE vv.is_active AND vv.ml_code LIKE '%:%'
    AND split_part(vv.ml_code, ':', 1) = split_part(${alias}.ml_code, ':', 1)))`
