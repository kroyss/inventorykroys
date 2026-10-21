---
name: project-idea-extension-guias
description: "Pendiente (07-10-2026): extensión de Chrome para bajar en lote las guías PDF del portal MercadoEnvíos VE (hoy se bajan una a una)"
metadata:
  node_type: memory
  type: project
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-08T00:23:42.573Z
---

Idea aparcada el 07-10-2026 (el usuario tenía pocos tokens esa semana; retomar cuando lo pida).

- El portal MercadoEnvíos VE no permite bajar en lote; cada guía se baja a mano. La API pública de ML no da envío ni guía en MLV ([[project-despacho-ml-api]]).
- Las URLs de guía son del tipo `mercadoenvios.com.ve/api/v1/resources/guides/AAAA/MM/DD/<venta>/<uuid>.pdf`: el portal tiene una API interna, pero el uuid no se puede adivinar, hay que sacarlo de la lista que muestra el portal.
- Opción recomendada: extensión de Chrome que corre en la sesión del vendedor (sin guardar claves) y baja todas las guías de la lista con un botón; luego, quizá, que las suba directo a Despachos. Nada de robot en el servidor con claves de clientes: riesgo de inhabilitación de la cuenta (términos de Envíos ML) y es frágil.
- Primero solo para la operación del dueño, como experimento aparte ([[feedback-no-tocar-lo-que-funciona]]).

**How to apply:** al retomar, pedir captura de la lista de envíos del portal (datos tapados), cuántas guías por jornada y si hay filtros. No abrir URLs reales de guías: tienen datos de compradores.
