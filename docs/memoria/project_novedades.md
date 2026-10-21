---
name: project-novedades
description: "Novedades (mig 095): REGLA del dueño 16-10 — todo cambio que noten los Fundadores se carga como borrador en la central de Novedades al subirlo a prod, para que no se pase; lo propio (inventario, Pagos ME, Promociones) no va"
metadata:
  node_type: memory
  type: project
  originSessionId: 56a20790-2efc-4087-b3a0-110491340e4d
  modified: 2026-10-18T15:12:50.267Z
---

En producción desde el 2026-10-16 (commit 9b0bde1, migración 095). Tabla global `novedades` (fecha, titulo, texto, modulo NULL = todas, enlace, publicada_at NULL = borrador) y `users.novedades_vistas_at`. Megáfono de trazo junto al libro de Aprendizaje (components/layout/NovedadesNav.tsx); en el celular "Más → Novedades" (/novedades). Las 11 primeras (semana del 12 al 16-10) ya están publicadas. Editor: Plataforma → Interno → Novedades (borradores arriba, publicadas plegadas).

**Regla (pedida por el dueño el 16-10):** cada vez que suba a PRODUCCIÓN algo que noten los Fundadores, en ese mismo paso insertar la novedad como BORRADOR (`INSERT INTO novedades (fecha, titulo, texto, modulo, enlace)` sin publicada_at) y decírselo en el cierre: "dejé el borrador X en Novedades". El dueño revisa y publica.

**Qué cuenta como "lo notan los Fundadores":** lo del espacio Automatizaciones y lo común: Preguntas, Mensajes, Calificaciones/Reputación, Stock, Despachos, Reportador, Mis avisos/Telegram, Aprendizaje, la barra/menús, login/sesión, Pagos ME solo si se lo activaron. Poner `modulo` para que lo vea solo quien lo tiene (preguntas, alertas_stock, despachos, reportador…; NULL = todas).

**Qué NO va:** lo exclusivo del dueño o con inventario (Productos, Promociones, Compras, Ventas, Ajustes, Pagos ME mientras ningún cliente lo tenga), Plataforma, arreglos internos que no se ven.

**Estilo:** título = la sección; texto de 1–2 líneas en tú, qué cambió y para qué; enlace a la pantalla.
Reiterado 18-10: mensajes SIMPLES y cortos, solo lo que le sirva al usuario general (nada técnico ni detalles de colores/marcos). Si un cambio toca dos secciones, una sola novedad corta que nombre las dos.

**Decidido 16-10:** el aviso automático de fin de prueba (resumen, últimos 3 días) NO se anuncia como novedad.

Ver [[feedback-cambio-todos-o-solo-yo]], [[project-idea-bot-telegram]].
