---
name: project-idea-recordatorio-calificacion
description: "Idea aparcada 14-10-2026 (pedido de Beto/BUYBOOK_SHOP): recordatorio automático para que el comprador califique; diseño acordado y datos medidos; NO implementar hasta que lo pida"
metadata:
  node_type: memory
  type: project
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-14T21:32:05.052Z
---

Aparcada el 2026-10-14 ("no implementaré eso de momento").

**Datos medidos (prod, ml_ordenes.cal_recibida_at):** en MLV el comprador califica dentro de ~7 días DESDE LA COMPRA (corte brusco: día 7 = 103, día 8 = 9). ~75% de compradores nunca califica (todas las empresas). Más mensajes no dan más calificaciones: BUYBOOK_SHOP manda ~14 msj/venta y califican 23% vs 29% del dueño (7 msj).

**Diseño acordado si se retoma:** automático, apagado por defecto, UNA vez el día 5 desde la compra (día 6 última oportunidad), solo si: el vendedor ya calificó concretada+positiva, comprador no calificó, no cancelada, sin mensajes del comprador sin responder; con Despachos además guía impresa (sin Despachos no se sabe el envío: la API MLV no lo da). Texto neutro con link `https://feedback.mercadolibre.com.ve/feedback?orderId={venta}`; marca "Calificación pedida el dd/mm"; aviso de ≥3 días de espera si usa calificación automática. Vive en Mensajes, no en Calificaciones.

**How to apply:** no implementar hasta que lo pida; ver [[feedback-esperar-autorizacion]].
