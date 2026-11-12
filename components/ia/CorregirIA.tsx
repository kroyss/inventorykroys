'use client'
import { useCallback, useEffect, useState } from 'react'
import { Ventana } from '@/components/ui/Ventana'
import { FilaDato, type Dato } from '@/components/preguntas/DatosProducto'

// 12-11 (el dueño): una sola forma de corregir a la IA en todos lados. El botón va en la misma línea que «Respondió la IA»
// (otro color) y abre una ventana: «¿Cómo la hubieras respondido tú?». La IA saca de ahí el dato del producto y/o la regla
// (/api/mi-ia/corregir) y muestra lo que aprendió. Los datos guardados de la publicación se ven en otra ventana.

/** Ventana con los datos guardados de una publicación: editar y borrar. */
export function VentanaDatos({ itemId, titulo, onCerrar, onCambio }: { itemId: string; titulo?: string | null; onCerrar: () => void; onCambio?: (n: number) => void }) {
  const [lista, setLista] = useState<Dato[] | null>(null)
  const cargar = useCallback(() => {
    fetch(`/api/preguntas/notas?item_id=${itemId}`).then(r => (r.ok ? r.json() : [])).then((d: Dato[]) => { setLista(d); onCambio?.(d.length) })
  }, [itemId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar() }, [cargar])
  return (
    <Ventana titulo="Datos guardados de esta publicación" onCerrar={onCerrar}>
      {titulo && <p className="text-xs text-neutral-500 -mt-2">{titulo}</p>}
      <p className="text-xs text-neutral-500">La IA los usa al responder esta publicación. Corrige o borra los que ya no apliquen.</p>
      {!lista ? <p className="text-sm text-neutral-400">Cargando…</p>
        : lista.length === 0 ? <p className="text-sm text-neutral-500">No hay datos guardados.</p>
        : <div className="divide-y divide-neutral-100">{lista.map(d => <FilaDato key={d.id} d={d} onCambio={cargar} />)}</div>}
      <p className="text-[11px] text-neutral-400">Todos los productos: Preguntas → Configuración → Lo aprendido.</p>
    </Ventana>
  )
}

/** Botón «N datos guardados» que abre la ventana. */
export function BotonDatos({ itemId, titulo, n, className = 'text-xs text-sky-700 hover:underline' }: { itemId: string; titulo?: string | null; n: number; className?: string }) {
  const [abierta, setAbierta] = useState(false)
  // Lo que se contó al abrir la ventana vale mientras `n` (lo que trajo la lista) no cambie.
  const [contado, setContado] = useState<{ n: number; total: number } | null>(null)
  const total = contado && contado.n === n ? contado.total : n
  const setTotal = (t: number) => setContado({ n, total: t })
  if (total === 0 && !abierta) return null
  return <>
    <button type="button" onClick={() => setAbierta(true)} className={className} title="Lo que la IA ya sabe de esta publicación">
      {total} dato{total === 1 ? '' : 's'} guardado{total === 1 ? '' : 's'}
    </button>
    {abierta && <VentanaDatos itemId={itemId} titulo={titulo} onCerrar={() => setAbierta(false)} onCambio={setTotal} />}
  </>
}

interface Aprendido { producto?: string; productoId?: number; regla?: string }

