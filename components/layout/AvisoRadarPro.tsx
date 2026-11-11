import { dbGlobal } from '@/lib/db'
import { radarUrl } from '@/lib/espacios'
import AvisoRadarProBarra from './AvisoRadarProBarra'

/** 12-11 (el dueño): los sábados y domingos (hora Venezuela), a las cuentas con Radar PRO vigente (mes de regalo o pagado)
 *  y el Radar prendido, un aviso arriba: «Radar PRO activo hoy» con el botón para entrar. Se cierra por fin de semana. */
export default async function AvisoRadarPro({ organizacionId }: { organizacionId: number }) {
  const { rows: [o] } = await dbGlobal().query(
    `SELECT to_char(hoy - (EXTRACT(ISODOW FROM hoy)::int - 6), 'YYYY-MM-DD') AS sabado
     FROM (SELECT (NOW() AT TIME ZONE 'America/Caracas')::date AS hoy) h, organizaciones o
     WHERE o.id = $1 AND EXTRACT(ISODOW FROM hoy) IN (6, 7) AND o.radar_pro_hasta >= hoy
       AND EXISTS (SELECT 1 FROM empresas e WHERE e.organizacion_id = o.id AND 'radar' = ANY(e.modulos))`,
    [organizacionId]).catch(() => ({ rows: [] }))
  if (!o) return null
  return <AvisoRadarProBarra semana={o.sabado} url={radarUrl()} />
}
