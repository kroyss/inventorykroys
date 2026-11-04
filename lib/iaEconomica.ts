// Versión económica EN PARALELO (04-11-2026). El dueño: "llevar historial simulando cómo hubiesen sido las respuestas
// económicas, para evaluar mañana la diferencia y el ahorro". Meta: el precio de la competencia (Mercasist cobra
// $0,01 por respuesta) con la efectividad que traemos.
// Corre en el cron DESPUÉS de la IA real, sobre la misma pregunta, y NO publica nada: guarda en ml_preguntas.ia_auto.eco
// qué habría respondido, si habría salido sola y cuánto habría costado. Se compara en Preguntas → Configuración.
// La receta:
//   1. Sin IA: si la respuesta rápida sugerida contesta toda la pregunta (el revisor ya la confirmó), esa es la respuesta.
//   2. Si no, pedirBorradorEconomico (lib/preguntas.ts): Haiku con contexto chico; Sonnet solo para las técnicas.
// Mismas reglas para salir sola que la real (motivosRevisar). Su gasto va a ia_uso con módulo 'simulacion' (no usa
// créditos del cliente).
import type { Pool } from 'pg'
import { pedirBorradorEconomico, type Contexto } from '@/lib/preguntas'
import { sugerenciasPara } from '@/lib/sugerenciasServidor'
import { costoDe, registrarUso } from '@/lib/ia'

export interface DecisionEco {
  via: 'plantilla' | 'ia'; decision: 'sola' | 'revisar'; motivos: string[]; respuesta: string; confianza: string
  modelo: string; costo: number; entrada: number; salida: number; ms: number; fecha: string
  marca?: 'bien' | 'mal' | null; error?: string
}

// El revisor de sugeridas (Haiku, lib/revisorSugeridas.ts) cuesta ~$0,003 y corre igual al abrir la bandeja: se cuenta
// para no comparar contra un "gratis" que no es.
const COSTO_REVISOR = 0.003

export async function simularEconomica(db: Pool, c: Contexto, itemEstado: string | null,
  motivosRevisar: (b: { respuesta: string; confianza: string; falta_dato: string | null; verificacion: string | null }, estado: string | null, pregunta: string) => string[]): Promise<DecisionEco> {
  const t0 = Date.now()
  const id = String(c.pregunta.id)
  const { rows: [q] } = await db.query(
    `SELECT item_id, item_precio::float, item_moneda, item_estado FROM ml_preguntas WHERE id = $1`, [c.pregunta.id])
  // 1 · La respuesta rápida, si el revisor confirmó que contesta todas las partes (con una frase agregada, no: esa la
  //     lee una persona).
  const { sugeridas } = await sugerenciasPara(db, [{ id, texto: c.pregunta.texto, item_id: q.item_id, item_precio: q.item_precio,
    item_moneda: q.item_moneda, item_estado: q.item_estado }])
  const s = sugeridas.get(id)
  if (s?.revisada && !s.sin_confirmar) {
    const motivos = motivosRevisar({ respuesta: s.texto, confianza: 'alta', falta_dato: null, verificacion: 'ok' }, itemEstado, c.pregunta.texto)
    return { via: 'plantilla', decision: motivos.length ? 'revisar' : 'sola', motivos, respuesta: s.texto, confianza: 'alta',
      modelo: `respuesta rápida «${s.titulo}»`, costo: COSTO_REVISOR, entrada: 0, salida: 0, ms: Date.now() - t0, fecha: new Date().toISOString() }
  }
  // 2 · La IA con la receta económica.
  const b = await pedirBorradorEconomico(c)
  await registrarUso(db, 'simulacion', b.llamadas, null)
  const motivos = motivosRevisar(b, itemEstado, c.pregunta.texto)
  const suma = (f: (u: (typeof b.llamadas)[number]['uso']) => number) => b.llamadas.reduce((a, l) => a + f(l.uso), 0)
  return {
    via: 'ia', decision: motivos.length ? 'revisar' : 'sola', motivos, respuesta: b.respuesta, confianza: b.confianza,
    modelo: b.modelo, costo: b.llamadas.reduce((a, l) => a + costoDe(l.modelo, l.uso, l.lote), 0),
    entrada: suma(u => (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)),
    salida: suma(u => u.output_tokens ?? 0), ms: Date.now() - t0, fecha: new Date().toISOString(),
  }
}