/** «✗ Corregir a la IA»: abre la ventana. `onGuardado` = aprendió (p. ej. marcar la respuesta como Mal). */
export function CorregirIA({ tipo, itemId, producto, texto, ia, onGuardado }: {
  tipo: 'preguntas' | 'mensajes'; itemId?: string | null; producto?: string | null; texto: string; ia: string; onGuardado?: () => void
}) {
  const [abierta, setAbierta] = useState(false)
  const [correccion, setCorreccion] = useState('')
  const [estado, setEstado] = useState<'' | 'aprendiendo' | 'listo'>('')
  const [error, setError] = useState<string | null>(null)
  const [aprendido, setAprendido] = useState<Aprendido | null>(null)
  const [verDatos, setVerDatos] = useState(false)

  const cerrar = () => { setAbierta(false); if (estado === 'listo') { setEstado(''); setCorreccion(''); setAprendido(null) } }
  const guardar = async () => {
    setEstado('aprendiendo'); setError(null)
    const r = await fetch('/api/mi-ia/corregir', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, item_id: itemId ?? null, producto: producto ?? null, texto, ia, correccion: correccion.trim() }),
    }).catch(() => null)
    const d = await r?.json().catch(() => ({}))
    if (!r?.ok) { setEstado(''); setError(d?.error ?? 'No se pudo guardar. Prueba de nuevo.'); return }
    setAprendido(d.aprendido ?? {}); setEstado('listo')
    onGuardado?.()
  }

  return <>
    <button type="button" onClick={() => setAbierta(true)} className="text-xs font-medium text-amber-700 hover:text-amber-900 hover:underline whitespace-nowrap">
      ✗ Corregir a la IA
    </button>
    {abierta && !verDatos && (
      <Ventana titulo="Corregir a la IA" onCerrar={cerrar}>
        <div className="space-y-2 text-sm">
          {producto && <p className="text-xs text-neutral-500 truncate">{producto}</p>}
          <div className="rounded-lg bg-neutral-50 px-3 py-2"><p className="text-[11px] text-neutral-400">{tipo === 'preguntas' ? 'Preguntó' : 'Escribió'}</p><p className="text-neutral-900 whitespace-pre-wrap">{texto}</p></div>
          <div className="rounded-lg bg-sky-50 px-3 py-2"><p className="text-[11px] text-sky-700">Respondió la IA</p><p className="text-neutral-800 whitespace-pre-wrap">{ia}</p></div>
        </div>
        {estado === 'listo' && aprendido ? (
          <div className="space-y-2">
            {aprendido.producto || aprendido.regla ? <>
              <p className="text-sm font-medium text-green-800">✓ Aprendido. La IA lo usa desde la próxima respuesta.</p>
              {aprendido.producto && (
                <div className="rounded-lg border border-green-100 bg-green-50/60 px-3 py-2 text-sm">
                  <p className="text-[11px] text-green-800">Dato de este producto</p>
                  <p className="text-neutral-800">{aprendido.producto}</p>
                  {itemId && <button type="button" onClick={() => setVerDatos(true)} className="mt-1 text-xs text-sky-700 hover:underline">Ver, editar o borrar los datos de esta publicación</button>}
                </div>
              )}
              {aprendido.regla && (
                <div className="rounded-lg border border-green-100 bg-green-50/60 px-3 py-2 text-sm">
                  <p className="text-[11px] text-green-800">Regla para todas las respuestas</p>
                  <p className="text-neutral-800">{aprendido.regla}</p>
                  <p className="mt-1 text-[11px] text-neutral-500">Se edita en Mi IA → Información extra → «Correcciones de mi equipo».</p>
                </div>
              )}
            </> : (
              <p className="text-sm text-neutral-700">Ya lo tenía anotado o no había nada fijo para recordar: no guardé nada nuevo.
                {itemId && <> <button type="button" onClick={() => setVerDatos(true)} className="text-sky-700 hover:underline">Ver los datos de esta publicación</button></>}</p>
            )}
            <div className="flex justify-end"><button type="button" onClick={cerrar} className="btn-primary text-sm">Listo</button></div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-900" htmlFor="corregir-ia">¿Cómo la hubieras respondido tú?</label>
            <textarea id="corregir-ia" value={correccion} onChange={e => setCorreccion(e.target.value)} rows={4} maxLength={800} autoFocus
              placeholder="Responde como tú hubieses respondido esta pregunta, para que la IA aprenda cómo lo haces…"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-300" />
            <p className="text-[11px] text-neutral-500">Tip: escribe la respuesta correcta completa. La IA saca de ahí lo que es de este producto (material, medidas, compatibilidad) y lo que vale para todas. No pongas precios ni teléfonos: esos no se guardan.</p>
            {error && <p className="text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={cerrar} className="btn-ghost text-sm">Cancelar</button>
              <button type="button" onClick={guardar} disabled={correccion.trim().length < 3 || estado === 'aprendiendo'} className="btn-primary text-sm">
                {estado === 'aprendiendo' ? 'Aprendiendo…' : 'Guardar'}</button>
            </div>
          </div>
        )}
      </Ventana>
    )}
    {abierta && verDatos && itemId && <VentanaDatos itemId={itemId} titulo={producto} onCerrar={() => setVerDatos(false)} />}
  </>
}
