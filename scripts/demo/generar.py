"""Cuenta DEMO para videos: datos fijos de la tienda ficticia + las 50 etiquetas PDF de Despachos.

Genera:
  lib/demo/datos.json   catálogo, cuentas y los 50 envíos (lo lee lib/demoDatos.ts al restaurar)
  <salida>/guide-<venta>.pdf  una etiqueta por envío (ZOOM o TEALCA), con el diseño real y
                              códigos de barras ficticios pero legibles (dibujados en vectores)

Uso (en la PC, con PyMuPDF y zxing-cpp):
  python scripts/demo/generar.py "D:/ComercianteDigital/Demo videos/Despachos"
Las plantillas (plantilla-zoom.pdf, plantilla-tealca.pdf) son etiquetas ya sin datos reales.
Todo es determinístico: volver a correrlo da los mismos números de venta y guías.
"""
import json, os, random, sys
from datetime import date

import fitz, zxingcpp, numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, 'salida')
FECHA = date.today()
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(20261006)

TIENDA = 'Tecnova Store'
CUENTAS = [  # nickname en ML, remitente en la etiqueta (el Reportador las separa por el remitente)
    {'nickname': 'TECNOVA_STORE', 'remitente': 'TECNOVA STORE', 'pagina': 'mercadolibre.com.ve/pagina/tecnovastore'},
    {'nickname': 'TECNOVA_OUTLET', 'remitente': 'TECNOVA OUTLET', 'pagina': 'mercadolibre.com.ve/pagina/tecnovaoutlet'},
]

