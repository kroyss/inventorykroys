# Arma el instalador del Reportador en un paso:
#   1. PyInstaller -> dist\ReportadorConectado\ (exe + _internal_reportador_conectado)
#   2. Inno Setup  -> dist\InstalarReportador-<version>.exe  (UN solo archivo para el cliente)
#
# Uso:  powershell -ExecutionPolicy Bypass -File reportador\instalador\construir.ps1
# Requiere: Python con las librerías del Reportador, PyInstaller e Inno Setup 6
#           (winget install JRSoftware.InnoSetup).
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot          # ...\reportador
Push-Location $raiz
try {
    python -m PyInstaller --noconfirm --clean ReportadorConectado.spec
    if ($LASTEXITCODE -ne 0) { throw 'PyInstaller falló' }

    $iscc = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $iscc) { throw 'No se encontró Inno Setup 6 (ISCC.exe). Instálalo: winget install JRSoftware.InnoSetup' }

    & $iscc (Join-Path $PSScriptRoot 'ReportadorConectado.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Inno Setup falló' }

    Get-ChildItem (Join-Path $raiz 'dist') -Filter 'InstalarReportador-*.exe' |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1 |
        ForEach-Object { "Instalador listo: $($_.FullName)  ($([math]::Round($_.Length/1MB,1)) MB)" }
} finally {
    Pop-Location
}
