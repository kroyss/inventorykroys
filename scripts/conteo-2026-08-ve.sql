-- Ajuste de inventario por el conteo fisico de agosto 2026 (VE).
--
-- El conteo se hizo el 2026-08-14 sobre la hoja de inventario. De 201 productos,
-- 126 coincidieron (no se tocan: sin diferencia no hay movimiento) y 74 no.
--
-- Se matchea por CODIGO, que es inmutable. Por nombre es fragil: un doble espacio
-- o un renombre y la fila no entra (paso con el Switch HDMI y con la Barra LED).
--
-- Se aplica la DIFERENCIA (fisico - sistema al momento del conteo), no el valor
-- absoluto contado: si entre el conteo y la ejecucion de este script hubo ventas
-- o recepciones, esos movimientos son reales y deben conservarse.
--
-- Cada ajuste queda en inventory_movements con reference = 'CONTEO-2026-08', que
-- es lo que agrupa el reporte de Reportes -> Conteos.
--
-- Ejecutar UNA sola vez, contra la base de VENEZUELA:
--   docker exec -i inventory_db_ve psql -v ON_ERROR_STOP=1 -U postgres -d inventory_ve < /opt/inventory_next/scripts/conteo-2026-08-ve.sql
--
-- Aborta sin dejar nada a medias si: algun codigo no existe o esta inactivo, si
-- falta la fila de inventario, si el conteo ya fue aplicado o si algun stock
-- quedaria negativo.

SET client_encoding = 'UTF8';

BEGIN;

CREATE TEMP TABLE conteo (code text PRIMARY KEY, sys int, fis int) ON COMMIT DROP;

