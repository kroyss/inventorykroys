'use client'
import { useEffect, useState } from 'react'
import Link from '@/components/ui/Link'
import { useConfirm } from '@/components/ui/ConfirmProvider'

// Inicio → «Primeros pasos con tu inventario» (14-11, el dueño: piloto del formato de aprendizaje nuevo, en vez de
// videos). Compacta: muestra SOLO el paso en el que vas («Paso 2 de 6»), con su explicación corta y el botón para ir;
// al completarlo pasa sola al siguiente (/api/inventario/primeros-pasos se marca con lo que la empresa ya hizo).
// «Ver todos» despliega la lista. Al terminar, felicita y recomienda leer Publicaciones y Reportes en Aprendizaje
// (recomendación: no cuenta para terminar). «Ocultar» pide confirmar y se vuelve a abrir desde Aprendizaje.
// Textos = docs/ayuda/sistema.md (mantener iguales).
interface Estado { ml: boolean; productos: boolean; stock: boolean; venta: boolean; procesada: boolean; compra: boolean; oculta: boolean; conML: boolean
  conPeso?: boolean; sin_peso?: number; peso_por_revisar?: number }
interface Paso { k: string; titulo: string; como: string; href: string; ir: string; hecho: boolean }
const VISTA = 'guia-inventario-vista'
export const MANUAL_INVENTARIO = '/aprendizaje/manual/inventario'

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
        : 'En Productos toca + Producto: nombre, costo y % de ganancia con el medidor (el precio se calcula solo).',
    },
    // 14-11: el peso decide el envío gratis y lo que ML te cobra de envío (tabla de MercadoEnvíos).
    ...(e.conPeso ? [{
      k: 'peso', titulo: e.sin_peso ? `Pon el peso de tus productos (faltan ${e.sin_peso})` : 'Pon el peso de tus productos',
      hecho: e.productos && !e.sin_peso, href: '/productos/mercadoenvios', ir: 'Ir a MercadoEnvíos',
      como: 'El peso decide si el producto tiene envío gratis y cuánto te cobra ML de envío. En Productos → MercadoEnvíos toca «Traer pesos de ML»: los que no tienen peso toman el de su publicación (revísalos en «Por revisar»); los que falten, escríbelos a mano.',
    }] : []),
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
  const confirmar = useConfirm()
  const [e, setE] = useState<Estado | null>(null)
  const [todos, setTodos] = useState(false)
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
  const idx = lista.findIndex(p => !p.hecho)
  const actual = lista[idx]

  // Empresas que ya trabajaban con todo hecho no ven nada: el «Listo» sale solo a quien vio la guía con pasos pendientes.
  let vista = false
  try { vista = localStorage.getItem(VISTA) === '1'; if (!todo) localStorage.setItem(VISTA, '1') } catch { /* sin almacenamiento */ }
  if (todo && !vista) return null

  const ocultar = async (preguntar: boolean) => {
    if (preguntar && !await confirmar({
      title: 'Ocultar la guía', confirmText: 'Ocultar',
      message: 'Deja de verse en el Inicio para toda tu empresa. La puedes volver a abrir cuando quieras desde Aprendizaje → Manuales.',
    })) return
    setCerrando(true)
    try { await fetch('/api/inventario/primeros-pasos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ocultar: true }) }) } catch { /* igual se oculta ahora */ }
    setE({ ...e, oculta: true })
  }

  if (todo) return (
    <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-emerald-900">Listo: ya usas tu inventario completo</p>
        <p className="text-sm text-emerald-800">
          Te recomendamos leer cómo funcionan <Link href={`${MANUAL_INVENTARIO}#publicaciones`} className="font-medium underline">Publicaciones</Link> y{' '}
          <Link href={`${MANUAL_INVENTARIO}#reportes`} className="font-medium underline">Reportes</Link> en el manual.
        </p>
      </div>
      <button type="button" onClick={() => ocultar(false)} disabled={cerrando} className="btn-secondary shrink-0 text-sm">Cerrar guía</button>
    </div>
  )

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm" aria-label="Primeros pasos con tu inventario">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            <span className="font-medium text-neutral-700">Primeros pasos · Paso {idx + 1} de {lista.length}</span>
            <span className="flex items-center gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={lista.length} aria-valuenow={hechos} aria-label={`${hechos} de ${lista.length} listos`}>
              {lista.map((p, i) => (
                <span key={p.k} title={p.titulo}
                  className={`h-1.5 rounded-full transition-all ${p.hecho ? 'w-4 bg-emerald-500' : i === idx ? 'w-6 bg-neutral-900' : 'w-4 bg-neutral-200'}`} />
              ))}
            </span>
          </div>
          <p className="mt-1 font-semibold text-neutral-900">{actual.titulo}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-neutral-600">{actual.como}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <Link href={actual.href} className="btn-primary whitespace-nowrap px-4 text-sm">{actual.ir} →</Link>
          <div className="flex items-center gap-3 text-xs">
            <button type="button" onClick={() => setTodos(v => !v)} aria-expanded={todos} className="text-neutral-500 hover:text-neutral-800">
              {todos ? 'Ocultar lista' : 'Ver todos'}
            </button>
            <button type="button" onClick={() => ocultar(true)} disabled={cerrando} className="text-neutral-400 hover:text-neutral-700">Ocultar</button>
          </div>
        </div>
      </div>
      {todos && (
        <ol className="grid gap-x-6 gap-y-1.5 border-t border-neutral-100 px-4 py-3 text-sm sm:grid-cols-2">
          {lista.map((p, i) => (
            <li key={p.k} className="flex items-center gap-2">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${p.hecho ? 'bg-emerald-500 text-white' : i === idx ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-500'}`} aria-hidden>
                {p.hecho ? '✓' : i + 1}
              </span>
              {p.hecho
                ? <span className="truncate text-neutral-400 line-through decoration-neutral-300">{p.titulo}</span>
                : <Link href={p.href} className="truncate text-neutral-800 hover:underline">{p.titulo}</Link>}
            </li>
          ))}
          <li className="flex items-center gap-2 sm:col-span-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-neutral-300 text-[11px] text-neutral-400" aria-hidden>+</span>
            <span className="text-neutral-500">Recomendado: conoce <Link href={`${MANUAL_INVENTARIO}#publicaciones`} className="text-sky-700 hover:underline">Publicaciones</Link> y <Link href={`${MANUAL_INVENTARIO}#reportes`} className="text-sky-700 hover:underline">Reportes</Link> en el manual (no hace falta para terminar)</span>
          </li>
        </ol>
      )}
    </section>
  )
}