# ── Catálogo ────────────────────────────────────────────────────────────────
# icono: emoji para la miniatura de Stock. ficha: datos técnicos (los ve la IA). variantes: id → nombre.
CATALOGO = [
    dict(id='MLV900100101', titulo='Audífonos Bluetooth 5.3 Inalámbricos TWS con Estuche de Carga', precio=14.99, icono='🎧', color='#ede9fe',
         ficha='Bluetooth 5.3. Batería: 6 h de música por carga y 24 h con el estuche. Carga por USB-C (cable incluido, sin cargador de pared). Resistentes al sudor IPX4. Controles táctiles. Micrófono para llamadas. Compatibles con Android y iPhone.',
         descripcion='Audífonos inalámbricos TWS con estuche de carga. Se conectan solos al abrir el estuche. Incluye: audífonos, estuche, cable USB-C y almohadillas de 3 tamaños. Garantía de 30 días por defectos de fábrica.'),
    dict(id='MLV900100102', titulo='Cargador Rápido 20W USB-C Power Delivery con Cable Tipo C', precio=9.50, icono='🔌', color='#e0f2fe',
         ficha='Potencia 20 W, Power Delivery 3.0. Entrada 100-240 V (sirve en cualquier voltaje). Incluye cable USB-C a USB-C de 1 m. Para iPhone 8 en adelante se necesita cable USB-C a Lightning (se vende aparte). Carga un iPhone 13 al 50% en 30 minutos.',
         descripcion='Cargador de pared de 20 W con puerto USB-C y cable incluido. Protección contra sobrecarga y cortocircuito. Garantía de 30 días.'),
    dict(id='MLV900100103', titulo='Cable USB-C a Lightning Trenzado 1m Carga Rápida para iPhone', precio=5.99, icono='🔋', color='#fef3c7',
         variantes={2001: 'Color: Negro', 2002: 'Color: Blanco'},
         ficha='Largo 1 m. Nylon trenzado, puntas reforzadas. Carga rápida con cargador de 20 W (PD). Transfiere datos. Compatible con iPhone 5 al iPhone 14 y iPads con conector Lightning. No sirve para iPhone 15 (usa USB-C).',
         descripcion='Cable trenzado resistente, carga rápida. Colores: negro y blanco (elige la variante al comprar).'),
    dict(id='MLV900100104', titulo='Power Bank 10000mAh Carga Rápida 22.5W Doble USB y USB-C', precio=18.90, icono='⚡', color='#dcfce7',
         ficha='Capacidad 10000 mAh (carga un celular normal unas 2 veces). Salidas: 2 USB-A y 1 USB-C, carga rápida 22.5 W. Entrada USB-C. Pantalla con el porcentaje. Peso 210 g. Se puede llevar en el avión (menos de 100 Wh).',
         descripcion='Batería portátil con pantalla digital y carga rápida. Incluye cable USB a USB-C. Garantía de 30 días.'),
    dict(id='MLV900100105', titulo='Soporte Magnético de Celular para Carro Rejilla de Aire', precio=6.50, icono='🚗', color='#fee2e2',
         ficha='Se engancha a la rejilla del aire acondicionado. Imán de neodimio, gira 360°. Incluye 2 placas metálicas adhesivas para pegar al celular o al forro. Sirve para celulares de hasta 7 pulgadas.',
         descripcion='Soporte magnético firme, no se cae en huecos. Incluye placas metálicas.'),
    dict(id='MLV900100106', titulo='Mouse Inalámbrico Recargable Silencioso 2.4G y Bluetooth', precio=8.99, icono='🖱️', color='#f1f5f9',
         ficha='Doble modo: receptor USB 2.4G y Bluetooth. Batería recargable por USB-C, dura unas 3 semanas. Clic silencioso. 3 niveles de DPI (800/1200/1600). Compatible con Windows, Mac, Android y tablets.',
         descripcion='Mouse recargable sin pilas, clic silencioso. Incluye receptor USB (guardado debajo del mouse) y cable de carga.'),
    dict(id='MLV900100107', titulo='Teclado Inalámbrico Bluetooth Multidispositivo en Español', precio=21.00, icono='⌨️', color='#e0e7ff',
         ficha='Bluetooth, se conecta a 3 equipos y cambia con una tecla. Distribución en español con la Ñ. Funciona con 2 pilas AAA (incluidas), duran unos 6 meses. Compatible con Windows, Mac, iPad, Android y Smart TV.',
         descripcion='Teclado compacto en español, ideal para tablet y laptop.'),
    dict(id='MLV900100108', titulo='Smartwatch Reloj Inteligente Deportivo Resistente al Agua', precio=29.90, icono='⌚', color='#fae8ff',
         ficha='Pantalla 1.83". Mide pasos, frecuencia cardíaca, sueño y oxígeno. Notificaciones de WhatsApp y llamadas. Resistente al agua IP67 (lluvia y lavarse las manos; no para nadar). Batería 5 a 7 días. App en español para Android e iPhone. Correa de silicona negra.',
         descripcion='Reloj inteligente con app en español. Incluye cargador magnético.'),
    dict(id='MLV900100109', titulo='Lámpara LED de Escritorio Recargable Táctil 3 Tonos de Luz', precio=12.75, icono='💡', color='#fef9c3',
         ficha='Recargable por USB (cable incluido), batería de 4 a 8 horas según el brillo. 3 tonos de luz (fría, neutra y cálida) y 5 niveles de brillo, táctil. Brazo flexible. Funciona también conectada.',
         descripcion='Lámpara LED que no calienta, ideal para estudiar. Funciona sin luz eléctrica (recargable).'),
    dict(id='MLV900100110', titulo='Hub USB-C 6 en 1 HDMI 4K USB 3.0 Lector SD para Laptop', precio=24.50, icono='🖥️', color='#ccfbf1',
         ficha='Puertos: HDMI 4K 30 Hz, 2 USB 3.0, lector SD y microSD, USB-C de carga 100 W (pasa la carga de la laptop). Compatible con MacBook, laptops con USB-C que soporten video (DisplayPort Alt Mode) y iPad Pro.',
         descripcion='Adaptador multipuerto de aluminio para laptops con USB-C.'),
    dict(id='MLV900100111', titulo='Memoria USB 64GB 3.0 Metálica Alta Velocidad', precio=7.90, icono='💾', color='#e2e8f0',
         ficha='Capacidad 64 GB (unos 58 GB útiles, como toda memoria). USB 3.0, lectura hasta 100 MB/s. Cuerpo metálico con argolla. Compatible con USB 2.0.',
         descripcion='Pendrive metálico resistente. Garantía de 30 días.'),
    dict(id='MLV900100112', titulo='Corneta Bluetooth Portátil Resistente al Agua 10W', precio=19.99, icono='🔊', color='#ffedd5',
         ficha='Potencia 10 W. Bluetooth 5.0, alcance 10 m. Batería 8 horas. Resistente al agua IPX6 (lluvia y salpicaduras). Entrada para memoria microSD y radio FM. Se pueden unir 2 cornetas iguales (TWS).',
         descripcion='Corneta portátil con buen bajo y luz LED. Incluye cable de carga.'),
    dict(id='MLV900100113', titulo='Protector de Pantalla Vidrio Templado 9D para Samsung', precio=3.50, icono='📱', color='#f5f5f4',
         variantes={3001: 'Modelo: Galaxy A15', 3002: 'Modelo: Galaxy A25', 3003: 'Modelo: Galaxy A35'},
         ficha='Vidrio templado 9H, cubre toda la pantalla (borde negro). Compatible con el lector de huella de la pantalla en A25 y A35. Incluye paño y sticker para el polvo.',
         descripcion='Protector de vidrio templado de borde a borde. Elige el modelo de tu celular en la variante.'),
    dict(id='MLV900100114', titulo='Aro de Luz LED 26cm con Trípode de 2m y Soporte de Celular', precio=16.80, icono='🤳', color='#fce7f3',
         ficha='Aro de 26 cm, 3 tonos de luz y 10 niveles de brillo. Trípode extensible de 60 cm a 2 m. Conexión USB (sirve con cargador de celular, laptop o power bank). Control en el cable.',
         descripcion='Ideal para videos, clases en línea y maquillaje. Incluye soporte de celular.'),
]
PROD = {p['id']: p for p in CATALOGO}

