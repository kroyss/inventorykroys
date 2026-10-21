---
name: feedback-cambio-todos-o-solo-yo
description: "Ante CADA cambio al sistema, preguntar/decidir si aplica a todas las empresas (clientes incluidos) o solo a la empresa del dueño (módulo apagado para clientes)."
metadata:
  node_type: memory
  type: feedback
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-12T10:06:21.905Z
---

Desde 2026-10-02 el sistema es multiempresa con clientes (Fundadores y luego pagos). Todo cambio que el dueño pida (p. ej. algo en Ventas) hay que plantearlo explícitamente: **¿aplica para todos o solo para él?**

- "Solo para mí" (particularidades de su forma de trabajar) → va como **módulo** en `lib/modulos.ts`, prendido en las empresas de su organización (SolucionesMC, org 1, estado `propietario`) y apagado para los clientes; se libera por cliente en Plataforma → Empresas. No como un `if` escondido por organización.
- "Para todos" → cambio normal del núcleo, pensando en una empresa nueva sin sus datos.
- Lo que es de la plataforma en sí (nunca para clientes) → `lib/funcionesInternas.ts` + `esDuenoPlataforma`.

**Una sola base, nunca dos versiones (2026-10-12, al planear inventario para Fundadores):** el dueño quiere que con el tiempo SolucionesMC y los clientes trabajen igual: Ventas, Compras, Dashboard… son LAS MISMAS pantallas/APIs; los clientes solo tienen menos opciones (apagadas por módulo/ajuste). El "Inventario simple" SÍ le gusta, pero como MODO sobre el mismo núcleo (mismas tablas/APIs/pantallas, menos pasos y opciones visibles; se puede pasar a completo sin migrar), nunca como inventario aparte ni pantallas duplicadas: una actualización se hace en un solo lugar. Lo nuevo para clientes (p. ej. importar productos desde ML) se construye en el núcleo y también le sirve a él.

**Why:** los clientes tienen el mismo sistema pero el dueño irá teniendo cosas propias (descuento ML, importaciones, análisis de stock, bonos, finanzas, facturas…) y otras que sí incluyan a todos; mezclarlo rompe a los clientes o le quita cosas a él.
**How to apply:** antes de implementar, decir en una línea si lo considero general o solo suyo (y por qué) y confirmarlo si no es obvio. Relacionado: [[project-programa-fundadores]], [[feedback-staging-primero]].
