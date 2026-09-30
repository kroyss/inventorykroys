// Entorno de la instalación. `APP_ENV=staging` = copia de pruebas (staging.*): lleva
// datos copiados de producción, así que todo lo que sale hacia personas reales queda
// apagado (hoy: el Reportador, que le escribe a compradores reales de MercadoLibre).
export const ES_STAGING = process.env.APP_ENV === 'staging'

export const MENSAJE_STAGING_REPORTADOR =
  'Esta es la copia de pruebas (staging): el Reportador está desactivado para no escribirle a compradores reales.'
