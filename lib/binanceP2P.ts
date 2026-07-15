// Tasa "paralelo" VE vía Binance P2P — más confiable que dolarapi para este
// dato puntual (dolarapi falla seguido en 'paralelo', no en 'oficial').
// Fallback automático a ve.dolarapi.com si Binance falla o no responde.

const PAY_TYPES = ['Banesco', 'Mercantil', 'BANK'] // solo bancos, sin Zelle/Wally/etc.
const ROWS = 5 // pocas filas: lectura rápida, evita cualquier bloqueo

async function fetchBinanceSide(tradeType: 'BUY' | 'SELL'): Promise<number> {
  const res = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'SyncsoraInventory/cron' },
    body: JSON.stringify({
      asset: 'USDT', fiat: 'VES', tradeType, page: 1, rows: ROWS,
      payTypes: PAY_TYPES, publisherType: null,
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Binance HTTP ${res.status} (${tradeType})`)
  const data = await res.json()
  const prices: number[] = (data?.data ?? [])
    .map((x: { adv?: { price?: string } }) => parseFloat(x.adv?.price ?? ''))
    .filter((n: number) => n > 0)
  if (prices.length === 0) throw new Error(`Binance sin anuncios (${tradeType})`)
  return prices.reduce((a, b) => a + b, 0) / prices.length
}

async function fetchBinanceParallel(): Promise<number> {
  const [buy, sell] = await Promise.all([fetchBinanceSide('BUY'), fetchBinanceSide('SELL')])
  return (buy + sell) / 2
}

async function fetchDolarApiParallel(): Promise<number> {
  const res = await fetch('https://ve.dolarapi.com/v1/dolares/paralelo', {
    headers: { 'User-Agent': 'SyncsoraInventory/cron' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} para tasa paralelo (dolarapi)`)
  const data = await res.json()
  return parseFloat(data.promedio)
}

export async function fetchVEParallelRate(): Promise<{ rate: number; source: 'binance' | 'dolarapi' }> {
  try {
    const rate = await fetchBinanceParallel()
    if (!(rate > 0)) throw new Error('Binance retornó 0')
    return { rate, source: 'binance' }
  } catch {
    const rate = await fetchDolarApiParallel()
    return { rate, source: 'dolarapi' }
  }
}
