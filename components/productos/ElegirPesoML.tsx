// Sus publicaciones vinculadas pesan distinto en MercadoEnvíos (13-11-2026): en vez de escribir a mano se elige uno de los
// pesos que trae ML con un clic. Si ninguno es el correcto, revisar el vínculo o marcar el pack («trae N u.»).
export default function ElegirPesoML({ pesos, actual, onElegir, ocupado = false }: {
  pesos: number[]; actual: string | number | null; onElegir: (kg: number) => void; ocupado?: boolean
}) {
  const act = actual == null || actual === '' ? null : Number(actual)
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px] text-amber-800">
      <span title="Sus publicaciones vinculadas pesan distinto en MercadoEnvíos">Pesos en ML:</span>
      {pesos.map(kg => (
        <button key={kg} type="button" disabled={ocupado} onClick={() => onElegir(kg)}
          className={`rounded border px-1.5 py-0.5 font-medium transition-colors disabled:opacity-50
            ${act === kg ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-amber-200 bg-white hover:bg-amber-50'}`}
          title={act === kg ? 'Es el peso actual' : `Usar ${kg} kg`}>
          {kg} kg
        </button>
      ))}
    </div>
  )
}
