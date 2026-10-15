'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useConfirm } from '@/components/ui/ConfirmProvider'

// Plataforma → Interno: los avisos por Telegram se prueban primero en la organización de la
// plataforma; este interruptor los abre a todas las empresas (Fundadores).
export default function AvisosTelegramCard() {
  const confirmar = useConfirm()
  const [d, setD] = useState<{ configurado: boolean; abierto: boolean; conectados: { propios: number; clientes: number } } | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    fetch('/api/plataforma/avisos-telegram').then(r => r.ok ? r.json() : null).then(setD).catch(() => {})
  }, [])

  const cambiar = async () => {
    if (!d) return
    const abrir = !d.abierto
    if (abrir && !await confirmar({
      title: 'Abrir avisos por Telegram a todos',
      message: 'Todos los usuarios de todas las empresas verán "Mis avisos" en el menú de su cuenta y podrán conectar su Telegram.',
      confirmText: 'Abrir a todos',
    })) return
    setGuardando(true)
    const r = await fetch('/api/plataforma/avisos-telegram', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ abierto: abrir }) })
    if (r.ok) setD({ ...d, abierto: abrir })
    setGuardando(false)
  }

  if (!d) return null
  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-neutral-900">Avisos por Telegram</h3>
        <p className="text-sm text-neutral-500">
          {!d.configurado ? 'El bot no está configurado en este servidor (falta TELEGRAM_BOT_TOKEN).'
            : d.abierto ? 'Abiertos a todas las empresas.' : 'Solo tu organización (en prueba). Los clientes todavía no los ven.'}
          {d.configurado && <> · Conectados: <b className="text-neutral-800">{d.conectados.propios}</b> de tu equipo
            {d.abierto && <>, <b className="text-neutral-800">{d.conectados.clientes}</b> de clientes</>}.</>}
          {' '}<Link href="/mis-avisos" className="text-sky-700 hover:underline underline-offset-2">Mis avisos</Link>
        </p>
      </div>
      {d.configurado && (
        <button onClick={cambiar} disabled={guardando} className={d.abierto ? 'btn-secondary text-sm' : 'btn-primary text-sm'}>
          {guardando ? 'Guardando…' : d.abierto ? 'Volver a solo mi organización' : 'Abrir a todas las empresas'}
        </button>
      )}
    </section>
  )
}
