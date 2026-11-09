// Qué tareas de la cola de MercadoLibre (lib/colaML.ts) puede ver cada usuario (08-11-2026): las de las secciones
// que tiene. Publicaciones → descripción/precio/lectura; Promociones → promoción.
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'

type Usuario = { role?: import('@/lib/types').UserRole; permisos?: string[]; modulos?: string[]; country?: string } | null | undefined

export function tiposPermitidos(u: Usuario): string[] {
  const t: string[] = []
  if (tieneModulo(u, 'publicaciones') && tieneModulo(u, 'preguntas') && puede(u, 'editar_publicaciones')) t.push('descripcion', 'precio', 'leer')
  if (u?.country === 'VE' && tieneModulo(u, 'promociones') && puede(u, 'promociones') && puede(u, 'ver_productos')) t.push('promocion')
  return t
}
