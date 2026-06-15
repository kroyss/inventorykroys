/**
 * Construye el texto multilínea para el tooltip nativo (`title`) de una fila de
 * lista (ventas / compras / importaciones). Muestra la lista completa de
 * productos con su nota individual y, al final, la nota de la orden — así se
 * puede leer todo pasando el cursor sin abrir cada orden.
 */
interface TooltipItem {
  product_code: string
  product_name: string
  quantity: number
  notes?: string | null
}

export function itemsTooltip(
  items: TooltipItem[],
  orderNotes?: string | null,
): string {
  const lines = items.map(
    i =>
      `• ${i.product_code}  ${i.product_name}  ×${i.quantity}` +
      (i.notes ? `  — ${i.notes}` : ''),
  )
  if (orderNotes) lines.push(`\nNotas: ${orderNotes}`)
  return lines.join('\n')
}
