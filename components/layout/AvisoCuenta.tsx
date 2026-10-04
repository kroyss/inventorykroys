import Link from 'next/link'
import { dbGlobal } from '@/lib/db'

// Aviso arriba de todas las pantallas sobre la cuenta de la organización (lib/cuenta.ts):
//  - prueba esperando conexión (migración 067): "tus días empiezan al conectar ML" (el número solo a
//    los Fundadores; a una prueba normal no, así los videos sirven para todos);
//  - prueba corriendo: desde AVISAR_DESDE días antes del vencimiento, cuántos quedan.
// Cuando haya suscripciones pagas con fecha, el mismo aviso sirve para "tu suscripción vence".
const AVISAR_DESDE = 7

function ddmm(f: string) { return `${f.slice(8, 10)}/${f.slice(5, 7)}` }

export default async function AvisoCuenta({ organizacionId, esAdmin }: { organizacionId: number; esAdmin: boolean }) {
  const { rows: [o] } = await dbGlobal().query(
    `SELECT estado, fundador, prueba_dias, to_char(prueba_hasta, 'YYYY-MM-DD') AS hasta,
            prueba_hasta - (NOW() AT TIME ZONE 'America/Caracas')::date AS quedan
     FROM organizaciones WHERE id = $1`, [organizacionId]).catch(() => ({ rows: [] }))
  if (!o || o.estado !== 'prueba' || !o.hasta) return null
  const quedan = Number(o.quedan)

  // Esperando conexión, salvo que ya pasaron los días de espera (los días corren solos).
  if (o.prueba_dias != null && quedan >= o.prueba_dias) {
    return (
      <div className="bg-lime-50 border-b border-lime-200 text-lime-900 text-center text-sm py-2 px-4">
        {o.fundador ? <>Tus <b>{o.prueba_dias} días gratis de Fundador</b></> : <>Tus <b>días gratis</b></>} empiezan cuando conectes tu primera cuenta de MercadoLibre
        {quedan - o.prueba_dias <= 3 ? <> (si no, empiezan solos {quedan - o.prueba_dias === 0 ? 'hoy' : `en ${quedan - o.prueba_dias} día${quedan - o.prueba_dias === 1 ? '' : 's'}`})</> : null}.{' '}
        {esAdmin && <Link href="/conectar" className="underline font-semibold whitespace-nowrap">Conectar ahora →</Link>}
      </div>
    )
  }
  if (quedan > AVISAR_DESDE || quedan < 0) return null
  const cuando = quedan === 0 ? <b>vence HOY</b> : quedan === 1 ? <b>vence mañana</b> : <>vence en <b>{quedan} días</b> (el {ddmm(o.hasta)})</>
  return (
    <div className={`border-b text-center text-sm py-2 px-4 ${quedan <= 2 ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
      Tu prueba gratis {cuando}. Para seguir usando el sistema escríbenos por Telegram: tus datos se conservan.
    </div>
  )
}
