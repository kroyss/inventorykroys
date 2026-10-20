// Envíos apartados en Despachos (migración 107): reglas compartidas por la API de "En espera" y el aviso de Telegram.

/** Sigue en espera de verdad (alias e = despacho_etiquetas): su lote no se descartó y, si no se imprimió, su guía no
 *  salió después en otro lote (la volvieron a subir y se imprimió: ya no hay nada que liberar). */
export const SIGUE_EN_ESPERA = `NOT EXISTS (SELECT 1 FROM despacho_lotes dl WHERE dl.id = e.lote_id AND dl.status = 'DESCARTADO')
  AND (e.impresa OR NOT EXISTS (SELECT 1 FROM despacho_etiquetas y WHERE y.guia = e.guia AND y.impresa AND y.id <> e.id))`
