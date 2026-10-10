# Arma el instalador del Vigilante Pagos ME: tools\vigilante-dist\InstalarVigilantePagosME-<version>.exe
# Uso: powershell -ExecutionPolicy Bypass -File tools\vigilante-pagos-me\instalador\construir.ps1
# Requiere Inno Setup 6 (winget install JRSoftware.InnoSetup). Al sacar version nueva: AppVersion en
# VigilantePagosME.iss y "version" en ..\manifest.json.
$ErrorActionPreference = 'Stop'
$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'No se encontro Inno Setup 6 (ISCC.exe). Instalalo: winget install JRSoftware.InnoSetup' }
& $iscc (Join-Path $PSScriptRoot 'VigilantePagosME.iss')
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup fallo' }
Get-ChildItem (Join-Path $PSScriptRoot '..\..\vigilante-dist') -Filter 'InstalarVigilantePagosME-*.exe' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1 |
  ForEach-Object { "Instalador listo: $($_.FullName)  ($([math]::Round($_.Length/1KB)) KB)" }
