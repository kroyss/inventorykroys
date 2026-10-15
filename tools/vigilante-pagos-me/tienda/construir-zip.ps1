# Arma el ZIP para subir a la Chrome Web Store: tools\vigilante-dist\extension-tienda-<version>.zip
# (manifest.json en la raiz del ZIP). Uso: powershell -ExecutionPolicy Bypass -File tools\vigilante-pagos-me\tienda\construir-zip.ps1
# Al sacar version nueva: "version" en ..\manifest.json (la tienda exige que suba en cada envio).
$ErrorActionPreference = 'Stop'
$ext = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $ext 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$destino = Join-Path (Split-Path $ext -Parent) "vigilante-dist\extension-tienda-$version.zip"
if (Test-Path $destino) { Remove-Item $destino -Force }
# ZipFile a mano (no Compress-Archive): en Windows PowerShell 5.1 ese guarda las rutas con "\" y la
# tienda no encuentra los iconos. Aqui cada entrada va con "/".
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($destino, 'Create')
try {
  $archivos = @('manifest.json', 'background.js', 'opciones.html', 'opciones.js') +
    @(Get-ChildItem (Join-Path $ext 'iconos') -Filter *.png | ForEach-Object { "iconos/$($_.Name)" })
  foreach ($f in $archivos) {
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $ext $f), $f, 'Optimal')
  }
} finally { $zip.Dispose() }
"ZIP listo: $destino"
