---
name: project-idea-bot-telegram
description: "Avisos por Telegram (@ComercianteDigitalAvisosBot): EN PRODUCCIÓN desde 15-10-2026 (mig 089, Mis avisos, al instante, contradictorias); solo la organización del dueño; Fundadores con el interruptor de Plataforma"
metadata:
  node_type: memory
  type: project
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-15T03:07:24.920Z
---

**Estado 2026-10-14:** bot **@ComercianteDigitalAvisosBot** creado desde una 2.ª cuenta de Telegram del dueño (2.º chip), porque su cuenta personal quedó LIMITADA por spam indefinidamente (escribió en privado a ganadores de Fundadores con link; queja al supervisor enviada vía @SpamBot). Token ya rotado (/revoke) y guardado por el usuario en el VPS: `/root/telegram_bot.env` (`TELEGRAM_BOT_TOKEN=…`, chmod 600). Nunca leerlo ni mostrarlo; verificar solo formato/getMe.

**Alcance acordado (avisos que ML NO da, cada usuario elige en su menú → "Mis avisos"):**
- cuenta ML desconectada; pregunta sin responder tras X min; mensaje de comprador sin responder tras X min; **calificación negativa recibida** (neutral opcional; dato en ml_ordenes.cal_recibida); resumen diario a la hora elegida (incluye "lo que hizo el sistema").
- Horario de silencio, botón "mandar aviso de prueba", solo lo de su empresa y sus permisos. Vincular con deep link t.me/bot?start=CÓDIGO.
- **Primero solo la organización del dueño (él, Wilmer, José)**; Fundadores después, con un interruptor en Plataforma.
- Avisar cada pregunta/mensaje nuevo = opcional (duplica la app de ML). Etapa 2: responder desde Telegram.
- Falta en el sistema: deep links `/preguntas?pregunta=ID` y `/mensajes?venta=…`.

**Why:** valor = multi-cuenta, empleados y avisos que ML no da. Respuestas automáticas descartadas por el dueño (datos: solo ~7% de preguntas son genéricas).

**Construido 2026-10-15 (staging, rama importar-ml):** migración 089 (telegram_usuarios, avisos_enviados, usuario_empresas.avisos), lib/telegram.ts, lib/avisosTelegram.ts (lo llama el cron de preguntas), /mis-avisos (menú de la cuenta), Plataforma → Interno: interruptor "Abrir a todas las empresas" (plataforma_ajustes.avisos_telegram_abierto). Conexión por getUpdates (sin webhook; staging y prod comparten la cola, cada uno guarda su último update y se confirma lo de >10 min). Descripción del bot puesta por API.
**Para subir a prod:** backup + `089` en inventory_db/inventory; agregar TELEGRAM_BOT_TOKEN a /opt/inventory_next/.env.production desde /root/telegram_bot.env (sin mostrarlo); deploy. Prod responde a mensajes sueltos al bot; staging no.

**How to apply:** staging primero; prod solo con su OK. Relacionado: [[project-programa-fundadores]].

**Pendiente para el 2026-10-16 (decidido 15-10):** el dueño espera ver cómo se comportan los avisos hoy y temprano mañana. Mañana, con su OK: (1) subir a producción el commit 2419d41 (rama importar-ml, NO está en main: resumen y cierre con "🚚 guías sin reportar al comprador" y, a los admins, "⏳ fin de la prueba gratis" los últimos 3 días); (2) abrir los avisos a los Fundadores (Plataforma → Interno, `avisos_telegram_abierto`; hoy cerrado: solo org 1, 2 personas conectadas); (3) recién ahí repartir el flyer (prompt ya entregado: pasos tu nombre → Mis avisos → Conectar Telegram → Iniciar).

**16-10: ABIERTO a los Fundadores** (`avisos_telegram_abierto` = true) y en producción 2419d41 (guías sin reportar + fin de prueba). Mensaje de invitación y prompt del flyer ya entregados. Pendiente: créditos de IA y vencimiento de suscripción paga.

**16-10:** el resumen de la mañana del dueño de la plataforma (admin org 1, empresa VE) trae "👥 Clientes por vencer": pruebas que vencen en ≤3 días o vencieron hace ≤3 días, con ✅ si a ellos les llega el aviso (admin con Telegram y resumen prendido) o ⚠️ sin Telegram. No se anuncia en Novedades.