# ── Compradores y destinos ─────────────────────────────────────────────────
NOMBRES = ['CARLOS', 'ANA', 'LUIS', 'MARIA', 'JOSE', 'DANIELA', 'PEDRO', 'GABRIELA', 'JESUS', 'ANDREA', 'MIGUEL', 'VALENTINA',
           'RAFAEL', 'CAROLINA', 'JORGE', 'PAOLA', 'ALEJANDRO', 'MARIANA', 'RICARDO', 'YELITZA', 'FRANCISCO', 'KARINA',
           'ORLANDO', 'NATHALY', 'EDUARDO', 'ROSANGEL', 'ANTONIO', 'MILAGROS', 'HECTOR', 'YULIMAR', 'OSCAR', 'DAYANA',
           'GUSTAVO', 'FABIOLA', 'WILMER', 'LISBETH', 'RONALD', 'GENESIS', 'ALBERTO', 'NORELYS', 'JUAN', 'ISABEL',
           'MANUEL', 'ADRIANA', 'ARMANDO', 'YOSELIN', 'ENRIQUE', 'BARBARA', 'SAMUEL', 'MARYORI']
APELLIDOS = ['MENDOZA', 'RODRIGUEZ', 'PEREZ', 'GONZALEZ', 'RAMIREZ', 'HERNANDEZ', 'TORRES', 'DIAZ', 'MARQUEZ', 'SUAREZ',
             'CASTILLO', 'ROJAS', 'MORENO', 'GUERRERO', 'MEDINA', 'BRICEÑO', 'COLMENARES', 'VILLEGAS', 'ARAUJO', 'PEÑA',
             'SALAZAR', 'QUINTERO', 'ESCALONA', 'MONTILLA', 'CHACON', 'PARRA', 'BLANCO', 'LEAL', 'OCHOA', 'ZAMBRANO']
# ciudad, estado, código ZOOM, oficina TEALCA
DESTINOS = [
    ('CARACAS', 'DISTRITO CAPITAL', 'CCS', '1101 - Caracas Chacao'), ('VALENCIA', 'CARABOBO', 'VLN', '2101 - Valencia'),
    ('MARACAY', 'ARAGUA', 'MCY', '2201 - Maracay'), ('BARQUISIMETO', 'LARA', 'BRM', '3101 - Barquisimeto'),
    ('MARACAIBO', 'ZULIA', 'MAR', '4102 - Maracaibo'), ('LECHERIA', 'ANZOATEGUI', 'LCH', '6105 - Lecheria'),
    ('MERIDA', 'MERIDA', 'MRD', '5101 - Merida'), ('PUERTO ORDAZ', 'BOLIVAR', 'PZO', '7101 - Puerto Ordaz'),
    ('BARINAS', 'BARINAS', 'BNS', '5301 - Barinas'), ('MATURIN', 'MONAGAS', 'MUN', '6301 - Maturin'),
    ('LOS TEQUES', 'MIRANDA', 'LTQ', '1301 - Los Teques'), ('PUNTO FIJO', 'FALCON', 'PFJ', '3301 - Punto Fijo'),
    ('ACARIGUA', 'PORTUGUESA', 'ACA', '3401 - Acarigua'), ('CUMANA', 'SUCRE', 'CUM', '6201 - Cumana'),
]
CALLES = ['AV. BOLIVAR', 'CALLE 5 CON CARRERA 8', 'AV. LAS AMERICAS', 'CALLE PRINCIPAL', 'AV. UNIVERSIDAD', 'CALLE PAEZ',
          'AV. LIBERTADOR', 'CALLE SUCRE', 'AV. INTERCOMUNAL', 'CALLE MIRANDA', 'AV. FUERZAS ARMADAS', 'CALLE URDANETA']
