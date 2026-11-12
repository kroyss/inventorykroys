-- 170 · Gasto de IA con su MOTIVO (12-11-2026, el dueño: "quiero ir viendo en qué se está gastando cada centavo").
-- Igual que ia_gasto (mig. 169) más `para`: respuesta, verificador, corrector, fotos, Mi IA, Ayuda… y en las pruebas
-- internas, el nombre de la prueba (Competencia · …, Comparador v3 · …). La versión nueva escribe aquí; ia_gasto queda
-- con lo de las primeras horas (la API lo suma como "sin detalle"). Solo agrega: compatible con la versión anterior.
CREATE TABLE IF NOT EXISTS ia_gasto_para (
  dia       DATE NOT NULL,
  modelo    TEXT NOT NULL,
  tipo      TEXT NOT NULL,              -- 'cuenta' | 'interna'
  para      TEXT NOT NULL,
  llamadas  INTEGER NOT NULL DEFAULT 0,
  entrada   BIGINT NOT NULL DEFAULT 0,
  salida    BIGINT NOT NULL DEFAULT 0,
  busquedas INTEGER NOT NULL DEFAULT 0,
  fallidas  INTEGER NOT NULL DEFAULT 0,
  costo     NUMERIC(12,6) NOT NULL DEFAULT 0,
  primera   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (dia, modelo, tipo, para)
);
GRANT SELECT, INSERT, UPDATE ON ia_gasto_para TO inventory_app;
