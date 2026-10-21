---
name: project-ml-api-preguntas
description: "Módulo Preguntas ML con IA (staging, 2026-09-30) y lo que la API de ML Venezuela SÍ permite: responder, calificar y mensajear ventas"
metadata:
  node_type: memory
  type: project
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-09-30T22:39:28.871Z
---

Módulo `preguntas` (Automatizaciones → Preguntas) construido y probado en STAGING el 2026-09-30, conectado a la cuenta real PIKEKE (migración 033, lib/ml.ts, lib/preguntas.ts, lib/ventasML.ts). Pendiente pasarlo a producción (conectar cuentas allá y desconectar staging: el refresh token de ML es de un solo uso).

Verificado con la cuenta real, contra lo que se creía antes (ver [[project-despacho-ml-api]]):
- Responder preguntas por API: OK (4 respuestas ANSWERED/ACTIVE, verificadas releyendo).
- CALIFICAR compradores por API: OK (POST /orders/{id}/feedback, positiva concretada) aunque la orden figure `confirmed`+`not_paid` — en MLV todas quedan así y eso no impide calificar. El usuario había fallado muchas veces antes por otras vías.
- Mensajes post-venta por API: OK, moderación `clean`.
- Leer publicaciones exige el permiso "Publicación y sincronización" (lectura); el multiget /items?ids= da 403 PolicyAgent en MLV: pedir de a una con ?attributes=.
- Cruce publicación→producto: product_ml_codes.ml_code guarda el número SIN prefijo (MLV768007052 → 768007052).

Las acciones públicas (publicar respuesta, calificar, mensajear) las hace el USUARIO desde la pantalla con confirmación; el clasificador bloquea que Claude las dispare desde la terminal.

**How to apply:** no volver a asumir que MLV no deja calificar/mensajear por API. Siguiente idea acordada: calificación masiva sugerida por el estado de la venta en el sistema (concretada → positiva; no cargada tras X días → neutral "no concretada"), reemplazando el flujo manual (ver [[project-mensajegrupo-flujo-mensual]]); mensajes post-venta por API en vez de Selenium (Reportador).

- Trampa (01/10): ML manda solo, A NOMBRE DEL VENDEDOR, "Gracias por tu compra. El número de guía para tu envío es: X" cuando el comprador llena el formulario. No es reporte nuestro: el dedupe del Reportador por API lo excluye (`esReporteNuestro` en lib/reportadorApi.ts). Antes del fix marcó 56 como "ya tenía la guía" sin enviar; se reabrieron y enviaron.
