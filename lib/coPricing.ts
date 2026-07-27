// Precio de publicación de Colombia.
//
// En CO se vende en pesos y ML se queda con comisión + retención + un envío fijo
// por tramo. Publicar el precio base "pelado" (costo × markup × TRM) hace que
// todo eso salga de la ganancia: una categoría ULTRA (120%) termina rindiendo
// ~10% real. VE resuelve lo mismo con el "exceso"; CO no tenía equivalente.
//
// Acá se invierte la cascada de MlBreakdown: dado lo que querés que te QUEDE,
// devuelve el precio que hay que PUBLICAR para que quede eso.
//
//   publicado − publicado×(comisión% + retención%) − envío = objetivo
//   publicado = (objetivo + envío) / (1 − (comisión% + retención%)/100)
//
// El envío depende del umbral, que a su vez depende del precio publicado, así
// que se resuelven las dos ramas y se elige la consistente. No hay ambigüedad:
// como el envío alto siempre es mayor que el bajo, si la rama baja no cae bajo
// el umbral, la alta sí queda por encima.

export const num = (ml: Record<string, string>, k: string, d: number) => {
  const v = parseFloat(ml?.[k])
  return isNaN(v) ? d : v
}

/** Precio a publicar en ML (pesos) para que, después de ML, queden `objetivo` pesos. */
export function coPublishedPrice(objetivo: number, ml: Record<string, string>): number {
  if (!(objetivo > 0)) return 0
  const factor = 1 - (num(ml, 'ml_comision', 15.5) + num(ml, 'ml_reten', 1.91)) / 100
  if (factor <= 0) return 0

  const umbral    = num(ml, 'ml_umbral_envio', 60000)
  const envioBajo = num(ml, 'ml_envio_bajo', 2600)
  const envioAlto = num(ml, 'ml_envio_alto', 8000)

  const conEnvioBajo = (objetivo + envioBajo) / factor
  if (conEnvioBajo < umbral) return Math.round(conEnvioBajo)
  return Math.round((objetivo + envioAlto) / factor)
}
