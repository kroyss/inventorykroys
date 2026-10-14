'use client'
// Botones de las listas de respuestas rápidas (Preguntas y Mensajes), 2026-10-14: "Editar" que queda
// marcado mientras se edita (antes "Cerrar", que parecía borrar) y "Eliminar" con aviso antes.
import { useConfirm } from '@/components/ui/ConfirmProvider'

const base = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors'

export function BotonEditar({ abierta, onClick }: { abierta: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={abierta} aria-expanded={abierta}
      title={abierta ? 'Terminar de editar (los cambios quedan hasta que guardes)' : 'Editar esta respuesta'}
      className={`${base} ${abierta
        ? 'border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700'
        : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500 hover:text-neutral-900'}`}>
      {abierta ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10l4-4 4 4" /></svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5Z" /></svg>
      )}
      {abierta ? 'Editando' : 'Editar'}
    </button>
  )
}

/** Eliminar con confirmación: "nombre" va en el aviso. onEliminar guarda la lista sin esa respuesta. */
export function BotonEliminar({ nombre, onEliminar }: { nombre: string; onEliminar: () => void }) {
  const confirm = useConfirm()
  const pedir = async () => {
    const ok = await confirm({
      title: 'Eliminar respuesta rápida',
      message: `Se eliminará «${nombre || 'esta respuesta'}» y no se puede recuperar.\n\nLo que ya respondiste con ella no cambia.`,
      confirmText: 'Eliminar',
      danger: true,
    })
    if (ok) onEliminar()
  }
  return (
    <button type="button" onClick={pedir} title="Eliminar esta respuesta"
      className={`${base} border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50`}>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
      </svg>
      Eliminar
    </button>
  )
}
