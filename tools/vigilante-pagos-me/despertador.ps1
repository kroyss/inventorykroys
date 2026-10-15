# Despertador de Pagos MercadoEnvios (el "vigilante"). Desde la 1.3.0 se conecta con el codigo corto de
# Pagos ME y encuentra solo los perfiles de Chrome que tienen la extension.
#
# Arranca solo al iniciar sesion en Windows (instalar-despertador.cmd) y queda como un icono junto al
# reloj, como el Reportador y el vigilante del Radar: verde = en espera, azul = trayendo pagos,
# rojo = sin conexion con el sistema. Pasar el mouse muestra el estado; clic derecho: Ver registro / Salir.
# Cada minuto le pregunta SOLO al sistema si alguien toco "Traer pagos y guias". Si hay pedido, abre
# Chrome en el portal con cada perfil que todavia no lo hizo; la extension trabaja y cierra su ventana
# sola. Chrome queda cerrado el resto del tiempo.
# Configuracion y registro: %APPDATA%\VigilantePagosME (los deja el instalador y no se borran al
# actualizar); si no existe, despertador.json/.log junto a este archivo (instalacion a mano).

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$dir = Join-Path $env:APPDATA 'VigilantePagosME'
if (-not (Test-Path (Join-Path $dir 'despertador.json'))) { $dir = $PSScriptRoot }
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

$cfgRuta = Join-Path $dir 'despertador.json'
$cfg = Get-Content $cfgRuta -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $cfg.servidor) { $cfg | Add-Member -NotePropertyName servidor -NotePropertyValue 'https://app.elcomerciantedigital.com' -Force }
$servidor = $cfg.servidor.TrimEnd('/')
$basica = $null
if ($cfg.basica) { $basica = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($cfg.basica)) }

