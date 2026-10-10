# Despertador del Vigilante Pagos MercadoEnvios (uso interno).
#
# Corre minimizado en la barra de tareas desde que se inicia sesion en Windows (instalar-despertador.cmd),
# como el Reportador y el vigilante del Radar: abrir la ventana muestra lo que va haciendo. Cada minuto le
# pregunta SOLO al sistema si alguien toco "Traer pagos y guias". Si hay pedido, abre Chrome en el
# portal con cada perfil que todavia no lo hizo; la extension trabaja y cierra su ventana sola.
# Chrome queda cerrado el resto del tiempo. Configuracion: despertador.json (misma carpeta).
# Registro: despertador.log (misma carpeta).

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$dir = $PSScriptRoot
$log = Join-Path $dir 'despertador.log'
$Host.UI.RawUI.WindowTitle = 'Despertador Pagos ME (no cerrar)'
function Anotar($texto) {
  $linea = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $texto"
  Write-Host $linea
  Add-Content -Path $log -Value $linea -Encoding UTF8
  # El registro no crece sin fin: quedan las ultimas 500 lineas.
  $l = Get-Content $log -Encoding UTF8
  if ($l.Count -gt 600) { $l | Select-Object -Last 500 | Set-Content $log -Encoding UTF8 }
}

$cfg = Get-Content (Join-Path $dir 'despertador.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$chrome = $cfg.chrome
if (-not $chrome -or -not (Test-Path $chrome)) {
  $chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
              "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
              "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $chrome) { Anotar 'No se encontro chrome.exe: ponlo en "chrome" dentro de despertador.json'; exit 1 }

$headers = @{ 'x-vigilante-clave' = $cfg.clave; 'x-perfil' = 'DESPERTADOR' }
$url = "$($cfg.servidor.TrimEnd('/'))/api/pagos-me/vigilante/despertador"
$abiertos = @{}      # "pedido|perfil" ya abiertos: cada perfil se abre una sola vez por pedido
$errores = 0

Anotar "Arranca el despertador (Chrome: $chrome)"
Write-Host 'Cada minuto pregunta al sistema si alguien toco "Traer pagos y guias". Minimizar esta ventana, no cerrarla.'
$ultimoEstado = ''
while ($true) {
  try {
    $r = Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 30
    if ($errores -gt 0) { Anotar 'Conexion con el sistema recuperada'; $errores = 0 }
    # En la ventana: una linea cuando cambia el estado (sin llenarla cada minuto).
    $estado = if ($r.pedido) { "pedido $($r.pedido)" } else { 'en espera' }
    if ($estado -ne $ultimoEstado) { Write-Host "$(Get-Date -Format 'HH:mm')  Conectado al sistema: $estado"; $ultimoEstado = $estado }
    if ($r.pedido) {
      foreach ($p in $cfg.perfiles) {
        $k = "$($r.pedido)|$($p.perfil)"
        if ($abiertos.ContainsKey($k) -or ($r.hechos -contains $p.perfil)) { continue }
        Anotar "Pedido $($r.pedido): abro Chrome con $($p.perfil) ($($p.carpeta))"
        Start-Process -FilePath $chrome -ArgumentList @("--profile-directory=`"$($p.carpeta)`"", 'https://www.mercadoenvios.com.ve/vendedor/orden#vigilante')
        $abiertos[$k] = $true
        Start-Sleep -Seconds 5
      }
    }
  } catch {
    $errores++
    # Se anota el primero y luego uno cada 30 (sin internet no llena el registro).
    if ($errores -eq 1 -or $errores % 30 -eq 0) { Anotar "Error al consultar el sistema: $($_.Exception.Message)" }
  }
  Start-Sleep -Seconds 60
}