INSERT INTO conteo (code, sys, fis) VALUES
  ('COD-0011',  16,   9),   -- Bandas Elasticas Tubulares
  ('COD-0012',  22,  13),   -- Barra 17CM Led Panel Luz Carro x PAR
  ('COD-0023',  50,  48),   -- Base para Colgar Bicicleta Pared Vertical
  ('COD-0021',   2,   0),   -- Base Starlink Mini Antena para vidrio
  ('COD-0030',  35,  28),   -- Bolsa de Seguridad Blanca 17x30 cm
  ('COD-0031',  46,  30),   -- Bolsa de Seguridad Blanca 20x30 cm
  ('COD-0032', 105, 100),   -- Bolsa de Seguridad Blanca 25x35 cm
  ('COD-0034',  20,  17),   -- Bolsa de Seguridad Blanca 35x45 cm
  ('COD-0035',  52,  40),   -- Bolsa de Seguridad Negra 17x30 cm
  ('COD-0036',  43,  30),   -- Bolsa de Seguridad Negra 20x30 cm
  ('COD-0037',  62,  58),   -- Bolsa de Seguridad Negra 25x35 cm
  ('COD-0040',  23,  20),   -- Bolsa de Seguridad Negra 35x45 cm
  ('COD-0047',  31,  16),   -- Botas Impermeable LATEX
  ('COD-0054',  43,  42),   -- Cable Convertidor USB C a HDMI 4K
  ('COD-0056',  88,  85),   -- Cable Hdmi 2.0 X 1.5 Metros Hd 2k 4k
  ('COD-0057',   7,   6),   -- Cable Hdmi 2.0 X 3 Metros Hd 2k 4k
  ('COD-0382',   1,   0),   -- Cable USB C a Lan RJ45 1000MBPS
  ('COD-0064',  15,   5),   -- Cables USB Power para Módem 12v
  ('COD-0069',  28,  26),   -- Caja Disco Duro SATA - USB 3.0
  ('COD-0133',  30,  28),   -- Candado Correa Bicicleta - CLAVE 4 DIGITOS
  ('COD-0085',   2,   1),   -- Carton Corrugado
  ('COD-0090', 160, 132),   -- Chip LED 10W Blanco Calido
  ('COD-0104',   1,   0),   -- Convertidor AdaptadorDisplayPortPd A VGA
  ('COD-0101',  20,  10),   -- Convertidor Display Port Pd A Hdmi HD
  ('COD-0108',   2,   0),   -- Convertidor DisplayPortHdmi HD (sin cable)
  ('COD-0110',  33,  25),   -- Convertidor HDMI-RCA
  ('COD-0113',   9,   6),   -- Convertidor Mini Display Port a HDMI 4K Blanco
  ('COD-0114',   1,   0),   -- Convertidor Mini Display Port a HDMI 4K Negro
  ('COD-0124',   3,   0),   -- Convertidor USB 3.0 a LAN Red RJ45 100MBPS
  ('COD-0125',   1,   0),   -- Convertidor USB 3.0 a LAN Red RJ45 GIGABITE 1000MBPS
  ('COD-0140',   2,   0),   -- Disco Duro SolidoSsd240gbPatriot Burst Elite Sata
  ('COD-0292',  13,  25),   -- Envoplast Negro 20CMx500M
  ('COD-0294',  68,  56),   -- Envoplast Negro 50CMx500M
  ('COD-0296',   9,  11),   -- Envoplast Transparente 20CMx500M
  ('COD-0295',   5,   4),   -- Envoplast Transparente 30CMx500M
  ('COD-0165',   3,   1),   -- Griferia LLave Negro Mate Lavaplatos
  ('COD-0170',   1,   3),   -- Higrometro Digital Termometro HTC-2
  ('COD-0387',   2,   1),   -- Hub 7en1 5xUSB3.0+2xUSBC
  ('COD-0177',   3,   1),   -- Hub USB C Adaptador 8 en 1 HDMI 4k RJ45
  ('COD-0169',  51,  40),   -- HUB USB C x 4 USB
  ('COD-0181',  24,   0),   -- Intercomunicador Manos Libres V10
  ('COD-0184',  10,   9),   -- Intercomunicador V-P-Y 10 2X
  ('COD-0384',   1,   0),   -- Intercomunicador Y12 V12 Individual
  ('COD-0194',   2,  13),   -- Interruptor Inteligente 4TomaNegro (dos anillos)
  ('COD-0195',  13,  10),   -- Interruptor Inteligente Smart 1 Toma Blanco
  ('COD-0196',  22,  18),   -- Interruptor Inteligente Smart 1 Toma Negro
  ('COD-0197',   8,   3),   -- Interruptor Inteligente Smart 2 Toma Blanco
  ('COD-0198',  14,   7),   -- Interruptor Inteligente Smart 2 Toma Negro
  ('COD-0200',  50,  49),   -- Interruptor Inteligente Smart 3 Toma Negro
  ('COD-0201',  10,   1),   -- Interruptor Inteligente Smart 4 Toma Blanco
  ('COD-0202',   6,   4),   -- Interruptor Inteligente Smart 4 Toma Negro
  ('COD-0217',   7,   6),   -- Luces Linterna Bicicleta 3 Modos Sencilla
  ('COD-0246',  30,  10),   -- Odometro Modelo SD-563A
  ('COD-0152',  87,  82),   -- Par Extensor Hdmi RJ45 Lan Convertidor Cable Red
  ('COD-0276',  57,  54),   -- Presentador Apuntador Nuevo Modelo
  ('COD-0277', 121,  90),   -- Presentador Apuntador Viejo Modelo
  ('COD-0281',   1,  13),   -- Regleta Luces RGB 5M Bluetooth+ Control
  ('COD-0297',  40,  54),   -- Rollo Envoplast Transparente 50CMX500M
  ('COD-0299',  22,  15),   -- Rollos Papel Burbuja
  ('COD-0305',   3,   2),   -- Ruedas Sillas Oficina Negro/Gris
  ('COD-0383',   4,   1),   -- Ruedas Sillas Oficina Silicon KIT
  ('COD-0310',  15,  14),   -- Set 3 Repisas Minimalista (40x3)
  ('COD-0316',  17,  27),   -- Set 4 Repisas Minimalista Wengue
  ('COD-0323',  12,  13),   -- Switch HDMI 3 en 1 (1080) (4K)
  ('COD-0326',  17,  12),   -- TEE HDMI Macho a HDMI Hembra
  ('COD-0346',  27,  24),   -- Termometro Digital sin Sonda
  ('COD-0347',   1,   0),   -- Termometro Infrarojo Corporal
  ('COD-0348',  96,  90),   -- Termometro Pistola Infrarrojo Industrial
  ('COD-0349',   2,   5),   -- Timbre Inalambrico Digital con Control
  ('COD-0357',   6,   1),   -- Tomacorriente Enchufe Inteligente Wifi Bluetooth
  ('COD-0365',   5,   0),   -- Voltimetro + Amperimetro 10A
  ('COD-0368', 125, 123),   -- Voltimetro Digital 2 Vias Luz Roja 5-120V
  ('COD-0372',  26,  23),   -- Voltimetro Digital 3 Vias Luz Verde 0-30V
  ('COD-0375',  82,  73);   -- Webcam Hd GuangTouL

