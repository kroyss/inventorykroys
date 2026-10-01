import { NextResponse } from 'next/server'

// Notificaciones de MercadoLibre (DevCenter → "Notificaciones callbacks URL").
// ML exige un 200 rápido o reintenta (hasta 5 veces en 1 hora). Por ahora solo se acusa
// recibo: las preguntas entran por el cron de cada minuto. Cuando se activen los tópicos
// (Questions, Orders, Messages), aquí se dispara la sincronización de la cuenta al instante.
export async function POST() {
  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
