; Instalador del Reportador de guías (Inno Setup 6).
; Compilar con construir.ps1 (arma el .exe con PyInstaller y después esto).
;
; Instala POR USUARIO (sin pedir permisos de administrador) en
; %LOCALAPPDATA%\Programs\SyncsoraReportador, crea accesos directos y el
; desinstalador de Windows. Los datos del programa (vinculación, registros, perfiles
; de Chrome) los crea el propio programa en %APPDATA% / %LOCALAPPDATA% y NO se borran
; al desinstalar ni al actualizar: reinstalar no obliga a vincular de nuevo.

#define AppName    "Reportador de guías"
#define AppVersion "1.0.0"
#define AppExe     "ReportadorConectado.exe"
#define Publisher  "Syncsora"
#define DistDir    "..\dist\ReportadorConectado"

[Setup]
AppId={{8F3C2A51-6B7E-4D2C-9A41-5E0B7C2D9F13}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
DefaultDirName={localappdata}\Programs\SyncsoraReportador
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=InstalarReportador-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
; Si el programa está abierto al actualizar, lo cierra.
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "escritorio"; Description: "Crear acceso directo en el escritorio"; GroupDescription: "Accesos directos:"

[Files]
; El .exe y su carpeta interna (_internal_reportador_conectado) van juntos, siempre.
Source: "{#DistDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
; Actualización limpia: la carpeta interna vieja se reemplaza entera.
Type: filesandordirs; Name: "{app}\_internal_reportador_conectado"

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: escritorio

[Run]
Filename: "{app}\{#AppExe}"; Description: "Abrir el Reportador ahora"; Flags: nowait postinstall skipifsilent

[Code]
// Chrome es lo único externo que necesita (el programa maneja Chrome para escribir
// en MercadoLibre). Si no está, se avisa y se ofrece la descarga oficial.
function ChromeInstalado(): Boolean;
begin
  Result :=
    RegKeyExists(HKCU, 'Software\Google\Chrome\BLBeacon') or
    RegKeyExists(HKLM, 'Software\Google\Chrome\BLBeacon') or
    FileExists(ExpandConstant('{commonpf64}\Google\Chrome\Application\chrome.exe')) or
    FileExists(ExpandConstant('{commonpf32}\Google\Chrome\Application\chrome.exe')) or
    FileExists(ExpandConstant('{localappdata}\Google\Chrome\Application\chrome.exe'));
end;

function InitializeSetup(): Boolean;
var
  Codigo: Integer;
begin
  Result := True;
  if not ChromeInstalado() then
  begin
    if MsgBox('Este programa necesita Google Chrome y no se encontró en este equipo.' + #13#10 + #13#10 +
              '¿Abrir la página de descarga de Chrome? (Instálalo y después vuelve a ejecutar este instalador.)',
              mbConfirmation, MB_YESNO) = IDYES then
      ShellExec('open', 'https://www.google.com/chrome/', '', '', SW_SHOWNORMAL, ewNoWait, Codigo);
    Result := False;
  end;
end;
