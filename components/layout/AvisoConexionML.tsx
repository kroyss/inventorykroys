import Link from '@/components/ui/Link'
import { conEmpresa } from '@/lib/db'
import type { Country } from '@/lib/types'
import { cupoIA, nivelCreditos } from '@/lib/ia'

// Aviso arriba de todas las pantallas cuando una cuenta de MercadoLibre de la empresa quedó DESCONECTADA sola
// (ML retiró el permiso o el token no se pudo renovar, lib/ml.ts): mientras tanto no se traen ni responden preguntas,
// mensajes ni ventas de esa cuenta. Idea tomada de Mercasist (07-11, docs/analisis-mercasist.md, Fase 1.2).
// La que desconectó una persona desde el sistema no se avisa (lo hizo a propósito).
// conEmpresa (no dbEmpresa): el layout no debe tomar la conexión dedicada del request (caída 06-10).
// 09-11 (el dueño): también el aviso de créditos de IA (queda el 10% / se acabaron), en la misma conexión.
export default async function AvisoConexionML({ empresaId, country, puedeReconectar, esAdmin }:
  { empresaId: number; country: Country; puedeReconectar: boolean; esAdmin: boolean }) {
  const { caidas, creditos } = await conEmpresa(empresaId, country, async db => {
    const caidas = await db.query<{ nickname: string }>(
      `SELECT nickname FROM ml_conexiones
        WHERE estado = 'desconectada' AND COALESCE(ultimo_error, '') <> 'Desconectada desde el sistema'
        ORDER BY nickname`).then(r => r.rows.map(x => x.nickname))
    const c = await cupoIA(db, empresaId).catch(() => null)
    return { caidas, creditos: c && nivelCreditos(c) ? { nivel: nivelCreditos(c)!, quedan: c.quedan ?? 0 } : null }
  }).catch(() => ({ caidas: [] as string[], creditos: null }))
  const avisoCreditos = creditos && (
    <div className={`border-b text-center text-sm py-2 px-4 ${creditos.nivel === 'agotado' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
      {creditos.nivel === 'agotado'
        ? <><b>Se acabaron tus créditos de IA:</b> la IA ya no propone ni responde sola (las respuestas rápidas y parecidas siguen).</>
        : <>Te quedan <b>{creditos.quedan.toLocaleString('de-DE')} créditos de IA</b>. Cuando se acaben, la IA deja de responder.</>}{' '}
      {esAdmin ? <Link href="/mi-plan" className="underline font-semibold whitespace-nowrap">Recargar →</Link> : '(La recarga la hace el administrador de la cuenta.)'}
    </div>
  )
  if (!caidas.length) return avisoCreditos || null
  const nombres = caidas.length === 1 ? <b>{caidas[0]}</b> : <>las cuentas <b>{caidas.join(', ')}</b></>
  return (
    <>
    {avisoCreditos}
    <div className="bg-red-50 border-b border-red-200 text-red-900 text-center text-sm py-2 px-4">
      {caidas.length === 1 ? <>La cuenta de MercadoLibre </> : null}{nombres} {caidas.length === 1 ? 'está desconectada' : 'están desconectadas'}:
      no se traen ni se responden sus preguntas, mensajes y ventas.{' '}
      {puedeReconectar
        ? <Link href="/cuentas-ml" className="underline font-semibold whitespace-nowrap">Reconectar →</Link>
        : '(Avísale al administrador para que la reconecte.)'}
    </div>
    </>
  )
}
