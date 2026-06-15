import { NextResponse } from 'next/server'

/**
 * Red de seguridad para errores INESPERADOS (500) de los API routes.
 *
 * Antes el catch devolvía `String(err)` al cliente pero no dejaba rastro en el
 * servidor. Ahora cada 500 se registra en consola (visible en
 * `docker logs inventory_next`) con un id de referencia corto, y al cliente se
 * le devuelve un mensaje limpio con ese mismo `ref`. Así, si un usuario reporta
 * "me salió error (ref ab12cd)", se localiza el stack exacto en los logs.
 *
 * Los errores de validación (Zod) y de negocio se devuelven ANTES con su propio
 * status y mensaje; esto solo cubre lo que cae al catch.
 */
export function apiError(err: unknown) {
  const ref = Math.random().toString(36).slice(2, 8)
  console.error(`[API ERROR ${ref}]`, err instanceof Error ? (err.stack ?? err.message) : err)
  return NextResponse.json(
    { error: `Error interno del servidor (ref ${ref})`, ref },
    { status: 500 },
  )
}
