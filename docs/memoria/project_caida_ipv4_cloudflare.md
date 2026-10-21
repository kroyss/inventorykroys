---
name: project-caida-ipv4-cloudflare
description: "20-10 ~16:10: la IPv4 del VPS (85.239.249.43) quedó inaccesible desde todo el mundo (SSH, 443, 80, ping); el servidor seguía vivo. Se puso elcomerciantedigital.com en Cloudflare Proxied y volvió"
metadata:
  type: project
---

**Incidente 2026-10-20 ~16:10 (hora del servidor):** nadie llegaba directo a 85.239.249.43 (ni SSH, ni web, ni ping) desde Venezuela, Miami ni Frankfurt; pero Cloudflare sí llegaba (inventory.syncsora.com/api respondía la app). Diagnóstico: red IPv4 de Contabo caída, servidor y app bien.

**Arreglo de emergencia (lo hizo el dueño en el panel de Cloudflare, cuenta Contrerasmarcos):** registros A de elcomerciantedigital.com (app, @, radar, staging; www CNAME) pasaron de "DNS only" a **Proxied**. SSL: Automatic → Full. La web volvió a las 16:34.

**Pendientes:**
- SSH sigue sin entrar por IPv4: sin acceso no se puede desplegar. Commit 542fb28 (Fundadores: IP real desde `cf-connecting-ip`) está en importar-ml SIN desplegar.
- Cuando Contabo arregle: verificar arranque, decidir con el dueño si se queda Proxied (si se queda: cuidado con lógica por IP; uploads ≤100 MB; programas de la PC y webhooks de ML/Telegram pasan por Cloudflare).