DO $$
DECLARE
  v_user   int;
  v_faltan text;
  v_neg    text;
  v_n      int;
BEGIN
  IF EXISTS (SELECT 1 FROM inventory_movements WHERE reference = 'CONTEO-2026-08') THEN
    RAISE EXCEPTION 'El conteo CONTEO-2026-08 ya fue aplicado';
  END IF;

  -- Autor de los movimientos: el primer admin activo (el nombre de usuario varia
  -- entre instalaciones), y si no hubiera ninguno, cualquier usuario activo.
  SELECT id INTO v_user FROM users WHERE role = 'admin' AND is_active ORDER BY id LIMIT 1;
  IF v_user IS NULL THEN
    SELECT id INTO v_user FROM users WHERE is_active ORDER BY id LIMIT 1;
  END IF;
  IF v_user IS NULL THEN RAISE EXCEPTION 'No hay ningun usuario activo para firmar los ajustes'; END IF;
  RAISE NOTICE 'Ajustes firmados por el usuario id=%', v_user;

  -- Codigos que no matchean un producto activo
  SELECT string_agg(c.code, ', ') INTO v_faltan
  FROM conteo c
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.code = c.code AND p.is_active);
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Codigos no encontrados o inactivos: %', v_faltan;
  END IF;

  -- Todo producto contado tiene que tener fila de inventario
  SELECT string_agg(c.code, ', ') INTO v_faltan
  FROM conteo c
  JOIN products p ON p.code = c.code AND p.is_active
  WHERE NOT EXISTS (SELECT 1 FROM inventory i WHERE i.product_id = p.id);
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Sin registro de inventario: %', v_faltan;
  END IF;

  -- Stock que quedaria negativo (mas ventas posteriores al conteo que unidades)
  SELECT string_agg(format('%s (stock %s, delta %s)', c.code, i.quantity, c.fis - c.sys), ', ') INTO v_neg
  FROM conteo c
  JOIN products  p ON p.code = c.code AND p.is_active
  JOIN inventory i ON i.product_id = p.id
  WHERE i.quantity + (c.fis - c.sys) < 0;
  IF v_neg IS NOT NULL THEN
    RAISE EXCEPTION 'El ajuste dejaria stock negativo: %', v_neg;
  END IF;

  -- inventory_movements.quantity guarda el DELTA con signo para ADJUST
  INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_by)
  SELECT p.id, 'ADJUST', c.fis - c.sys, 'CONTEO-2026-08',
         format('Conteo fisico ago-2026: sistema %s -> fisico %s (%s%s)',
                c.sys, c.fis, CASE WHEN c.fis > c.sys THEN '+' ELSE '' END, c.fis - c.sys),
         v_user
  FROM conteo c JOIN products p ON p.code = c.code AND p.is_active;

  UPDATE inventory i
     SET quantity     = i.quantity + (c.fis - c.sys),
         last_updated = NOW()
  FROM conteo c JOIN products p ON p.code = c.code AND p.is_active
  WHERE i.product_id = p.id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Conteo CONTEO-2026-08 aplicado a % productos', v_n;
END $$;

-- Verificacion: stock resultante de cada producto ajustado
SELECT p.code, p.name, m.notes, i.quantity AS stock_final
FROM inventory_movements m
JOIN products  p ON p.id = m.product_id
JOIN inventory i ON i.product_id = m.product_id
WHERE m.reference = 'CONTEO-2026-08'
ORDER BY p.code;

COMMIT;
