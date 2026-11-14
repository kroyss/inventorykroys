// Tabla de MercadoEnvíos GLOBAL (14-11-2026, el dueño): la política de envío gratis por peso es de MercadoLibre y es la
// misma para todos los vendedores de Venezuela, así que la mantiene el dueño de la plataforma (Ajustes → Tabla
// MercadoEnvíos) y todas las empresas la leen. Vive en plataforma_config (clave 'tablas_envio_ve', global, sin RLS).
// Orden: global → la de la empresa (de antes, si quedara alguna) → la del código (lib/mlShipping.ts).
import { dbGlobal } from '@/lib/db'

export const CLAVES_TABLA_ENVIO = ['ml_shipping_table', 'ml_shipping_table_zoom'] as const
type Tablas = Partial<Record<(typeof CLAVES_TABLA_ENVIO)[number], string>>

let cache: { at: number; v: Tablas } | null = null
const DURA_MS = 60_000   // dos copias de la app: el cambio llega a la otra en ≤ 1 min

export async function tablasEnvioGlobales(): Promise<Tablas> {
  if (cache && Date.now() - cache.at < DURA_MS) return cache.v
  const { rows: [r] } = await dbGlobal().query(`SELECT valor FROM plataforma_config WHERE clave = 'tablas_envio_ve'`)
    .catch(() => ({ rows: [] as { valor: Tablas }[] }))
  const v: Tablas = {}
  for (const k of CLAVES_TABLA_ENVIO) if (typeof r?.valor?.[k] === 'string') v[k] = r.valor[k]
  cache = { at: Date.now(), v }
  return v
}

/** Pone la tabla global encima de los ajustes de la empresa (solo VE: en CO no hay tabla por peso). */
export async function conTablasGlobales<T extends Record<string, string>>(ajustes: T, pais: string): Promise<T> {
  if (pais !== 'VE') return ajustes
  return { ...ajustes, ...(await tablasEnvioGlobales()) }
}

/** Guarda la tabla global (solo el dueño de la plataforma; lo chequea quien llama). */
export async function guardarTablasEnvio(v: Tablas) {
  const actual = await tablasEnvioGlobales().catch(() => ({}))
  const nuevo = { ...actual, ...v }
  await dbGlobal().query(
    `INSERT INTO plataforma_config (clave, valor, updated_at) VALUES ('tablas_envio_ve', $1, NOW())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`, [JSON.stringify(nuevo)])
  cache = { at: Date.now(), v: nuevo }
}
