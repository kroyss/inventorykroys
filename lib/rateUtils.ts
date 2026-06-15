// Formula: recommended_discount = max(0, (1 - (1.05 × parallel) / ((1 + excess/100) × official)) × 100)
export function calcSpreadAndDiscount(
  official: number,
  parallel: number,
  excess: number,
): { spread: number; recommended_discount: number } {
  const spread       = ((parallel - official) / official) * 100
  const excessFactor = 1 + excess / 100
  const recommended_discount =
    excessFactor > 0 && official > 0
      ? Math.max(0, (1 - (1.05 * parallel) / (excessFactor * official)) * 100)
      : 0
  return {
    spread:               Math.round(spread * 100) / 100,
    recommended_discount: Math.round(recommended_discount * 100) / 100,
  }
}
