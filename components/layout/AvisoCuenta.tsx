import Link from 'next/link'
import { dbGlobal } from '@/lib/db'
import { DIAS_PRUEBA } from '@/lib/cuenta'
import { corteQueLeToca } from '@/lib/fundadoresCorte'
import { textoCorte } from '@/lib/fundadoresCortes'
import AvisoCorte from './AvisoCorte'

// Aviso arriba de todas las pantallas sobre la cuenta de la organización (lib/cuenta.ts):
//  - prueba esperando conexión (migración 067): "tus días empiezan al conectar ML" (el número solo a
//    los Fundadores; a una prueba normal no, así los videos sirven para todos);
//  - prueba corriendo: el primer día, "¡tus días empezaron!"; después una línea discreta con lo que
//    queda (así el cliente sabe que ya corren); desde AVISAR_DESDE días antes, el aviso de vencimiento.
// Plan pagado (mig 138): el mismo aviso de vencimiento, los mismos días (05-11, el dueño: unificar, 5 días, rojo los
// últimos 2). Si ya reportó un pago que está en revisión (Mi plan → Plataforma → Cobros), en vez de "vence" un aviso
// verde de que lo recibimos (la cuenta no se pausa mientras esté en revisión).
const AVISAR_DESDE = 5

function ddmm(f: string) { return `${f.slice(8, 10)}/${f.slice(5, 7)}` }
function diaSiguiente(f: string) {
  const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10)
}

function AvisoVence({ que, hasta, quedan, esAdmin }: { que: 'prueba' | 'plan'; hasta: string; quedan: number; esAdmin: boolean }) {
  const cuando = quedan === 0 ? <b>vence HOY</b> : quedan === 1 ? <b>vence mañana</b> : <>vence en <b>{quedan} días</b> (el {ddmm(hasta)})</>
  return (
    <div className={`border-b text-center text-sm py-2 px-4 ${quedan <= 1 ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
      {que === 'prueba' ? 'Tu prueba gratis' : 'Tu plan'} {cuando}. Si no pagas, el {ddmm(diaSiguiente(hasta))} la cuenta se pausa; tus datos se conservan.{' '}
      {esAdmin ? <Link href="/mi-plan" className="underline font-semibold whitespace-nowrap">Pagar mi plan →</Link> : '(El pago lo hace el administrador de la cuenta.)'}
    </div>
  )
}

function AvisoPagoEnRevision() {
  return (
    <div className="bg-lime-50 border-b border-lime-200 text-lime-900 text-center text-sm py-2 px-4">
      ✓ Recibimos tu pago, lo estamos confirmando. Tu cuenta sigue activa.
    </div>
  )
}

export default async function AvisoCuenta({ organizacionId, esAdmin }: { organizacionId: number; esAdmin: boolean }) {
  // Plazo de su corte de Fundadores sin MercadoLibre (lib/fundadoresCortes.ts): reemplaza al aviso de abajo.
  const corte = await corteQueLeToca(organizacionId).catch(() => null)
  // El texto de la fecha sale del servidor (el navegador podría escribir la hora distinto y no coincidir).
  if (corte) return <AvisoCorte hasta={corte} corto={textoCorte(corte)} largo={textoCorte(corte, true)} esAdmin={esAdmin} />
  const { rows: [o] } = await dbGlobal().query(
    `SELECT estado, fundador, prueba_dias, to_char(prueba_hasta, 'YYYY-MM-DD') AS hasta,
            prueba_hasta - (NOW() AT TIME ZONE 'America/Caracas')::date AS quedan,
            to_char(plan_hasta, 'YYYY-MM-DD') AS plan_hasta, plan_hasta - (NOW() AT TIME ZONE 'America/Caracas')::date AS plan_quedan,
            EXISTS (SELECT 1 FROM organizacion_cobros k WHERE k.organizacion_id = organizaciones.id AND k.estado = 'revision' AND k.tipo = 'plan') AS en_revision
     FROM organizaciones WHERE id = $1`, [organizacionId]).catch(() => ({ rows: [] }))
  // Plan pagado (mig 138): aviso desde AVISAR_DESDE días antes; al día siguiente del vencimiento se pausa sola.
  if (o?.estado === 'activo' && o.plan_hasta) {
    const q = Number(o.plan_quedan)
    if (q < 0 || q > AVISAR_DESDE) return null
    if (o.en_revision) return <AvisoPagoEnRevision />
    return <AvisoVence que="plan" hasta={o.plan_hasta} quedan={q} esAdmin={esAdmin} />
  }
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
  if (quedan < 0) return null
  if (quedan > AVISAR_DESDE) {
    const total = o.fundador ? DIAS_PRUEBA.fundador : DIAS_PRUEBA.normal
    // Recién empezados (hoy o ayer): confirmación en verde.
    if (quedan >= total - 1) {
      return (
        <div className="bg-lime-50 border-b border-lime-200 text-lime-900 text-center text-sm py-2 px-4">
          ✓ ¡Listo! {o.fundador ? <>Tus <b>{total} días gratis de Fundador</b> ya empezaron</> : <>Tu <b>prueba gratis</b> ya empezó</>}: va hasta el <b>{ddmm(o.hasta)}</b>.
        </div>
      )
    }
    return (
      <div className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 text-center text-xs py-1.5 px-4">
        {o.fundador ? 'Prueba gratis de Fundador' : 'Prueba gratis'}: quedan <b className="num">{quedan} días</b> (hasta el {ddmm(o.hasta)}).
      </div>
    )
  }
  if (o.en_revision) return <AvisoPagoEnRevision />
  return <AvisoVence que="prueba" hasta={o.hasta} quedan={quedan} esAdmin={esAdmin} />
}
