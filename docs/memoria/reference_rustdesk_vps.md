---
name: reference-rustdesk-vps
description: Servidor RustDesk propio (version libre) en el VPS Contabo, /opt/rustdesk, montado 2026-10-01
metadata:
  type: reference
---

RustDesk servidor propio en el VPS 85.239.249.43: `/opt/rustdesk/docker-compose.yml` (contenedores `rustdesk_hbbs` + `rustdesk_hbbr`, network_mode host, imagen oficial `rustdesk/rustdesk-server`). Clave publica en `/opt/rustdesk/data/id_ed25519.pub` (no borrar `data/`: si se pierde, hay que reconfigurar todas las PCs). Puertos 21115-21119 (21116 tambien UDP). El VPS no tiene firewall activo (ufw inactive, INPUT ACCEPT).

Clientes: Configuracion -> Red -> Servidor ID = IP del VPS, Relay = IP del VPS, Key = contenido de id_ed25519.pub.
