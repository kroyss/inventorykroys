; Instalador del Vigilante Pagos MercadoEnvios (Inno Setup 6). Compilar con construir.ps1.
;
; Instala POR USUARIO (sin administrador) en %LOCALAPPDATA%\Programs\VigilantePagosME:
;   - el despertador (despertador.ps1): arranca con Windows, icono "ME" junto al reloj;
;   - la extension de Chrome (carpeta "extension", se carga con "Cargar descomprimida" en cada perfil:
;     Chrome no deja que un instalador la meta solo).
; La clave y los perfiles se piden en una pantalla y quedan en %APPDATA%\VigilantePagosME\despertador.json
; (y en el registro, para precargarlos al actualizar): instalar encima NO los borra.

#define AppName    "Vigilante Pagos ME"
#define AppVersion "1.2.0"
#define Publisher  "El Comerciante Digital"

[Setup]
AppId={{4C1B7E2A-93D5-4F0B-8C6E-2A7D51E9B3F4}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
DefaultDirName={localappdata}\Programs\VigilantePagosME
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\vigilante-dist
OutputBaseFilename=InstalarVigilantePagosME-{#AppVersion}
SetupIconFile=vigilante.ico
UninstallDisplayIcon={app}\vigilante.ico
UninstallDisplayName={#AppName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
Source: "..\despertador.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "vigilante.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\manifest.json"; DestDir: "{app}\extension"; Flags: ignoreversion
Source: "..\background.js"; DestDir: "{app}\extension"; Flags: ignoreversion
Source: "..\opciones.html"; DestDir: "{app}\extension"; Flags: ignoreversion
Source: "..\opciones.js"; DestDir: "{app}\extension"; Flags: ignoreversion

[Icons]
; Mismo nombre que el acceso de la instalacion a mano (instalar-despertador.cmd): lo reemplaza.
Name: "{userstartup}\Despertador Pagos ME"; Filename: "powershell.exe"; \
  Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\despertador.ps1"""; \
  IconFilename: "{app}\vigilante.ico"; Flags: runminimized
Name: "{autoprograms}\{#AppName}\Despertador Pagos ME"; Filename: "powershell.exe"; \
  Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\despertador.ps1"""; \
  IconFilename: "{app}\vigilante.ico"; Flags: runminimized
Name: "{autoprograms}\{#AppName}\Ver registro"; Filename: "notepad.exe"; Parameters: """{userappdata}\VigilantePagosME\despertador.log"""
Name: "{autoprograms}\{#AppName}\Carpeta de la extension de Chrome"; Filename: "{app}\extension"

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\despertador.ps1"""; \
  Description: "Arrancar el despertador ahora"; Flags: nowait postinstall runhidden
Filename: "{app}\extension"; Description: "Abrir la carpeta de la extension (para cargarla en Chrome)"; \
  Flags: nowait postinstall shellexec unchecked

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -Command ""Get-CimInstance Win32_Process | Where-Object {{ $_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*despertador.ps1*' } | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }"""; \
  Flags: runhidden; RunOnceId: "CerrarDespertador"

[Code]
const
  CLAVE_REG = 'Software\VigilantePagosME';
var
  Pagina: TInputQueryWizardPage;

// Valor de "campo": "valor" en un JSON simple (para precargar desde una instalacion a mano).
function ValorJson(const Texto, Campo: String; Desde: Integer): String;
var
  P, Q: Integer;
  Resto: String;
begin
  Result := '';
  Resto := Copy(Texto, Desde, Length(Texto));
  P := Pos('"' + Campo + '"', Resto);
  if P = 0 then Exit;
  Resto := Copy(Resto, P + Length(Campo) + 2, Length(Resto));
  P := Pos('"', Resto);
  if P = 0 then Exit;
  Resto := Copy(Resto, P + 1, Length(Resto));
  Q := Pos('"', Resto);
  if Q = 0 then Exit;
  Result := Copy(Resto, 1, Q - 1);
end;

procedure Precargar();
var
  Json, Ruta: String;
  JsonA: AnsiString;
  P2: Integer;
  V: String;
begin
  // 1) Lo guardado por una instalacion anterior de este instalador.
  if RegQueryStringValue(HKCU, CLAVE_REG, 'clave', V) then Pagina.Values[0] := V;
  if RegQueryStringValue(HKCU, CLAVE_REG, 'perfil1', V) then Pagina.Values[1] := V;
  if RegQueryStringValue(HKCU, CLAVE_REG, 'carpeta1', V) then Pagina.Values[2] := V;
  if RegQueryStringValue(HKCU, CLAVE_REG, 'perfil2', V) then Pagina.Values[3] := V;
  if RegQueryStringValue(HKCU, CLAVE_REG, 'carpeta2', V) then Pagina.Values[4] := V;
  if Pagina.Values[0] <> '' then Exit;
  // 2) Un despertador.json de la instalacion a mano.
  Ruta := ExpandConstant('{userappdata}\VigilantePagosME\despertador.json');
  if not FileExists(Ruta) then Ruta := 'C:\Automatizaciones\vigilante-pagos-me\despertador.json';
  if FileExists(Ruta) and LoadStringFromFile(Ruta, JsonA) then
  begin
    Json := String(JsonA);
    V := ValorJson(Json, 'clave', 1);
    if Pos('me_', V) = 1 then Pagina.Values[0] := V;
    P2 := Pos('"perfiles"', Json);
    if P2 > 0 then
    begin
      Pagina.Values[1] := ValorJson(Json, 'perfil', P2 + 10);
      Pagina.Values[2] := ValorJson(Json, 'carpeta', P2 + 10);
      P2 := Pos('},', Copy(Json, P2, Length(Json))) + P2;
      if P2 > 0 then
      begin
        Pagina.Values[3] := ValorJson(Json, 'perfil', P2);
        Pagina.Values[4] := ValorJson(Json, 'carpeta', P2);
      end;
    end;
  end;
end;

procedure InitializeWizard();
begin
  Pagina := CreateInputQueryPage(wpWelcome,
    'Clave y perfiles de Chrome',
    'Lo que necesita el vigilante para trabajar',
    'Clave: en el sistema, Pagos ME > Generar clave (la misma que va en la extension). ' +
    'Perfiles: el nombre que pusiste en la extension y la carpeta de ese perfil de Chrome ' +
    '(en esa ventana, chrome://version > "Ruta del perfil", lo ultimo: Profile 1, Profile 2...). ' +
    'Si solo usas una cuenta, deja vacio el perfil 2.');
  Pagina.Add('Clave del vigilante (me_...):', False);
  Pagina.Add('Perfil 1 - nombre (como en la extension):', False);
  Pagina.Add('Perfil 1 - carpeta de Chrome:', False);
  Pagina.Add('Perfil 2 - nombre:', False);
  Pagina.Add('Perfil 2 - carpeta de Chrome:', False);
  Pagina.Values[1] := 'PIKEKE';
  Pagina.Values[2] := 'Profile 1';
  Pagina.Values[3] := 'SOLUCIONES_MC';
  Pagina.Values[4] := 'Profile 2';
  Precargar();
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  C: String;
begin
  Result := True;
  if CurPageID = Pagina.ID then
  begin
    C := Trim(Pagina.Values[0]);
    if (Pos('me_', C) <> 1) or (Length(C) <> 51) then
    begin
      MsgBox('La clave debe empezar con "me_" y tener 51 caracteres. Copiala de Pagos ME > Generar clave.', mbError, MB_OK);
      Result := False;
    end
    else if (Trim(Pagina.Values[1]) = '') or (Trim(Pagina.Values[2]) = '') then
    begin
      MsgBox('Falta el perfil 1 (nombre y carpeta).', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function Escapar(const S: String): String;
begin
  Result := S;
  StringChangeEx(Result, '\', '\\', True);
  StringChangeEx(Result, '"', '\"', True);
end;

function FilaPerfil(const Nombre, Carpeta: String): String;
begin
  Result := '    { "perfil": "' + Escapar(Uppercase(Trim(Nombre))) + '", "carpeta": "' + Escapar(Trim(Carpeta)) + '" }';
end;

procedure CerrarDespertador();
var
  R: Integer;
begin
  Exec('powershell.exe', '-NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq ''powershell.exe'' -and $_.CommandLine -like ''*despertador.ps1*'' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
    '', SW_HIDE, ewWaitUntilTerminated, R);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Dir, Json, Perfiles: String;
begin
  if CurStep = ssInstall then CerrarDespertador();   // al actualizar: se reemplaza el que corre
  if CurStep = ssPostInstall then
  begin
    Dir := ExpandConstant('{userappdata}\VigilantePagosME');
    ForceDirectories(Dir);
    Perfiles := FilaPerfil(Pagina.Values[1], Pagina.Values[2]);
    if (Trim(Pagina.Values[3]) <> '') and (Trim(Pagina.Values[4]) <> '') then
      Perfiles := Perfiles + ',' + #13#10 + FilaPerfil(Pagina.Values[3], Pagina.Values[4]);
    Json := '{' + #13#10 +
      '  "servidor": "https://app.elcomerciantedigital.com",' + #13#10 +
      '  "clave": "' + Escapar(Trim(Pagina.Values[0])) + '",' + #13#10 +
      '  "chrome": "",' + #13#10 +
      '  "perfiles": [' + #13#10 + Perfiles + #13#10 + '  ]' + #13#10 + '}' + #13#10;
    SaveStringToFile(Dir + '\despertador.json', Json, False);
    RegWriteStringValue(HKCU, CLAVE_REG, 'clave', Trim(Pagina.Values[0]));
    RegWriteStringValue(HKCU, CLAVE_REG, 'perfil1', Trim(Pagina.Values[1]));
    RegWriteStringValue(HKCU, CLAVE_REG, 'carpeta1', Trim(Pagina.Values[2]));
    RegWriteStringValue(HKCU, CLAVE_REG, 'perfil2', Trim(Pagina.Values[3]));
    RegWriteStringValue(HKCU, CLAVE_REG, 'carpeta2', Trim(Pagina.Values[4]));
  end;
end;