# Conectar con el codigo corto de Pagos ME (1.3.0): el instalador lo deja en "codigo"; aqui se cambia por
# la clave de esta PC (una sola vez) y el codigo se borra del archivo.
if (($cfg.clave -notmatch '^me_[0-9a-f]{48}$') -and $cfg.codigo) {
  try {
    $h = @{}
    if ($basica) { $h.Authorization = $basica }
    $r = Invoke-RestMethod -Method Post -Uri "$servidor/api/pagos-me/vigilante/vincular" -Headers $h -ContentType 'application/json' `
      -Body (@{ codigo = [string]$cfg.codigo } | ConvertTo-Json) -TimeoutSec 30
    $cfg | Add-Member -NotePropertyName clave -NotePropertyValue $r.clave -Force
    $cfg.PSObject.Properties.Remove('codigo')
    $cfg | ConvertTo-Json -Depth 5 | Set-Content $cfgRuta -Encoding UTF8
    Anotar 'PC conectada con el codigo de Pagos ME'
  } catch {
    $msg = $_.ErrorDetails.Message
    Anotar "No se pudo conectar con el codigo: $msg $($_.Exception.Message)"
    [System.Windows.Forms.MessageBox]::Show("No se pudo conectar la PC con el codigo.`n`n$msg`n`nGenera un codigo nuevo en Pagos ME (Conectar una PC) y vuelve a instalar el programa.", 'Pagos MercadoEnvios') | Out-Null
    exit 1
  }
}
if ($cfg.clave -notmatch '^me_[0-9a-f]{48}$') {
  Anotar 'Falta conectar la PC: instala de nuevo con el codigo de Pagos ME (Conectar una PC)'
  [System.Windows.Forms.MessageBox]::Show('Falta conectar la PC. Genera un codigo en Pagos ME (Conectar una PC) y vuelve a instalar el programa.', 'Pagos MercadoEnvios') | Out-Null
  exit 1
}

# Perfiles de Chrome (1.3.0): si despertador.json no los trae, se buscan solos los que tienen la extension
# (su carpeta aparece en las preferencias del perfil). Se vuelven a buscar cada 10 min por si se agrega otra.
$userData = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
function DetectarPerfiles {
  $res = @()
  $carpetas = @('Default')
  try {
    $estado = Get-Content (Join-Path $userData 'Local State') -Raw -Encoding UTF8 | ConvertFrom-Json
    $carpetas = @($estado.profile.info_cache.PSObject.Properties.Name)
  } catch { }
  foreach ($c in $carpetas) {
    $hay = $false
    # Instalada desde la Chrome Web Store: Extensions\<id>\<version>\manifest.json con nuestro nombre.
    $exts = Join-Path (Join-Path $userData $c) 'Extensions'
    if (Test-Path $exts) {
      foreach ($m in Get-ChildItem $exts -Filter manifest.json -Recurse -Depth 2 -ErrorAction SilentlyContinue) {
        $txt = Get-Content $m.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        if ($txt -and $txt.Contains('Asistente de env') -and $txt.Contains('mercadoenvios.com.ve')) { $hay = $true; break }
      }
    }
    # Cargada a mano ("Cargar descomprimida"): su carpeta aparece en las preferencias del perfil.
    if (-not $hay) {
      foreach ($f in 'Secure Preferences', 'Preferences') {
        $ruta = Join-Path (Join-Path $userData $c) $f
        if (-not (Test-Path $ruta)) { continue }
        $txt = Get-Content $ruta -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        if ($txt -and ($txt.Contains('VigilantePagosME') -or $txt.Contains('vigilante-pagos-me'))) { $hay = $true; break }
      }
    }
    if ($hay) { $res += [pscustomobject]@{ perfil = $null; carpeta = $c } }
  }
  return $res
}
$autoPerfiles = (-not $cfg.perfiles) -or (@($cfg.perfiles).Count -eq 0)
$script:detectados = @()
$script:detectadosAt = [datetime]::MinValue
function Perfiles {
  if (-not $autoPerfiles) { return @($cfg.perfiles) }
  if (((Get-Date) - $script:detectadosAt).TotalMinutes -ge 10) {
    $script:detectados = @(DetectarPerfiles)
    $script:detectadosAt = Get-Date
    if ($script:detectados.Count -eq 0) { Anotar 'Ningun perfil de Chrome tiene la extension todavia (agregala y escribe el codigo en ella)' }
    else { Anotar "Perfiles de Chrome con la extension: $(($script:detectados | ForEach-Object { $_.carpeta }) -join ', ')" }
  }
  return $script:detectados
}

$chrome = $cfg.chrome
if (-not $chrome -or -not (Test-Path $chrome)) {
  # ProgramW6432 = "Program Files" real aunque este PowerShell sea de 32 bits (ahi el ProgramFiles
  # apunta a "(x86)" y un Chrome de 64 bits no aparece). Ultimo recurso: App Paths del registro.
  $chrome = @("$env:ProgramW6432\Google\Chrome\Application\chrome.exe",
              "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
              "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
              "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $chrome) {
    foreach ($k in 'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
                   'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
                   'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe') {
      $v = (Get-ItemProperty $k -ErrorAction SilentlyContinue).'(default)'
      if ($v -and (Test-Path $v.Trim('"'))) { $chrome = $v.Trim('"'); break }
    }
  }
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
if ($basica) { $headers.Authorization = $basica }
$url = "$servidor/api/pagos-me/vigilante/despertador"
$script:abiertos = @{}      # "pedido|carpeta" ya abiertos: cada perfil se abre una sola vez por pedido
$script:errores = 0

function Revisar {
  try {
    $r = Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 30
    if ($script:errores -gt 0) { Anotar 'Conexion con el sistema recuperada'; $script:errores = 0 }
    if ($r.pedido) {
      # Con nombre (despertador.json a mano) se saltan los que ya lo hicieron; los detectados solos se
      # abren una vez por pedido (si ya lo habian hecho, la extension cierra la ventana enseguida).
      $faltan = @(Perfiles | Where-Object { (-not $_.perfil) -or ($r.hechos -notcontains $_.perfil) })
      $porAbrir = @($faltan | Where-Object { -not $script:abiertos.ContainsKey("$($r.pedido)|$($_.carpeta)") })
      if ($autoPerfiles) {
        if ($porAbrir.Count) { Estado 'trabajo' "trayendo pagos (pedido $($r.pedido))" } else { Estado 'espera' "en espera - pedido $($r.pedido) en curso o listo" }
      } elseif ($faltan.Count) { Estado 'trabajo' "trayendo pagos (pedido $($r.pedido))" } else { Estado 'espera' "en espera - ultimo pedido listo $(Get-Date -Format 'HH:mm')" }
      foreach ($p in $porAbrir) {
        $k = "$($r.pedido)|$($p.carpeta)"
        $quien = if ($p.perfil) { $p.perfil } else { 'el perfil' }
        Anotar "Pedido $($r.pedido): abro Chrome con $quien ($($p.carpeta))"
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
