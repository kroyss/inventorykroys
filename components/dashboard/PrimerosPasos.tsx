'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/ui/Link'

// Inicio → «Primeros pasos con tu inventario» (14-11, el dueño: piloto del formato de aprendizaje nuevo, en vez de
// videos). Lista con el avance que se marca sola (/api/inventario/primeros-pasos), un botón «Ir» por paso y un
// «¿Cómo?» de pocas líneas. Al completar todo felicita y se puede cerrar; «Ocultar guía» queda guardado por empresa.
// Reemplaza a la sugerencia «Empieza tu inventario desde MercadoLibre». Textos = docs/ayuda/sistema.md (mantener iguales).
interface Estado { ml: boolean; productos: boolean; stock: boolean; venta: boolean; procesada: boolean; compra: boolean; oculta: boolean; conML: boolean }
const VISTA = 'guia-inventario-vista'
interface Paso { k: string; titulo: string; como: string; href: string; ir: string; hecho: boolean }

function pasos(e: Estado): Paso[] {
  return [
    ...(e.conML ? [{
      k: 'ml', titulo: 'Conecta tu cuenta de MercadoLibre', hecho: e.ml, href: '/cuentas-ml', ir: 'Conectar',
      como: 'Así tus productos salen de tus publicaciones y las ventas de ML llegan solas para registrarlas. Toca Conectar, entra con tu cuenta de ML y acepta.',
    }] : []),
    {
      k: 'productos', titulo: 'Crea tus productos', hecho: e.productos,
      href: e.conML ? '/productos/importar-ml' : '/productos?new=1', ir: e.conML ? 'Crear desde ML' : 'Crear producto',
      como: e.conML
        ? 'En «Importar desde ML» marcas tus publicaciones (o cada color/modelo) y pones su costo: cada una queda como un producto ya vinculado. También puedes crearlos a mano con + Producto.'
        : 'En Productos toca + Producto: nombre, costo y categoría de ganancia (el precio se calcula solo).',
    },
    {
      k: 'stock', titulo: 'Pon el stock que tienes hoy', hecho: e.stock, href: '/inventario', ir: 'Ir a Inventario',
      como: 'En Inventario, en cada producto toca Ajustar y escribe cuántas unidades tienes. De ahí en adelante el stock baja con las ventas y sube con las compras.',
    },
    {
      k: 'venta', titulo: 'Registra tu primera venta', hecho: e.venta,
      href: e.conML ? '/ventas?vista=confirmar' : '/ventas?new=1', ir: e.conML ? 'Por confirmar' : 'Nueva venta',
      como: e.conML
        ? 'En Ventas → Por confirmar aparecen tus ventas de MercadoLibre: confirma cada una y queda registrada con sus productos. Las ventas por fuera de ML se cargan con Nueva venta.'
        : 'En Ventas toca Nueva venta, elige los productos y las cantidades, y guarda.',
    },
    {
      k: 'compra', titulo: 'Carga tu primera compra', hecho: e.compra, href: '/compras?new=1', ir: '+ Compra',
      como: 'Cuando te llega mercancía, en Compras toca + Compra: proveedor, productos, cantidades y costo. Al recibirla, el stock sube solo.',
    },
    {
      k: 'numeros', titulo: 'Mira cuánto ganas', hecho: e.procesada, href: '/ventas', ir: 'Ir a Ventas',
      como: 'Cuando una venta queda procesada, aquí en el Inicio ves tus ventas, costos y ganancia del período, los más vendidos y qué reponer. El detalle con Excel está en Reportes.',
    },
  ]
}

export default function PrimerosPasos() {
  const [e, setE] = useState<Estado | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState(false)

  useEffect(() => {
    let vivo = true
    fetch('/api/inventario/primeros-pasos', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(j => { if (vivo && j) setE(j) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  if (!e || e.oculta) return null
  const lista = pasos(e)
  const hechos = lista.filter(p => p.hecho).length
  const todo = hechos === lista.length
  const siguiente = lista.find(p => !p.hecho)?.k
  const ocultar = async () => {
    setCerrando(true)
    try { await fetch('/api/inventario/primeros-pasos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ocultar: true }) }) } catch { /* igual se oculta ahora */ }
    setE({ ...e, oculta: true })
  }

  // Empresas que ya trabajaban con todo hecho no ven nada: el «Listo» sale solo a quien vio la guía con pasos pendientes.
  let vista = false
  try { vista = localStorage.getItem(VISTA) === '1'; if (!todo) localStorage.setItem(VISTA, '1') } catch { /* sin almacenamiento */ }
  if (todo && !vista) return null

  if (todo) return (
    <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-emerald-900">Listo: ya usas tu inventario completo</p>
        <p className="text-sm text-emerald-800">Si te queda una duda, toca Ayuda (abajo a la derecha) o mira el manual en Aprendizaje.</p>
      </div>
      <button type="button" onClick={ocultar} disabled={cerrando} className="btn-secondary shrink-0 text-sm">Cerrar guía</button>
    </div>
  )

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm" aria-label="Primeros pasos con tu inventario">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-neutral-900">Primeros pasos con tu inventario</h2>
          <p className="text-sm text-neutral-500">{hechos} de {lista.length} listos · se marcan solos a medida que avanzas</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-28 rounded-full bg-neutral-100" role="progressbar" aria-valuemin={0} aria-valuemax={lista.length} aria-valuenow={hechos}>
            <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${hechos / lista.length * 100}%` }} />
          </div>
          <button type="button" onClick={ocultar} disabled={cerrando} className="text-xs text-neutral-400 hover:text-neutral-700">Ocultar guía</button>
        </div>
      </div>
      <ol className="divide-y divide-neutral-100">
        {lista.map((p, i) => {
          const actual = p.k === siguiente
          const ver = abierto === p.k || (abierto === null && actual)
          return (
            <li key={p.k} className={actual ? 'bg-lime-50/50' : ''}>
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${p.hecho ? 'bg-emerald-500 text-white' : actual ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-500'}`} aria-hidden>
                  {p.hecho ? '✓' : i + 1}
                </span>
                <button type="button" onClick={() => setAbierto(ver ? '' : p.k)} aria-expanded={ver}
                  className={`min-w-0 flex-1 text-left text-sm ${p.hecho ? 'text-neutral-400 line-through decoration-neutral-300' : 'font-medium text-neutral-900'}`}>
                  {p.titulo}
                  <span className="sr-only">{p.hecho ? ' (listo)' : ''}</span>
                </button>
                {!p.hecho && (
                  <>
                    <button type="button" onClick={() => setAbierto(ver ? '' : p.k)} className="hidden text-xs text-neutral-500 hover:text-neutral-800 sm:inline">¿Cómo?</button>
                    <Link href={p.href} className={`${actual ? 'btn-primary' : 'btn-secondary'} shrink-0 px-3 py-1 text-xs`}>{p.ir}</Link>
                  </>
                )}
              </div>
              {ver && !p.hecho && <p className="px-4 pb-3 text-sm leading-relaxed text-neutral-600 sm:pl-[3.25rem]">{p.como}</p>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
