@echo off
rem Deja el despertador arrancando minimizado en la barra de tareas cada vez que se inicia sesion en Windows (acceso directo
rem en la carpeta Inicio del usuario: no necesita administrador) y lo arranca ya. Doble clic.
rem Para quitarlo: borrar "Despertador Pagos ME" de shell:startup (Win+R).
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup') + '\Despertador Pagos ME.lnk');" ^
  "$s.TargetPath = 'powershell.exe';" ^
  "$s.Arguments = '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0despertador.ps1\"';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.WindowStyle = 7;" ^
  "$s.Save()"
if errorlevel 1 (
  echo.
  echo No se pudo crear el acceso directo de inicio.
  pause
  exit /b 1
)
rem Si ya habia uno corriendo (otra instalacion), se cierra para no quedar dos.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*despertador.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
start "Despertador Pagos ME" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0despertador.ps1"
echo.
echo Listo: el despertador quedo corriendo (minimizado en la barra de tareas) y arranca solo al iniciar Windows.
echo Revisa en el sistema (Pagos ME) que diga "PC en espera".
pause