SITIOS = ['EDIF. LOS SAMANES, PISO 3, APTO 3-B', 'CASA NRO. 12', 'RES. EL PARQUE, TORRE A, APTO 5-2', 'LOCAL 4, C.C. PLAZA',
          'QUINTA MARIA ELENA', 'CONJ. RES. LAS ACACIAS, CASA 27', 'EDIF. CENTRO, PISO 1', 'URB. LA FLORESTA, CASA 8']
NOTAS = ['Envolver para regalo', 'Confirmar dirección por mensaje', 'Color negro por favor', 'Enviar con factura',
         'Es para cumpleaños, que no se vea el precio', 'Retira en oficina, no a domicilio']

compradores = []
usados = set()
while len(compradores) < 120:      # alcanza para despachos y el resto de las secciones (lib/demoDatos.ts)
    n = f'{rnd.choice(NOMBRES)} {rnd.choice(APELLIDOS)}'
    if n in usados:
        continue
    usados.add(n)
    compradores.append(n)

# ── Los 50 envíos de Despachos ──────────────────────────────────────────────
envios = []
zoom_n, tealca_n = 0, 0
for i in range(50):
    venta = f'200009999{1000001 + i}'           # 2000099991000001 …
    tealca = i % 7 in (2, 5)                     # ~14 de 50 por TEALCA
    cuenta = CUENTAS[0] if i % 5 not in (1, 3) else CUENTAS[1]
    ciudad, estado, cod, oficina = rnd.choice(DESTINOS)
    items = []
    for _ in range(rnd.choices([1, 2, 3], [70, 22, 8])[0]):
        p = rnd.choice(CATALOGO)
        if any(x['item_id'] == p['id'] for x in items):
            continue
        var = rnd.choice(list(p['variantes'].items())) if p.get('variantes') else None
        items.append(dict(item_id=p['id'], variante_id=var[0] if var else 0, titulo=p['titulo'],
                          variante=var[1] if var else None, cantidad=rnd.choices([1, 2, 3], [80, 15, 5])[0]))
    total = round(sum(PROD[x['item_id']]['precio'] * x['cantidad'] for x in items), 2)
    if tealca:
        tealca_n += 1
        guia = f'69{1000 + tealca_n:04d}'
    else:
        zoom_n += 1
        guia = f'17119{20000 + zoom_n * 37:05d}'
    comprador = compradores[i]
    envios.append(dict(
        venta=venta, carrier='TEALCA' if tealca else 'ZOOM', guia=guia, cuenta=cuenta['nickname'], remitente=cuenta['remitente'],
        comprador=comprador, ci=f'{rnd.randint(12, 30)}{rnd.randint(100000, 999999)}', telefono=f'04{rnd.choice(["12", "14", "16", "24", "26"])}{rnd.randint(1000000, 9999999)}',
        ciudad=ciudad, estado=estado, codigo=cod, oficina=oficina,
        direccion=f'{rnd.choice(CALLES)}, {rnd.choice(SITIOS)}', peso=round(rnd.uniform(0.15, 1.4), 2),
        horas=rnd.randint(2, 40),               # hace cuánto se vendió (al restaurar)
        nota=rnd.choice(NOTAS) if rnd.random() < 0.18 else None, total=total, items=items,
    ))

