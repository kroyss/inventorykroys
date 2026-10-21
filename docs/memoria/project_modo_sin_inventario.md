---
name: modo-sin-inventario
description: "Empresas \"todo desde MercadoLibre\" (módulo inventario apagado): oferta de entrada para Fundadores; inventario como paso 2 y posible plus gratis."
metadata:
  node_type: memory
  type: project
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-12T10:13:33.775Z
---

Decidido con el dueño el 2026-10-03: de entrada a todos los Fundadores se les ofrece **Herramientas** (sin inventario): solo Automatizaciones, y Despachos arma las etiquetas con las ventas de ML (título, variante, cantidad, notas de ML; las notas NO se editan en el sistema, se escriben en ML). Quien responda en el formulario "¿Te interesaría llevar también tu inventario?" → "Sí, desde el inicio" recibe el sistema completo. Durante el mes se ofrece integrar inventario (idea a evaluar: gratis para Fundadores como plus). Visión de niveles: Herramientas · Herramientas+Inventario · +Radar.

Implementado como módulo `inventario` (migración 056; empresas previas lo tienen prendido). Regla del dueño: lo nuevo se adapta a lo existente, nada de lo que ya funciona (lotes, manifiesto, jornadas, Reportador) cambia. En VE no hay carrito de compras (una etiqueta = una venta).

**Actualizado 2026-10-06:** cambio de regla: TODOS los Fundadores (también los que dijeron "Sí, desde el inicio") arrancan solo con Automatizaciones; Inventario se activa a mano después de terminar la serie de videos de Automatizaciones, en la sesión de configuración. Aprendizaje tiene dos series (migración 072): Automatizaciones (todos) e Inventario (solo con el módulo; aún sin videos). Ojo al activarlo: Despachos pasa a exigir la venta cargada en Ventas.

**Actualizado 2026-10-12 (plan Inventario simple):** NO es un interruptor Simple/Completo. El "completo" es el sistema muy personalizado del dueño y nunca será para clientes. Plan: el Inventario simple de los Fundadores es la base común; lo del dueño se va ajustando de a poco hacia esa base cuando una diferencia se pueda unificar. Las ideas de los usuarios no entran a la base salvo que sean generales. "Importar productos desde ML" es SOLO para el ingreso al sistema (carga inicial, también para el dueño). Después el flujo es al revés: el producto nuevo entra por Compras y luego se publica en ML y se vincula.

**Why:** quitar fricción en la entrada (mucha gente solo quiere herramientas rápidas) y acortar la configuración.
**How to apply:** cualquier cambio en Despachos/Calificaciones debe mantener los dos caminos (ventas del sistema vs ventas de ML). Ver [[programa-fundadores]].
