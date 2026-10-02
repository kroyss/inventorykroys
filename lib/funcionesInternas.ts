// Lo que SOLO ve el dueño de la plataforma (esDuenoPlataforma), nunca un cliente.
//
// Es la lista para no olvidar qué está escondido y por qué; se muestra en Plataforma → Interno.
// OJO: las funciones que se le van liberando a cada cliente NO van aquí: son MÓDULOS
// (lib/modulos.ts) y se prenden por empresa en Plataforma → Empresas (p. ej. Stock en ML).
// Aquí va solo lo que es de la plataforma en sí.

export interface FuncionInterna {
  nombre: string
  donde: string
  motivo: string
  desde: string          // AAAA-MM-DD
}

export const FUNCIONES_INTERNAS: FuncionInterna[] = [
  {
    nombre: 'Medidor "IA este mes"', donde: 'Preguntas y Mensajes (encabezado)',
    motivo: 'En la fase Fundadores la plataforma paga la IA. El consumo de cada empresa se ve en Plataforma → Interno.',
    desde: '2026-10-02',
  },
  {
    nombre: 'Plataforma', donde: 'Menú de la cuenta',
    motivo: 'Empresas, cuentas, Fundadores y lo interno.', desde: '2026-09-30',
  },
  {
    nombre: 'Actualizar las tasas (BCV / paralelo / TRM)', donde: 'Ajustes y Dashboard',
    motivo: 'Las tasas son comunes a todas las empresas: el cliente las ve pero no las cambia.', desde: '2026-09-30',
  },
]
