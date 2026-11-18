// Qué tareas de la cola de MercadoLibre (lib/colaML.ts) puede ver cada usuario (08-11-2026): las de las secciones
// que tiene. Publicaciones → descripción/precio/lectura; Promociones → promoción.
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'

type Usuario = { role?: import('@/lib/types').UserRole; permisos?: string[]; modulos?: string[]; country?: string } | null | undefined

export function tiposPermitidos(u: Usuario): string[] {
  const t: string[] = []
  if (tieneModulo(u, 'publicaciones') && tieneModulo(u, 'preguntas') && puede(u, 'editar_publicaciones')) t.push('descripcion', 'precio', 'leer')
  if (u?.country === 'VE' && tieneModulo(u, 'promociones') && puede(u, 'promociones') && puede(u, 'ver_productos')) t.push('promocion')
  // 18-11: Stock en ML por la cola (mig 185, más de 10 publicaciones): quien puede cambiar el stock ve su avance.
  if (tieneModulo(u, 'inventario') && tieneModulo(u, 'preguntas') && puede(u, 'ver_inventario') && puede(u, 'reponer_stock')) t.push('stock', 'estado')
  return t
}
