; Instalador de Pagos MercadoEnvios (el "vigilante", Inno Setup 6). Compilar con construir.ps1.
;
; Instala POR USUARIO (sin administrador) en %LOCALAPPDATA%\Programs\VigilantePagosME:
;   - el despertador (despertador.ps1): arranca con Windows, icono "ME" junto al reloj;
;   - la extension de Chrome (carpeta "extension", se carga con "Cargar descomprimida" en cada perfil:
;     Chrome no deja que un instalador la meta solo).
; Desde la 1.3.0 (clientes) se pide UN codigo corto (Pagos ME -> Conectar una PC): el despertador lo cambia
; por su clave al arrancar y encuentra solo los perfiles de Chrome que tienen la extension. Al actualizar
; una PC ya conectada se deja el codigo vacio y se conserva su clave. Desde la 1.3.3 SIEMPRE en modo
; automatico: ya no se guardan nombres de perfiles (los de las instalaciones 1.2 se descartan), asi el
; nombre interno de la extension nunca tiene que coincidir con nada.
; Todo queda en %APPDATA%\VigilantePagosME\despertador.json (y en el registro): instalar encima no lo borra.

#define AppName    "Pagos MercadoEnvios"
#define AppVersion "1.3.6"
#define Publisher  "El Comerciante Digital"

