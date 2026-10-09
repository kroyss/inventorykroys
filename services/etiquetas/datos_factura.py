"""
Datos del comprador para facturar, leídos de la guía (ZOOM o TEALCA) al subirla en Despachos.

  documento  solo los números del RIF/C.I.
  telefono   el primero, formato 04XXXXXXXXX
  ciudad     ZOOM: el bloque antes del estado ("…; CIUDAD; ESTADO; VENEZUELA"); TEALCA: CIUDAD DESTINO
  direccion  ZOOM: entre "Destino:" y "; PARROQUIA" (sin "- N/D" ni la repetición); TEALCA: Dirección

Regla: lo que no cumple el formato esperado queda en None (se revisa a mano), nunca se adivina.
"""
import re

import fitz

# TEALCA: zonas en la pre-guía (puntos, origen arriba-izquierda), columna del destinatario.
ZONA_CIUDAD_DESTINO = fitz.Rect(420, 54, 580, 80)
ZONA_DOCUMENTO = fitz.Rect(470, 182, 722, 205)
ZONA_TELEFONO = fitz.Rect(470, 206, 722, 229)
ZONA_DIRECCION = fitz.Rect(470, 252, 722, 305)


def _espacios(s):
    return re.sub(r"\s+", " ", s or "").strip()


def documento(s):
    """'V-12.649.394' / '26007572' → '12649394' (6 a 10 dígitos; si no, None)."""
    d = re.sub(r"\D", "", s or "")
    return d if 6 <= len(d) <= 10 else None


def telefono(s):
    """'58-04121555947' / '4249138415' / '04249138415' → '04XXXXXXXXX' (o 02…); si no, None."""
    d = re.sub(r"\D", "", s or "")
    if len(d) == 12 and d.startswith("58"):
        d = d[2:]
    if len(d) == 13 and d.startswith("580"):
        d = d[2:]
    if len(d) == 10 and d[0] in "24":
        d = "0" + d
    return d if re.fullmatch(r"0[24]\d{9}", d) else None


def _sin_repeticion(s):
    """ZOOM a veces repite la dirección: 'X - X' / 'X- X' → 'X'. También quita '- N/D'."""
    s = _espacios(re.sub(r"\s*-\s*N/D\s*$", "", _espacios(s)))
    m = re.fullmatch(r"(.+?)\s*-\s*(.+)", s)
    if m and _espacios(m.group(1)).rstrip(" .").upper() == _espacios(m.group(2)).rstrip(" .").upper():
        s = _espacios(m.group(1))
    return s or None


def zoom(text):
    t = _espacios(text)
    out = {"documento": None, "telefono": None, "ciudad": None, "direccion": None}
    m = re.search(r"R\.?I\.?F\.?\s*/\s*C\.?I\.?\s*:\s*([A-Za-z]?\s*-?\s*[\d.\s]+)", t)
    if m:
        out["documento"] = documento(m.group(1))
    m = re.search(r"\(\s*Telf\.?\s*([^)/]+)", t)
    if m:
        out["telefono"] = telefono(m.group(1))
    m = re.search(r"Destino:\s*(.*?)\(\s*Telf", t)
    if m:
        partes = [p.strip() for p in m.group(1).split(";")]
        i = next((k for k in range(len(partes) - 1, -1, -1) if partes[k].upper() == "VENEZUELA"), None)
        if i is not None and i >= 2 and partes[i - 2] and not re.match(r"(?i)(PARROQUIA|MUNICIPIO)\s*:", partes[i - 2]):
            out["ciudad"] = partes[i - 2]
        # La dirección es lo que va antes del primer "; PARROQUIA" (o del primer ";").
        dire = re.split(r";\s*PARROQUIA\s*:", m.group(1), maxsplit=1, flags=re.I)[0]
        if dire == m.group(1):
            dire = m.group(1).split(";")[0]
        out["direccion"] = _sin_repeticion(dire)
    return out


def _zona(page, rect):
    palabras = page.get_text("words", clip=rect)
    palabras.sort(key=lambda w: (round(w[1]), w[0]))
    return _espacios(" ".join(w[4] for w in palabras)) or None


def tealca(page):
    ciudad = _zona(page, ZONA_CIUDAD_DESTINO)
    if ciudad:
        ciudad = _espacios(re.sub(r"\([^)]*\)", "", ciudad)) or None
    return {
        "documento": documento(_zona(page, ZONA_DOCUMENTO)),
        "telefono": telefono(_zona(page, ZONA_TELEFONO)),
        "ciudad": ciudad,
        "direccion": _zona(page, ZONA_DIRECCION),
    }
