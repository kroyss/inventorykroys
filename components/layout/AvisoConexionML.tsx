import Link from 'next/link'
import { conEmpresa } from '@/lib/db'
import type { Country } from '@/lib/types'

// Aviso arriba de todas las pantallas cuando una cuenta de MercadoLibre de la empresa quedó DESCONECTADA sola
// (ML retiró el permiso o el token no se pudo renovar, lib/ml.ts): mientras tanto no se traen ni responden preguntas,
// mensajes ni ventas de esa cuenta. Idea tomada de Mercasist (07-11, docs/analisis-mercasist.md, Fase 1.2).
// La que desconectó una persona desde el sistema no se avisa (lo hizo a propósito).
// conEmpresa (no dbEmpresa): el layout no debe tomar la conexión dedicada del request (caída 06-10).
export default async function AvisoConexionML({ empresaId, country, puedeReconectar }:
  { empresaId: number; country: Country; puedeReconectar: boolean }) {
  const caidas = await conEmpresa(empresaId, country, db => db.query<{ nickname: string }>(
    `SELECT nickname FROM ml_conexiones
      WHERE estado = 'desconectada' AND COALESCE(ultimo_error, '') <> 'Desconectada desde el sistema'
      ORDER BY nickname`).then(r => r.rows.map(x => x.nickname)))
    .catch(() => [] as string[])
  if (!caidas.length) return null
  const nombres = caidas.length === 1 ? <b>{caidas[0]}</b> : <>las cuentas <b>{caidas.join(', ')}</b></>
  return (
    <div className="bg-red-50 border-b border-red-200 text-red-900 text-center text-sm py-2 px-4">
      {caidas.length === 1 ? <>La cuenta de MercadoLibre </> : null}{nombres} {caidas.length === 1 ? 'está desconectada' : 'están desconectadas'}:
      no se traen ni se responden sus preguntas, mensajes y ventas.{' '}
      {puedeReconectar
        ? <Link href="/cuentas-ml" className="underline font-semibold whitespace-nowrap">Reconectar →</Link>
        : '(Avísale al administrador para que la reconecte.)'}
    </div>
  )
}