[Setup]
AppId={{4C1B7E2A-93D5-4F0B-8C6E-2A7D51E9B3F4}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
AppPublisherURL=https://app.elcomerciantedigital.com
AppSupportURL=https://t.me/elcomerciantedigital
; Datos del archivo (Propiedades > Detalles). Sin certificado de firma, Windows SmartScreen igual muestra
; "Windows protegio su PC" (Mas informacion > Ejecutar de todas formas): lo explican Pagos ME y /extension.
VersionInfoVersion={#AppVersion}
VersionInfoCompany={#Publisher}
VersionInfoDescription=Instalador de Pagos MercadoEnvios (El Comerciante Digital)
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}
VersionInfoCopyright=(c) 2026 {#Publisher}
DefaultDirName={localappdata}\Programs\VigilantePagosME
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\vigilante-dist
OutputBaseFilename=InstalarPagosME-{#AppVersion}
SetupIconFile=vigilante.ico
UninstallDisplayIcon={app}\vigilante.ico
UninstallDisplayName={#AppName}
InfoAfterFile=despues.txt
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
Source: "..\iconos\*.png"; DestDir: "{app}\extension\iconos"; Flags: ignoreversion

[Icons]
; Mismo nombre que el acceso de la instalacion a mano (instalar-despertador.cmd): lo reemplaza.
Name: "{userstartup}\Despertador Pagos ME"; Filename: "powershell.exe"; \
  Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\despertador.ps1"""; \
  IconFilename: "{app}\vigilante.ico"; Flags: runminimized
Name: "{autoprograms}\{#AppName}\Despertador Pagos ME"; Filename: "powershell.exe"; \
  Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\despertador.ps1"""; \
  IconFilename: "{app}\vigilante.ico"; Flags: runminimized
Name: "{autoprograms}\{#AppName}\Ver registro"; Filename: "notepad.exe"; Parameters: """{userappdata}\VigilantePagosME\despertador.log"""

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\despertador.ps1"""; \
  Description: "Arrancar el programa ahora"; Flags: nowait postinstall runhidden 64bit; Check: IsWin64
; La pagina /extension lleva a la Chrome Web Store (o, mientras no este publicada, explica la carga a mano).
Filename: "https://app.elcomerciantedigital.com/extension"; Description: "Ver como agregar el Asistente de envios a Chrome"; \
  Flags: nowait postinstall shellexec

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -Command ""Get-CimInstance Win32_Process | Where-Object {{ $_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*despertador.ps1*' } | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }"""; \
  Flags: runhidden; RunOnceId: "CerrarDespertador"

[Code]
const
  CLAVE_REG = 'Software\VigilantePagosME';
var
  Pagina: TInputQueryWizardPage;
  ClaveVieja, Perfil1, Carpeta1, Perfil2, Carpeta2: String;

// Valor de "campo": "valor" en un JSON simple (para leer lo que dejo una instalacion anterior).
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

// Lo que ya habia: clave y perfiles fijos (instalaciones 1.2 y la PC de SolucionesMC).
procedure LeerAnterior();
var
  Json, Ruta, V: String;
  JsonA: AnsiString;
  P2: Integer;
begin
  if RegQueryStringValue(HKCU, CLAVE_REG, 'clave', V) then ClaveVieja := V;
  if RegQueryStringValue(HKCU, CLAVE_REG, 'perfil1', V) then Perfil1 := V;
  if RegQueryStringValue(HKCU, CLAVE_REG, 'carpeta1', V) then Carpeta1 := V;
  if RegQueryStringValue(HKCU, CLAVE_REG, 'perfil2', V) then Perfil2 := V;
  if RegQueryStringValue(HKCU, CLAVE_REG, 'carpeta2', V) then Carpeta2 := V;
  Ruta := ExpandConstant('{userappdata}\VigilantePagosME\despertador.json');
  if not FileExists(Ruta) then Ruta := 'C:\Automatizaciones\vigilante-pagos-me\despertador.json';
  if FileExists(Ruta) and LoadStringFromFile(Ruta, JsonA) then
  begin
    Json := String(JsonA);
    // La clave que el despertador obtuvo con un codigo queda solo en el JSON.
    V := ValorJson(Json, 'clave', 1);
    if (Pos('me_', V) = 1) and (Length(V) = 51) then ClaveVieja := V;
    if Perfil1 = '' then
    begin
      P2 := Pos('"perfiles"', Json);
      if P2 > 0 then
      begin
        Perfil1 := ValorJson(Json, 'perfil', P2 + 10);
        Carpeta1 := ValorJson(Json, 'carpeta', P2 + 10);
        P2 := Pos('},', Copy(Json, P2, Length(Json))) + P2;
        if P2 > 0 then
        begin
          Perfil2 := ValorJson(Json, 'perfil', P2);
          Carpeta2 := ValorJson(Json, 'carpeta', P2);
        end;
      end;
    end;
  end;
end;

function SinPerfilesFijos(): Boolean;
begin
  Result := (Trim(Perfil1) = '') or (Trim(Carpeta1) = '');
end;

procedure InitializeWizard();
var
  Texto: String;
begin
  LeerAnterior();
  Texto := 'En el sistema, entra a Pagos ME y toca "Conectar una PC". Escribe aqui el codigo que aparece ' +
    '(por ejemplo ABCD-2345). Vale por 60 minutos.';
  if ClaveVieja <> '' then
    Texto := Texto + #13#10#13#10 + 'Esta PC ya estaba conectada: si solo estas actualizando, deja el codigo vacio.';
  Pagina := CreateInputQueryPage(wpWelcome, 'Conectar esta PC', 'Escribe tu codigo de conexion', Texto);
  Pagina.Add('Codigo de conexion:', False);
end;

function SoloLetras(const S: String): String;
var
  I: Integer;
  C: Char;
begin
  Result := '';
  for I := 1 to Length(S) do
  begin
    C := Uppercase(S[I])[1];
    if ((C >= 'A') and (C <= 'Z')) or ((C >= '0') and (C <= '9')) then Result := Result + C;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  C: String;
begin
  Result := True;
  if CurPageID = Pagina.ID then
  begin
    C := SoloLetras(Pagina.Values[0]);
    if (C = '') and (ClaveVieja <> '') then Exit;
    if Length(C) <> 8 then
    begin
      MsgBox('El codigo tiene 8 letras y numeros (por ejemplo ABCD-2345). Lo ves en el sistema: Pagos ME > Conectar una PC.', mbError, MB_OK);
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
  Dir, Json, Perfiles, Codigo, Clave: String;
begin
  if CurStep = ssInstall then CerrarDespertador();   // al actualizar: se reemplaza el que corre
  if CurStep = ssPostInstall then
  begin
    Dir := ExpandConstant('{userappdata}\VigilantePagosME');
    ForceDirectories(Dir);
    Codigo := SoloLetras(Pagina.Values[0]);
    // Con codigo nuevo, la clave la pide el despertador al arrancar; sin codigo, se conserva la de antes.
    if Codigo <> '' then Clave := '' else Clave := ClaveVieja;
    // Siempre automatico (1.3.3): el despertador encuentra solo los perfiles de Chrome con la extension.
    Perfiles := '';
    Json := '{' + #13#10 +
      '  "servidor": "https://app.elcomerciantedigital.com",' + #13#10 +
      '  "clave": "' + Escapar(Clave) + '",' + #13#10 +
      '  "codigo": "' + Codigo + '",' + #13#10 +
      '  "chrome": "",' + #13#10 +
      '  "perfiles": [' + Perfiles + ']' + #13#10 + '}' + #13#10;
    SaveStringToFile(Dir + '\despertador.json', Json, False);
    if Clave <> '' then RegWriteStringValue(HKCU, CLAVE_REG, 'clave', Clave)
    else RegDeleteValue(HKCU, CLAVE_REG, 'clave');
  end;
end;
