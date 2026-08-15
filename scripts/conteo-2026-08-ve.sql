-- Ajuste de inventario por el conteo fisico de agosto 2026 (VE).
--
-- El conteo se hizo el 2026-08-14 sobre la hoja de inventario. De 201 productos,
-- 126 coincidieron (no se tocan: sin diferencia no hay movimiento) y 74 no.
--
-- Se aplica la DIFERENCIA (fisico - sistema al momento del conteo), no el valor
-- absoluto contado: si entre el conteo y la ejecucion de este script hubo ventas
-- o recepciones, esos movimientos son reales y deben conservarse.
--
-- Cada ajuste queda en inventory_movements con reference = 'CONTEO-2026-08', que
-- es lo que agrupa el reporte de conteos.
--
-- Ejecutar UNA sola vez, contra la base de VENEZUELA:
--   docker exec -i inventory_db_ve psql -v ON_ERROR_STOP=1 -U postgres -d inventory_ve < conteo-2026-08-ve.sql
--
-- Aborta sin dejar nada a medias si: algun nombre no existe o esta repetido, si
-- falta la fila de inventario, si el conteo ya fue aplicado o si algun stock
-- quedaria negativo.

SET client_encoding = 'UTF8';   -- hay nombres con tildes (Módem, Higrómetro, Pequeñas)

BEGIN;

CREATE TEMP TABLE conteo (name text PRIMARY KEY, sys int, fis int) ON COMMIT DROP;

INSERT INTO conteo (name, sys, fis) VALUES
  ('Bandas Elasticas Tubulares', 16, 9),
  ('Barra 17CM Led Panel Luz Carro x PAR', 22, 13),
  ('Base para Colgar Bicicleta Pared Vertical', 50, 48),
  ('Base Starlink Mini Antena para vidrio', 2, 0),
  ('Bolsa de Seguridad Blanca 17x30 cm', 35, 28),
  ('Bolsa de Seguridad Blanca 20x30 cm', 46, 30),
  ('Bolsa de Seguridad Blanca 25x35 cm', 105, 100),
  ('Bolsa de Seguridad Blanca 35x45 cm', 20, 17),
  ('Bolsa de Seguridad Negra 17x30 cm', 52, 40),
  ('Bolsa de Seguridad Negra 20x30 cm', 43, 30),
  ('Bolsa de Seguridad Negra 25x35 cm', 62, 58),
  ('Bolsa de Seguridad Negra 35x45 cm', 23, 20),
  ('Botas Impermeable LATEX', 31, 16),
  ('Cable Convertidor USB C a HDMI 4K', 43, 42),
  ('Cable Hdmi 2.0 X 1.5 Metros Hd 2k 4k', 88, 85),
  ('Cable Hdmi 2.0 X 3 Metros Hd 2k 4k', 7, 6),
  ('Cable USB C a Lan RJ45 1000MBPS', 1, 0),
  ('Cables USB Power para Módem 12v', 15, 5),
  ('Caja Disco Duro SATA - USB 3.0', 28, 26),
  ('Candado Correa Bicicleta - CLAVE 4 DIGITOS', 30, 28),
  ('Carton Corrugado', 2, 1),
  ('Chip LED 10W Blanco Calido', 160, 132),
  ('Convertidor AdaptadorDisplayPortPd A VGA', 1, 0),
  ('Convertidor Display Port Pd A Hdmi HD', 20, 10),
  ('Convertidor DisplayPortHdmi HD (sin cable)', 2, 0),
  ('Convertidor HDMI-RCA', 33, 25),
  ('Convertidor Mini Display Port a HDMI 4K Blanco', 9, 6),
  ('Convertidor Mini Display Port a HDMI 4K Negro', 1, 0),
  ('Convertidor USB 3.0 a LAN Red RJ45 100MBPS', 3, 0),
  ('Convertidor USB 3.0 a LAN Red RJ45 GIGABITE 1000MBPS', 1, 0),
  ('Disco Duro SolidoSsd240gbPatriot Burst Elite Sata', 2, 0),
  ('Envoplast Negro 20CMx500M', 13, 25),
  ('Envoplast Negro 50CMx500M', 68, 56),
  ('Envoplast Transparente 20CMx500M', 9, 11),
  ('Envoplast Transparente 30CMx500M', 5, 4),
  ('Griferia LLave Negro Mate Lavaplatos', 3, 1),
  ('Higrometro Digital Termometro HTC-2', 1, 3),
  ('Hub 7en1 5xUSB3.0+2xUSBC', 2, 1),
  ('Hub USB C Adaptador 8 en 1 HDMI 4k RJ45', 3, 1),
  ('HUB USB C x 4 USB', 51, 40),
  ('Intercomunicador Manos Libres V10', 24, 0),
  ('Intercomunicador V-P-Y 10 2X', 10, 9),
  ('Intercomunicador Y12 V12 Individual', 1, 0),
  ('Interruptor Inteligente 4TomaNegro (dos anillos)', 2, 13),
  ('Interruptor Inteligente Smart 1 Toma Blanco', 13, 10),
  ('Interruptor Inteligente Smart 1 Toma Negro', 22, 18),
  ('Interruptor Inteligente Smart 2 Toma Blanco', 8, 3),
  ('Interruptor Inteligente Smart 2 Toma Negro', 14, 7),
  ('Interruptor Inteligente Smart 3 Toma Negro', 50, 49),
  ('Interruptor Inteligente Smart 4 Toma Blanco', 10, 1),
  ('Interruptor Inteligente Smart 4 Toma Negro', 6, 4),
  ('Luces Linterna Bicicleta 3 Modos Sencilla', 7, 6),
  ('Odometro Modelo SD-563A', 30, 10),
  ('Par Extensor Hdmi RJ45 Lan Convertidor Cable Red', 87, 82),
  ('Presentador Apuntador Nuevo Modelo', 57, 54),
  ('Presentador Apuntador Viejo Modelo', 121, 90),
  ('Regleta Luces RGB 5M Bluetooth+ Control', 1, 13),
  ('Rollo Envoplast Transparente 50CMX500M', 40, 54),
  ('Rollos Papel Burbuja', 22, 15),
  ('Ruedas Sillas Oficina Negro/Gris', 3, 2),
  ('Ruedas Sillas Oficina Silicon KIT', 4, 1),
  ('Set 3 Repisas Minimalista (40x3)', 15, 14),
  ('Set 4 Repisas Minimalista Wengue', 17, 27),
  ('Switch HDMI 3 en 1 (1080) (4K)', 12, 13),
  ('TEE HDMI Macho a HDMI Hembra', 17, 12),
  ('Termometro Digital sin Sonda', 27, 24),
  ('Termometro Infrarojo Corporal', 1, 0),
  ('Termometro Pistola Infrarrojo Industrial', 96, 90),
  ('Timbre Inalambrico Digital con Control', 2, 5),
  ('Tomacorriente Enchufe Inteligente Wifi Bluetooth', 6, 1),
  ('Voltimetro + Amperimetro 10A', 5, 0),
  ('Voltimetro Digital 2 Vias Luz Roja 5-120V', 125, 123),
  ('Voltimetro Digital 3 Vias Luz Verde 0-30V', 26, 23),
  ('Webcam Hd GuangTouL', 82, 73);

