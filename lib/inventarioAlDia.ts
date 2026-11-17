// «Mi inventario está al día» (17-11, el dueño; app_settings `inventario_al_dia`, por empresa). Tres casos:
//   - sin módulo inventario: no aplica (no se muestra nada nuevo);
//   - inventario desactualizado (apagado): el inventario se ve solo como dato, sin avisos que frenen;
//   - inventario al día (prendido): al poner stock en ML por encima de lo que hay, aviso + «¿Actualizar igual?» (no bloquea).
// Sin valor guardado arranca prendido solo si hubo movimientos de entrada o ajustes en los últimos 60 días.
import type { Pool } from 'pg'

export async function leerInventarioAlDia(db: Pick<Pool, 'query'>): Promise<boolean> {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = 'inventario_al_dia'`)
  if (r) return r.value === '1'
  const { rows: [m] } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM inventory_movements WHERE movement_type IN ('IN', 'ADJUST')
                     AND created_at > NOW() - interval '60 days') AS hay`)
  return !!m?.hay
}

export async function guardarInventarioAlDia(db: Pick<Pool, 'query'>, valor: boolean) {
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ('inventario_al_dia', $1)
     ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value`, [valor ? '1' : '0'])
}
