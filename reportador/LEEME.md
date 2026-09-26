# Reportador conectado

Programa de escritorio que le escribe a cada comprador su guía ZOOM en MercadoLibre.
Toma la cola **directo del sistema** (Despachos → jornadas cerradas) y devuelve el
resultado de cada mensaje apenas lo envía. Reemplaza al Reportador viejo con CSV
(`D:\Script Etiquetas Venezuela\main_reportador.py`, que NO se tocó).

## Archivos

| Archivo | Qué es |
|---|---|
| `motor.py` | Envío por Selenium. **Copiado de main_reportador.py**: humanización, pausas, detección de chat bloqueado y de rechazo, caja vacía. No cambiar tiempos sin motivo: son la estrategia anti-bot. |
| `corrida.py` | Lógica de `run_cuenta`: por cuenta, pausas, cortacircuito, reintento. Informa cada resultado al instante. |
| `servidor.py` | API del sistema + datos locales (`%APPDATA%\SyncsoraReportador`). |
| `app.py` | Ventana (tkinter). |

## Compilar

```bash
python -m PyInstaller --noconfirm --clean ReportadorConectado.spec
```

Se copia **toda** la carpeta `dist\ReportadorConectado\` (el `.exe` + `_internal_reportador_conectado`).

## Primer uso en un equipo

1. En el sistema (admin): Despachos → Reportador → **+ Vincular equipo** → aparece un código.
2. Abrir `ReportadorConectado.exe` y escribir el código.
3. Por cada cuenta: **Iniciar sesión en ML** (una vez) o **Usar perfil existente…** para
   apuntar a un perfil que ya tenga la sesión (en mote: `C:/selenium_profile_soluciones`
   y `C:/selenium_profile_marcos`).

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
