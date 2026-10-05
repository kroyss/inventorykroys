import { statfs } from 'fs/promises'

// Alerta de disco del VPS para el dueño de la plataforma (el 2026-10-05 se llenó al 100% con caché de
// Docker; un disco lleno puede dejar a la base sin poder guardar). El / del contenedor está en el mismo
// disco del server, así que su espacio libre es el del server. La limpieza diaria es
// scripts/limpieza-docker.sh (crontab 5:00).
const AVISAR_DESDE = 80

export default async function AvisoDisco() {
  const s = await statfs('/').catch(() => null)
  if (!s || !s.blocks) return null
  const usado = Math.round((1 - s.bavail / s.blocks) * 100)
  if (usado < AVISAR_DESDE) return null
  const libreGb = (s.bavail * s.bsize / 1024 ** 3).toFixed(1)
  return (
    <div className="bg-red-600 text-white text-center text-sm py-2 px-4">
      <b>Disco del servidor al {usado}%</b> (quedan {libreGb} GB). Libera espacio:{' '}
      <code className="bg-red-700 px-1.5 py-0.5 rounded text-xs">docker builder prune -af --max-used-space 5GB</code>
      {' '}· solo lo ves tú
    </div>
  )
}
