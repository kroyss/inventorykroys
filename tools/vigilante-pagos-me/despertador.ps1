# Despertador del Vigilante Pagos MercadoEnvios (uso interno).
#
# Arranca solo al iniciar sesion en Windows (instalar-despertador.cmd) y queda como un icono junto al
# reloj, como el Reportador y el vigilante del Radar: verde = en espera, azul = trayendo pagos,
# rojo = sin conexion con el sistema. Pasar el mouse muestra el estado; clic derecho: Ver registro / Salir.
# Cada minuto le pregunta SOLO al sistema si alguien toco "Traer pagos y guias". Si hay pedido, abre
# Chrome en el portal con cada perfil que todavia no lo hizo; la extension trabaja y cierra su ventana
# sola. Chrome queda cerrado el resto del tiempo.
# Configuracion: despertador.json (misma carpeta). Registro: despertador.log (misma carpeta).

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$dir = $PSScriptRoot
$log = Join-Path $dir 'despertador.log'
function Anotar($texto) {
  $linea = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $texto"
  Add-Content -Path $log -Value $linea -Encoding UTF8
  # El registro no crece sin fin: quedan las ultimas 500 lineas.
  $l = Get-Content $log -Encoding UTF8
  if ($l.Count -gt 600) { $l | Select-Object -Last 500 | Set-Content $log -Encoding UTF8 }
}

# Un solo despertador a la vez (si ya hay uno, este se va).
$unico = New-Object System.Threading.Mutex($false, 'Local\DespertadorPagosME')
if (-not $unico.WaitOne(0)) { exit 0 }

$cfg = Get-Content (Join-Path $dir 'despertador.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$chrome = $cfg.chrome
if (-not $chrome -or -not (Test-Path $chrome)) {
  $chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
              "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
              "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $chrome) {
  Anotar 'No se encontro chrome.exe: ponlo en "chrome" dentro de despertador.json'
  [System.Windows.Forms.MessageBox]::Show('No se encontro Chrome. Revisa "chrome" en despertador.json.', 'Despertador Pagos ME') | Out-Null
  exit 1
}

# Icono junto al reloj: circulo de color con "ME"
function Icono($color) {
  $bmp = New-Object System.Drawing.Bitmap 32, 32
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $color), 1, 1, 30, 30)
  $f = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $g.DrawString('ME', $f, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 0, 32, 32), $fmt)
  $g.Dispose()
  [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}
$ICONOS = @{
  espera  = Icono ([System.Drawing.Color]::FromArgb(22, 163, 74))
  trabajo = Icono ([System.Drawing.Color]::FromArgb(37, 99, 235))
  error   = Icono ([System.Drawing.Color]::FromArgb(220, 38, 38))
}

$bandeja = New-Object System.Windows.Forms.NotifyIcon
$bandeja.Icon = $ICONOS.espera
$bandeja.Text = 'Despertador Pagos ME: arrancando'
$bandeja.Visible = $true
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$menu.Items.Add('Ver registro', $null, { Start-Process notepad.exe $log }) | Out-Null
$menu.Items.Add('Salir', $null, {
  Anotar 'Cerrado a mano (Salir)'
  $bandeja.Visible = $false
  [System.Windows.Forms.Application]::Exit()
}) | Out-Null
$bandeja.ContextMenuStrip = $menu
$bandeja.add_DoubleClick({ Start-Process notepad.exe $log })

function Estado($cual, $texto) {
  $bandeja.Icon = $ICONOS[$cual]
  # El texto del icono admite hasta 63 caracteres.
  $t = "Pagos ME: $texto"
  $bandeja.Text = $t.Substring(0, [Math]::Min(63, $t.Length))
}

$headers = @{ 'x-vigilante-clave' = $cfg.clave; 'x-perfil' = 'DESPERTADOR' }
$url = "$($cfg.servidor.TrimEnd('/'))/api/pagos-me/vigilante/despertador"
$script:abiertos = @{}      # "pedido|perfil" ya abiertos: cada perfil se abre una sola vez por pedido
$script:errores = 0

function Revisar {
  try {
    $r = Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 30
    if ($script:errores -gt 0) { Anotar 'Conexion con el sistema recuperada'; $script:errores = 0 }
    if ($r.pedido) {
      $faltan = @($cfg.perfiles | Where-Object { $r.hechos -notcontains $_.perfil })
      if ($faltan.Count) { Estado 'trabajo' "trayendo pagos (pedido $($r.pedido))" } else { Estado 'espera' "en espera - ultimo pedido listo $(Get-Date -Format 'HH:mm')" }
      foreach ($p in $faltan) {
        $k = "$($r.pedido)|$($p.perfil)"
        if ($script:abiertos.ContainsKey($k)) { continue }
        Anotar "Pedido $($r.pedido): abro Chrome con $($p.perfil) ($($p.carpeta))"
        Start-Process -FilePath $chrome -ArgumentList @("--profile-directory=`"$($p.carpeta)`"", 'https://www.mercadoenvios.com.ve/vendedor/orden#vigilante')
        $script:abiertos[$k] = $true
        Start-Sleep -Seconds 3
      }
    } else {
      Estado 'espera' "en espera (revisado $(Get-Date -Format 'HH:mm'))"
    }
  } catch {
    $script:errores++
    Estado 'error' "sin conexion con el sistema"
    # Se anota el primero y luego uno cada 30 (sin internet no llena el registro).
    if ($script:errores -eq 1 -or $script:errores % 30 -eq 0) { Anotar "Error al consultar el sistema: $($_.Exception.Message)" }
  }
}

Anotar "Arranca el despertador (Chrome: $chrome)"
$reloj = New-Object System.Windows.Forms.Timer
$reloj.Interval = 60000
$reloj.add_Tick({ Revisar })
$reloj.Start()
Revisar
[System.Windows.Forms.Application]::Run()
$bandeja.Dispose()
