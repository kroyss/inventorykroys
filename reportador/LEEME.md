# Reportador conectado

Programa de escritorio que le escribe a cada comprador su guía ZOOM en MercadoLibre.
Toma la cola **directo del sistema** (Despachos → jornadas cerradas) y devuelve el
resultado de cada mensaje apenas lo envía.

Queda en la **bandeja** (junto al reloj) esperando órdenes: desde Despachos → Reportador
se toca **▶ Reportar** en el equipo, o se marca "Reportar solo al cerrar la jornada", y el
programa arranca solo. El avance se ve en la web y desde ahí se puede detener. Reemplaza al Reportador viejo con CSV
(`D:\Script Etiquetas Venezuela\main_reportador.py`, que NO se tocó).

## Archivos

| Archivo | Qué es |
|---|---|
| `motor.py` | Envío por Selenium. **Copiado de main_reportador.py**: humanización, pausas, detección de chat bloqueado y de rechazo, caja vacía. No cambiar tiempos sin motivo: son la estrategia anti-bot. |
| `corrida.py` | Lógica de `run_cuenta`: por cuenta, pausas, cortacircuito, reintento. Informa cada resultado al instante. |
| `servidor.py` | API del sistema + datos locales (`%APPDATA%\SyncsoraReportador`). |
| `app.py` | Ventana (tkinter), ícono de bandeja (pystray) y consulta de órdenes cada 30 s. |

## Compilar el instalador

```bash
powershell -ExecutionPolicy Bypass -File reportador\instalador\construir.ps1
```

Arma el `.exe` con PyInstaller y después el instalador con Inno Setup 6
(`winget install JRSoftware.InnoSetup`). Resultado: **`reportador\dist\InstalarReportador-<versión>.exe`**,
un solo archivo para el cliente. Al sacar una versión nueva, subir `AppVersion` en
`instalador\ReportadorConectado.iss` y `VERSION` en `servidor.py`.

El instalador:
- revisa que esté Google Chrome (si no, ofrece la descarga oficial y no sigue);
- instala por usuario, sin pedir administrador, en `%LOCALAPPDATA%\Programs\SyncsoraReportador`;
- crea accesos directos (escritorio y menú Inicio) y el desinstalador de Windows;
- con "Iniciar con Windows" (marcado por defecto) arranca escondido en la bandeja al
  encender el equipo (`--bandeja`), para que el botón de la web siempre tenga a quién avisarle;
- al actualizar (instalar encima) cierra el programa y reemplaza la carpeta interna entera;
- NO borra los datos (`%APPDATA%\SyncsoraReportador`, perfiles de Chrome) al actualizar ni al
  desinstalar: la vinculación y las sesiones de ML se conservan.

No hay CSV ni carpetas que preparar: la cola viene del sistema.

## Primer uso en un equipo

1. Ejecutar `InstalarReportador-<versión>.exe` → Siguiente → Instalar. Si Windows avisa
   "Windows protegió su PC": *Más información → Ejecutar de todas formas* (el programa aún no está firmado).
2. En el sistema (admin): Despachos → Reportador → **+ Vincular equipo** → aparece un código.
3. Abrir el Reportador (se abre solo al terminar la instalación) y escribir el código.
4. Por cada cuenta: **Iniciar sesión en ML** (una vez) o **Usar perfil existente…** para
   apuntar a un perfil que ya tenga la sesión (en mote: `C:/selenium_profile_soluciones`
   y `C:/selenium_profile_marcos`).

## Órdenes desde el sistema

- El programa, en espera, pregunta cada 30 s `GET /api/reportador/orden`. Si hay una orden
  la toma y reporta. Cerrar la ventana solo lo esconde; **Salir** está en el menú del ícono.
- Una sola copia: abrirlo otra vez (p.ej. desde el escritorio) muestra la que ya está en la bandeja.
- "Reportar ahora" en el programa también queda registrado como orden (se ve y se detiene en la web).
- Una orden que nadie toma en 12 h **vence** (no se dispara a destiempo si el equipo estuvo apagado).
- Si el programa se cierra a mitad, su orden queda **INTERRUMPIDA**; lo no enviado sigue en la cola.
- **Detener** desde la web corta después del mensaje en curso.
- El equipo necesita una **sesión de Windows iniciada** (Chrome usa los perfiles del usuario):
  en un equipo dedicado, configurar inicio de sesión automático y no bloquear la sesión.

## Reglas de la cola

- Entran los envíos **impresos** de jornadas **cerradas**, que no sean reimpresiones.
- `ENVIADO` y `SIN_CHAT` son finales. `RECHAZADO` y `ERROR` vuelven a la cola.
- Cada equipo **reserva** lo que toma (2 h): dos PCs no le escriben dos veces al mismo comprador.
- Si no hay internet al informar un resultado, se guarda en el equipo y la próxima corrida
  **no arranca** hasta informarlo (si no, ese envío volvería como pendiente y se repetiría).
- Bajar el CSV para el Reportador viejo marca esos envíos como `CSV`: el conectado ya no los toma.

## Pruebas

`python app.py --simular` no abre Chrome ni escribe a nadie. Solo funciona contra un
servidor local (`localhost`), porque informa como ENVIADO mensajes que no se mandaron.

## Envíos Tealca (versión 1.2.0)

El sistema le entrega a cada envío su `carrier` (ZOOM o TEALCA) y la guía que hay que mandar: para
Tealca es la **guía final** (la que escribe el asistente en Despachos → Guías Tealca), nunca la
pre-guía de la etiqueta. El mensaje es el mismo de las plantillas cambiando ZOOM por TEALCA
(`para_tealca()` en `corrida.py`; espejo en `lib/reportador.ts`). Hay que instalar la 1.2.0 en los
equipos: con la 1.1.0 un envío Tealca saldría diciendo "ZOOM".