json.dump(dict(tienda=TIENDA, cuentas=CUENTAS, catalogo=CATALOGO, compradores=compradores, envios=envios),
          open(os.path.join(RAIZ, 'lib', 'demo', 'datos.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('datos.json:', len(CATALOGO), 'productos,', len(envios), 'envíos', f'({zoom_n} ZOOM, {tealca_n} TEALCA)')


# ── Etiquetas PDF ───────────────────────────────────────────────────────────
def codigos(page):
    pix = page.get_pixmap(dpi=300)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
    out = []
    for b in zxingcpp.read_barcodes(img):
        q = b.position
        xs = [p.x * 72 / 300 for p in (q.top_left, q.top_right, q.bottom_right, q.bottom_left)]
        ys = [p.y * 72 / 300 for p in (q.top_left, q.top_right, q.bottom_right, q.bottom_left)]
        out.append((b.format, b.text, fitz.Rect(min(xs), min(ys), max(xs), max(ys))))
    return out


def dibujar_codigo(page, formato, texto, rect):
    """En VECTORES, como las reales: una imagen se emborrona a 4 por hoja y el lector no la lee."""
    m = np.array(zxingcpp.create_barcode(texto, formato).to_image(scale=1, add_quiet_zones=False))
    if m.ndim == 3:
        m = m[..., 0]
    oscuro = m < 128
    sh = page.new_shape()
    if formato == zxingcpp.BarcodeFormat.Code128:
        fila = oscuro[oscuro.shape[0] // 2]
        mw = rect.width / len(fila)
        filas = [(fila, rect.y0, rect.y1)]
    else:
        mw = rect.width / oscuro.shape[1]
        mh = rect.height / oscuro.shape[0]
        filas = [(oscuro[i], rect.y0 + i * mh, rect.y0 + (i + 1) * mh) for i in range(oscuro.shape[0])]
    for fila, y0, y1 in filas:
        j = 0
        while j < len(fila):
            if fila[j]:
                k = j
                while k < len(fila) and fila[k]:
                    k += 1
                sh.draw_rect(fitz.Rect(rect.x0 + j * mw, y0, rect.x0 + k * mw, y1))
                j = k
            else:
                j += 1
    sh.finish(color=None, fill=(0, 0, 0), width=0)
    sh.commit()


def spans(page):
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                yield s


def rehacer(src, cambios_texto, cambio_codigo, salida):
    doc = fitz.open(src)
    p = doc[0]
    viejos = codigos(p)
    escribir = []
    for s in list(spans(p)):
        t = s['text'].strip()
        for pred, nuevo in cambios_texto:
            if t and pred(t):
                r = fitz.Rect(s['bbox'])
                r = fitz.Rect(r.x0, r.y0 + r.height * 0.25, r.x1, r.y1 - r.height * 0.15)
                p.add_redact_annot(r, fill=(0, 0, 0) if s['color'] == 0xFFFFFF else (1, 1, 1))
                if nuevo:
                    c = s['color']
                    color = ((c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255)
                    escribir.append((fitz.Point(s['origin']), nuevo, s['size'], 'hebo' if 'Bold' in s['font'] else 'helv', color))
                break
    nuevos = []
    for fmt, texto, r in viejos:
        p.add_redact_annot(r + (-1, -1, 1, 1), fill=(1, 1, 1))
        nuevos.append((fmt, cambio_codigo(fmt, texto), r))
    p.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
                       text=fitz.PDF_REDACT_TEXT_REMOVE)
    for pt, txt, size, font, color in escribir:
        p.insert_text(pt, txt, fontsize=size, fontname=font, color=color)
    for fmt, nuevo, r in nuevos:
        dibujar_codigo(p, fmt, nuevo, r)
    doc.save(salida, garbage=4, deflate=True)
    leidos = {t for _, t, _ in codigos(fitz.open(salida)[0])}
    faltan = [n for _, n, _ in nuevos if n not in leidos]
    if faltan:
        raise SystemExit(f'{os.path.basename(salida)}: códigos ilegibles {faltan}')


eq = lambda v: (lambda t: t == v)
emp = lambda v: (lambda t: t.startswith(v))
ZOOM_SRC = os.path.join(AQUI, 'plantilla-zoom.pdf')
TEALCA_SRC = os.path.join(AQUI, 'plantilla-tealca.pdf')

zt = [s['text'].strip() for s in spans(fitz.open(ZOOM_SRC)[0])]
guia0, cod0 = '1711990101', 'VLN'
venta0 = next(t for t in zt if t.startswith('2000'))
seg0 = next(t for t in zt if t.startswith('Cod.Seg'))
dir2_0 = next(t for t in zt if t.startswith('CENTRO.'))
dir3_0 = next(t for t in zt if t.startswith('VALENCIA;'))

for f in os.listdir(OUT):
    if f.startswith('guide-') and f.endswith('.pdf'):
        os.remove(os.path.join(OUT, f))

for e in envios:
    salida = os.path.join(OUT, f"guide-{e['venta']}.pdf")
    if e['carrier'] == 'ZOOM':
        seg = ''.join(rnd.choice('0123456789ABCDEF') for _ in range(10))
        d1 = f"{e['direccion']},"
        def cambio(fmt, t, e=e, seg=seg):
            if t.startswith(guia0) and ';' in t:
                return e['guia'] + t[len(guia0):]
            if t.startswith(guia0):
                return e['guia'] + t[len(guia0):].replace(cod0, e['codigo'])
            return seg.lower()
        rehacer(ZOOM_SRC, [
            (eq('ZOOM'), 'ZOOM'),
            (eq(guia0), e['guia']),
            (eq(cod0), e['codigo']),
            (eq('04/10/2026'), FECHA.strftime('%d/%m/%Y')),
            (emp('Remitente:'), f"Remitente: {e['remitente']} - {e['remitente']}"),
            (emp('Destinatario:'), f"Destinatario: {e['comprador']} - {e['comprador']}"),
            (emp('R.I.F/C.I:'), f"R.I.F/C.I: V-{e['ci']}"),
            (emp('Destino:'), f'Destino: {d1}'),
            (eq(dir2_0), f"SECTOR CENTRO. - N/D; PARROQUIA: ; MUNICIPIO: ; CIUDAD"),
            (eq(dir3_0), f"{e['ciudad']}; {e['estado']}; VENEZUELA; ZONA POSTAL: N/D (Telf. {e['telefono']})"),
            (emp('Peso:'), f"Peso: {e['peso']:.2f} kg"),
            (eq(seg0), f'Cod.Seg {seg}'),
            (eq(venta0), e['venta']),
        ], cambio, salida)
    else:
        ciudad = e['ciudad'].title()
        rehacer(TEALCA_SRC, [
            (eq('690101'), e['guia']),
            (eq('04-10-2026 15:59'), FECHA.strftime('%d-%m-%Y') + f" {rnd.randint(9, 17):02d}:{rnd.randint(0, 59):02d}"),
            (eq('Maracaibo (MAR)'), f"{ciudad} ({e['codigo']})"),
            (eq('8F21A0'), ''.join(rnd.choice('0123456789ABCDEF') for _ in range(6))),
            (eq('ventas@tiendademo.com'), 'ventas@tecnovastore.com'),
            (eq('Tienda Demo VAPERK'), e['remitente'].title()),
            (eq('LUIS PEREZ'), e['comprador']),
            (eq('14753951'), e['ci']),
            (eq('58-04120000003'), f"58-{e['telefono']}"),
            (eq('lperez.demo@correo.com'), e['comprador'].split()[0].lower() + '.' + e['comprador'].split()[-1].lower().replace('ñ', 'n') + '@correo.com'),
            (emp('Av. 4 Bella Vista'), f"{e['direccion'].title()}, {ciudad}, {e['estado'].title()}"),
            (eq('4102 - Maracaibo'), e['oficina']),
        ], lambda fmt, t, e=e: e['guia'], salida)

print('etiquetas:', len(envios), 'en', OUT)

# ── Prueba completa: lectura y armado 4 por hoja con verificación de códigos (lo que hace el sistema)
sys.path.insert(0, os.path.join(RAIZ, 'services', 'etiquetas'))
import despacho_core, verificar
pdfs = [open(os.path.join(OUT, f"guide-{e['venta']}.pdf"), 'rb').read() for e in envios]
malas = []
for e, b in zip(envios, pdfs):
    l = despacho_core.leer_etiqueta(b, f"guide-{e['venta']}.pdf")
    if l['venta'] != e['venta'] or l['guia'] != e['guia'] or l['carrier'] != e['carrier'] \
            or not (l['remitente'] or '').upper().startswith(e['remitente']):
        malas.append((e['venta'], l))
if malas:
    raise SystemExit(f'Lectura distinta a lo esperado: {malas[:3]}')
ventas = [e['venta'] for e in envios]
sales_map = {e['venta']: ([f"{x['cantidad']} - {x['titulo']}" for x in e['items']], e['nota'] or '') for e in envios}
armado = despacho_core.armar_pdf(pdfs, sales_map, ventas)
fallas = [r for r in verificar.verificar(pdfs, armado) if r['faltan'] or not r['esperados']]
open(os.path.join(OUT, '_prueba_armado.pdf'), 'wb').write(armado)
print('lectura OK; armado', len(pdfs), 'etiquetas; verificación de códigos:', 'OK' if not fallas else fallas[:3])