DO $$
DECLARE
  v_user   int;
  v_faltan text;
  v_dupes  text;
  v_neg    text;
  v_n      int;
BEGIN
  IF EXISTS (SELECT 1 FROM inventory_movements WHERE reference = 'CONTEO-2026-08') THEN
    RAISE EXCEPTION 'El conteo CONTEO-2026-08 ya fue aplicado';
  END IF;

  SELECT id INTO v_user FROM users WHERE username = 'admin' AND is_active LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'No se encontro el usuario admin'; END IF;

  -- Nombres que no matchean un producto activo (renombrados, desactivados, etc.)
  SELECT string_agg(c.name, E'
  ') INTO v_faltan
  FROM conteo c
  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = c.name AND p.is_active);
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION E'Productos no encontrados:
  %', v_faltan;
  END IF;

  -- Nombres duplicados: no se puede saber a cual de los dos va el ajuste
  SELECT string_agg(d.name, E'
  ') INTO v_dupes FROM (
    SELECT c.name
    FROM conteo c
    JOIN products p ON p.name = c.name AND p.is_active
    GROUP BY c.name HAVING count(*) > 1
  ) d;
  IF v_dupes IS NOT NULL THEN
    RAISE EXCEPTION E'Nombres repetidos en products:
  %', v_dupes;
  END IF;

  -- Todo producto contado tiene que tener fila de inventario
  SELECT string_agg(c.name, E'
  ') INTO v_faltan
  FROM conteo c
  JOIN products p ON p.name = c.name AND p.is_active
  WHERE NOT EXISTS (SELECT 1 FROM inventory i WHERE i.product_id = p.id);
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION E'Sin registro de inventario:
  %', v_faltan;
  END IF;

  -- Stock que quedaria negativo (mas ventas posteriores al conteo que unidades)
  SELECT string_agg(format('%s (%s %s)', c.name, i.quantity, c.fis - c.sys), E'
  ') INTO v_neg
  FROM conteo c
  JOIN products  p ON p.name = c.name AND p.is_active
  JOIN inventory i ON i.product_id = p.id
  WHERE i.quantity + (c.fis - c.sys) < 0;
  IF v_neg IS NOT NULL THEN
    RAISE EXCEPTION E'El ajuste dejaria stock negativo:
  %', v_neg;
  END IF;

  -- inventory_movements.quantity guarda el DELTA con signo para ADJUST
  INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_by)
  SELECT p.id, 'ADJUST', c.fis - c.sys, 'CONTEO-2026-08',
         format('Conteo fisico ago-2026: sistema %s -> fisico %s (%s%s)',
                c.sys, c.fis, CASE WHEN c.fis > c.sys THEN '+' ELSE '' END, c.fis - c.sys),
         v_user
  FROM conteo c JOIN products p ON p.name = c.name AND p.is_active;

  UPDATE inventory i
     SET quantity     = i.quantity + (c.fis - c.sys),
         last_updated = NOW()
  FROM conteo c JOIN products p ON p.name = c.name AND p.is_active
  WHERE i.product_id = p.id;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Conteo CONTEO-2026-08 aplicado a % productos', v_n;
END $$;

-- Verificacion: stock resultante de cada producto ajustado
SELECT p.name, m.notes, i.quantity AS stock_final
FROM inventory_movements m
JOIN products  p ON p.id = m.product_id
JOIN inventory i ON i.product_id = m.product_id
WHERE m.reference = 'CONTEO-2026-08'
ORDER BY p.name;

COMMIT;
