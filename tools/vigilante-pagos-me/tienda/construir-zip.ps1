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
  # 1.3.6: lo de staging queda solo en la carpeta (para cargarla a mano en pruebas); la tienda no lo lleva:
  # ni el permiso al sitio de staging ni la opcion "Staging" (el campo usuario:clave queda oculto, lo lee opciones.js).
  $limpio = @{
    'manifest.json' = { param($s) $s -replace ',\s*"https://staging\.elcomerciantedigital\.com/\*"', '' }
    'opciones.html' = { param($s)
      $s = $s -replace '(?s)<!--solo-staging--><option.*?<!--/solo-staging-->\r?\n', ''
      $s -replace '(?s)<!--solo-staging--><label>.*?<!--/solo-staging-->', '<input id="basica" type="hidden">' }
  }
  $archivos = @('manifest.json', 'background.js', 'opciones.html', 'opciones.js') +
    @(Get-ChildItem (Join-Path $ext 'iconos') -Filter *.png | ForEach-Object { "iconos/$($_.Name)" })
  foreach ($f in $archivos) {
    if ($limpio.ContainsKey($f)) {
      $texto = & $limpio[$f] ([System.IO.File]::ReadAllText((Join-Path $ext $f), [System.Text.Encoding]::UTF8))
      if ($texto -match 'staging\.elcomerciantedigital') { throw "$f todavia menciona staging" }
      $w = New-Object System.IO.StreamWriter(($zip.CreateEntry($f, 'Optimal')).Open(), (New-Object System.Text.UTF8Encoding($false)))
      try { $w.Write($texto) } finally { $w.Dispose() }
    } else {
      [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $ext $f), $f, 'Optimal')
    }
  }
} finally { $zip.Dispose() }
"ZIP listo: $destino"
