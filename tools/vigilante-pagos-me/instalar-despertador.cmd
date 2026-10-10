@echo off
rem Registra el despertador para que arranque escondido cada vez que se inicia sesion en Windows
rem y lo arranca ya. Doble clic (no hace falta administrador). Para quitarlo:
rem   schtasks /delete /tn "Despertador Pagos ME" /f
schtasks /create /tn "Despertador Pagos ME" /sc onlogon /rl limited /f /tr "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%~dp0despertador.ps1\""
if errorlevel 1 (
  echo.
  echo No se pudo registrar. Prueba con clic derecho ^> Ejecutar como administrador.
  pause
  exit /b 1
)
schtasks /run /tn "Despertador Pagos ME"
echo.
echo Listo: el despertador quedo corriendo y arranca solo al iniciar Windows.
echo Revisa en el sistema (Pagos ME) que diga "PC en espera".
pause
