---
name: project-programa-fundadores
description: "Programa Fundadores en producción desde 2026-10-02: elcomerciantedigital.com (raíz) → /fundadores; 2 \"Rondas\" (5 y 15) con días de inscripción; nginx solo expone esa página."
metadata:
  node_type: memory
  type: project
  originSessionId: a3260b08-018f-42ca-943c-936ff26e8bd4
  modified: 2026-10-02T02:38:16.718Z
---

Programa Fundadores (20 pioneros desde 2026-10-07: Ronda 1 = 5 cupos de sondeo, Ronda 2 = 15 —antes 10—; el dueño la agrandó porque los 5 de la Ronda 1 arrancaron flojos y quiere que al menos 5-8 usen el sistema; 1 mes gratis) está en producción desde 2026-10-02 (migración 043). Los no elegidos en la Ronda 1 siguen "Por revisar" y compiten en la 2 sin reinscribirse. Entrada por defecto: modo sin inventario, ver [[modo-sin-inventario]].

- Página pública: https://elcomerciantedigital.com → 302 a /fundadores. www → raíz (301). Gestión: app.elcomerciantedigital.com → Plataforma → Fundadores.
- nginx `/etc/nginx/sites-available/elcomerciantedigital.com` + `snippets/ecd_proxy.conf` (→ inventory_ecd :8504): solo expone /fundadores, /api/fundadores, /_next/ y archivos estáticos; cualquier otra ruta 302 a la portada (elcomerciantedigital.com/), por pedido del usuario. SSL certbot (cert `elcomerciantedigital.com`).
- En la UI se dicen "Ronda 1/2" (el usuario eligió Ronda sobre Tanda/Ciclo); en código y base siguen siendo `tanda` (`fundadores_tandas`). OJO: `ronda` en la base/código es otra cosa (la convocatoria completa, `RONDA_ACTUAL`).
- Ronda 2 (decidido 08-10): 15 + 5 en lista de espera (estado `espera`, incluye no seleccionados de la Ronda 1); plazo para conectar hasta dom 18 (si no, el cupo pasa a la espera, que se confirma lun 19); el mes gratis arranca al conectar o a más tardar el 18 (Ronda 1 sin conectar movida al 18; DIAS_ESPERA_CONEXION=5). Formulario: vendedor/gestor/marketing (marketing descarta), cuándo activaría, Telegram o Instagram (al menos uno), casilla de compromiso (migración 074). Fechas en lib/fundadores.ts (FECHA_*).
- Seleccionados en la página: solo el @ de Telegram, sin nombres (pedido 07-10).
- Inscripción solo en `inscribe_desde..inscribe_hasta` (hora Caracas): Ronda 1 = 4–5 oct, Ronda 2 = 11–12 oct; seleccionados se avisan al día siguiente (6 y 13) por Telegram, a mano.
- "Saber qué vender" suma 0 pero marca "📡 Interés Radar" (público potencial del Radar, ver [[project-comerciantedigital-multiempresa]]).

**Why:** primer canal de captación de clientes de El Comerciante Digital; el Radar tendrá un embudo parecido después.
**How to apply:** cambios de fechas/cupos desde Plataforma (no SQL); probar en staging abriendo la ronda temporalmente (`inscribe_desde` = hoy) y restaurar.

Desde 2026-10-02 (migraciones 044–047, en producción): clientes vs propietario.
- `organizaciones.estado` propietario/prueba/activo/vencido + `prueba_hasta` + `fundador` (lib/cuenta.ts); la prueba vence sola por fecha y el login avisa.
- Módulos solo del dueño (apagados para clientes): stock_ml, descuento_ml, importaciones, analisis_stock (+ bonos, finanzas, facturas). Lo de la plataforma: lib/funcionesInternas.ts; Plataforma → Interno muestra consumo de IA por empresa.
- Clientes VE: exceso ML manual (protección cambiaria, arranca en el diferencial del día), sin descuento. Categorías de ganancia solo con su % en TODAS las empresas.

**Corte automático (2026-10-16, decidido con el dueño):** `lib/fundadoresCorte.ts`, desde el cron de preguntas: el lunes 19-10 a las 7:00 (Caracas) pasa a `vencido` a los Fundadores en prueba creados hasta el 18-10 (Ronda 1, Ronda 2 y altas de la lista de espera con el mismo plazo, p. ej. Maikel creado el 16-10) SIN ninguna cuenta de ML conectada (incluye CHEVRO CHACAO de la Ronda 1), una sola vez (`plataforma_ajustes` key `fundadores_corte_2026-10-19`), y manda la lista por Telegram a los admins de la org 1. Las altas posteriores al 18-10 no se tocan. El 16-10 eran 12 sin conectar.
