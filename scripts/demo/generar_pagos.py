"""Cuenta DEMO para videos: las guías de Pagos ME con el diseño REAL (26-10, pedido del dueño).

Antes la guía de cada pago de la demo era un dibujo simple (lib/demoPagosME.ts → guiaDemo). Esto arma, con las
mismas plantillas y el mismo método de generar.py (textos reemplazados, códigos de barras en vectores y legibles),
una guía ZOOM o TEALCA por cada pago sembrado (ventas 2000099996000001 en adelante) y las deja en
  lib/demo/guias-pagos.json   [{ venta, carrier, guia, comprador, cuenta, pdf (base64) }, ...]
que lee lib/demoDatos.ts (pagosME) al restaurar. generar.py no se toca: de él se toman las listas y las funciones.

Uso (en la PC, con PyMuPDF y zxing-cpp):  python scripts/demo/generar_pagos.py
Determinístico: volver a correrlo da los mismos números (la fecha impresa es la del día en que se corre).
"""
import base64, json, os, random
from datetime import date

import fitz, zxingcpp, numpy as np   # noqa: F401 (los usa el código tomado de generar.py)

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
SRC = open(os.path.join(AQUI, 'generar.py'), encoding='utf-8').read()
# Listas de compradores y destinos, y las funciones de las etiquetas, tal cual están en generar.py.
exec(SRC[SRC.index('NOMBRES = ['):SRC.index('compradores = []')])
exec(SRC[SRC.index('def codigos(page):'):SRC.index('zt = [s[')])

N = 30                                    # DEMO_TRAER.ventas (20) + 9 de ayer, con margen
RANGO = '20000999960'           # = RANGO.pagos de lib/demoDatos.ts
CUENTAS = ['TECNOVA STORE', 'TECNOVA OUTLET']
FECHA = date.today()
rnd = random.Random(20261026)
tmp = os.path.join(AQUI, '_tmp_pagos.pdf')

zt = [s['text'].strip() for s in spans(fitz.open(ZOOM_SRC)[0])]   # noqa: F821
guia0, cod0 = '1711990101', 'VLN'
venta0 = next(t for t in zt if t.startswith('2000'))
seg0 = next(t for t in zt if t.startswith('Cod.Seg'))
dir2_0 = next(t for t in zt if t.startswith('CENTRO.'))
dir3_0 = next(t for t in zt if t.startswith('VALENCIA;'))

salida, usados = [], set()
for i in range(N):
    venta = f'{RANGO}{i + 1:05d}'
    # La misma cuenta que le toca en lib/demoDatos.ts (cuentaDe): 1 y 3 de cada 5, la segunda.
    remitente = CUENTAS[1] if i % 5 in (1, 3) else CUENTAS[0]
    while True:
        comprador = f'{rnd.choice(NOMBRES)} {rnd.choice(APELLIDOS)}'   # noqa: F821
        if comprador not in usados:
            usados.add(comprador)
            break
    ciudad, estado, codigo, oficina = rnd.choice(DESTINOS)   # noqa: F821
    direccion = f'{rnd.choice(CALLES)}, {rnd.choice(SITIOS)}'   # noqa: F821
    ci = str(rnd.randint(9_000_000, 30_999_999))
    telefono = f"04{rnd.choice(['14', '24', '12', '16', '26'])}{rnd.randint(1_000_000, 9_999_999)}"
    zoom = rnd.random() < 2   # todas ZOOM (26-10): el Reportador las toma sin guía final
    if zoom:
        guia = str(1_716_000_000 + rnd.randint(0, 3_999_999))
        seg = ''.join(rnd.choice('0123456789ABCDEF') for _ in range(10))
        def cambio(fmt, t, guia=guia, codigo=codigo, seg=seg):
            if t.startswith(guia0) and ';' in t:
                return guia + t[len(guia0):]
            if t.startswith(guia0):
                return guia + t[len(guia0):].replace(cod0, codigo)
            return seg.lower()
        rehacer(ZOOM_SRC, [   # noqa: F821
            (eq('ZOOM'), 'ZOOM'), (eq(guia0), guia), (eq(cod0), codigo),   # noqa: F821
            (eq('04/10/2026'), FECHA.strftime('%d/%m/%Y')),   # noqa: F821
            (emp('Remitente:'), f'Remitente: {remitente} - {remitente}'),   # noqa: F821
            (emp('Destinatario:'), f'Destinatario: {comprador} - {comprador}'),   # noqa: F821
            (emp('R.I.F/C.I:'), f'R.I.F/C.I: V-{ci}'),   # noqa: F821
            (emp('Destino:'), f'Destino: {direccion},'),   # noqa: F821
            (eq(dir2_0), 'SECTOR CENTRO. - N/D; PARROQUIA: ; MUNICIPIO: ; CIUDAD'),   # noqa: F821
            (eq(dir3_0), f'{ciudad}; {estado}; VENEZUELA; ZONA POSTAL: N/D (Telf. {telefono})'),   # noqa: F821
            (emp('Peso:'), f'Peso: {rnd.uniform(0.15, 1.6):.2f} kg'),   # noqa: F821
            (eq(seg0), f'Cod.Seg {seg}'), (eq(venta0), venta),   # noqa: F821
        ], cambio, tmp)
    else:
        guia = str(694_000 + rnd.randint(0, 99_999))
        c = ciudad.title()
        rehacer(TEALCA_SRC, [   # noqa: F821
            (eq('690101'), guia),   # noqa: F821
            (eq('04-10-2026 15:59'), FECHA.strftime('%d-%m-%Y') + f' {rnd.randint(9, 17):02d}:{rnd.randint(0, 59):02d}'),   # noqa: F821
            (eq('Maracaibo (MAR)'), f'{c} ({codigo})'),   # noqa: F821
            (eq('8F21A0'), ''.join(rnd.choice('0123456789ABCDEF') for _ in range(6))),   # noqa: F821
            (eq('ventas@tiendademo.com'), 'ventas@tecnovastore.com'),   # noqa: F821
            (eq('Tienda Demo VAPERK'), remitente.title()),   # noqa: F821
            (eq('LUIS PEREZ'), comprador), (eq('14753951'), ci),   # noqa: F821
            (eq('58-04120000003'), f'58-{telefono}'),   # noqa: F821
            (eq('lperez.demo@correo.com'), comprador.split()[0].lower() + '.' + comprador.split()[-1].lower().replace('ñ', 'n') + '@correo.com'),   # noqa: F821
            (emp('Av. 4 Bella Vista'), f'{direccion.title()}, {c}, {estado.title()}'),   # noqa: F821
            (eq('4102 - Maracaibo'), oficina),   # noqa: F821
        ], lambda fmt, t, guia=guia: guia, tmp)
    salida.append(dict(venta=venta, carrier='ZOOM' if zoom else 'TEALCA', guia=guia, comprador=comprador, cuenta=remitente,
                       pdf=base64.b64encode(open(tmp, 'rb').read()).decode()))
os.remove(tmp)
json.dump(salida, open(os.path.join(RAIZ, 'lib', 'demo', 'guias-pagos.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('guias-pagos.json:', len(salida), 'guías', sum(x['carrier'] == 'ZOOM' for x in salida), 'ZOOM')
