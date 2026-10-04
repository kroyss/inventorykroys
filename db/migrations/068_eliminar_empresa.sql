-- 068 · Eliminar una empresa desde Plataforma (2026-10-04).
--
-- plataforma_eliminar_empresa(id, borrar):
--   borrar = false → solo cuenta las filas que tiene en cada tabla (para mostrar qué se perdería);
--   borrar = true  → borra TODO lo de esa empresa, sus usuarios que no entran a otra empresa ni a
--                    otro producto, y su organización si queda vacía.
-- Protecciones (además de que la API solo la llama el dueño de la plataforma):
--   - nunca una empresa de la organización propietaria;
--   - solo una empresa ya DESACTIVADA (dos pasos: desactivar, luego eliminar).
-- Recorre las tablas que tienen empresa_id (así cubre tablas futuras sin tocar esta función) y
-- reintenta en varias pasadas: lo que falla por una FK se borra en la pasada siguiente, cuando sus
-- hijas ya no están. SECURITY DEFINER: corre como dueño (sin RLS) porque inventory_app no puede
-- borrar empresas ni organizaciones.
CREATE OR REPLACE FUNCTION plataforma_eliminar_empresa(p_id INT, p_borrar BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org INT; v_estado TEXT; v_activa BOOLEAN;
  v_tablas TEXT[]; v_pend TEXT[]; t TEXT; n BIGINT; pasada INT;
  v_conteo JSONB := '{}'::jsonb;
  v_usuarios INT[];
  v_borrados INT := 0; v_desactivados INT := 0; u INT;
BEGIN
  SELECT e.organizacion_id, o.estado, e.is_active INTO v_org, v_estado, v_activa
  FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id WHERE e.id = p_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Empresa no encontrada'; END IF;
  IF v_estado = 'propietario' THEN RAISE EXCEPTION 'No se puede eliminar una empresa de la plataforma'; END IF;

  SELECT array_agg(c.table_name::text ORDER BY c.table_name) INTO v_tablas
  FROM information_schema.columns c JOIN information_schema.tables tb
    ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.column_name = 'empresa_id';

  FOREACH t IN ARRAY v_tablas LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE empresa_id = $1', t) INTO n USING p_id;
    IF n > 0 THEN v_conteo := v_conteo || jsonb_build_object(t, n); END IF;
  END LOOP;
  IF NOT p_borrar THEN RETURN jsonb_build_object('filas', v_conteo); END IF;

  IF v_activa THEN RAISE EXCEPTION 'Primero desactiva la empresa'; END IF;

  SELECT array_agg(user_id) INTO v_usuarios FROM usuario_empresas WHERE empresa_id = p_id;

  v_pend := v_tablas;
  FOR pasada IN 1..12 LOOP
    EXIT WHEN cardinality(v_pend) = 0;
    v_tablas := v_pend; v_pend := '{}';
    FOREACH t IN ARRAY v_tablas LOOP
      BEGIN
        EXECUTE format('DELETE FROM %I WHERE empresa_id = $1', t) USING p_id;
      EXCEPTION WHEN foreign_key_violation THEN
        v_pend := v_pend || t;
      END;
    END LOOP;
  END LOOP;
  IF cardinality(v_pend) > 0 THEN
    RAISE EXCEPTION 'No se pudo borrar (quedan datos enlazados en %)', array_to_string(v_pend, ', ');
  END IF;

  DELETE FROM empresas WHERE id = p_id;
  IF NOT EXISTS (SELECT 1 FROM empresas WHERE organizacion_id = v_org) THEN
    DELETE FROM organizaciones WHERE id = v_org;
  END IF;

  -- Sus usuarios: se borran si ya no entran a ninguna empresa ni a otro producto (p. ej. Radar);
  -- si algo global los referencia (p. ej. una tasa que cargaron), se desactivan.
  FOREACH u IN ARRAY COALESCE(v_usuarios, '{}') LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM usuario_empresas WHERE user_id = u);
    IF EXISTS (SELECT 1 FROM users WHERE id = u AND productos <@ ARRAY['inventario']::text[]) THEN
      BEGIN
        DELETE FROM users WHERE id = u;
        v_borrados := v_borrados + 1;
      EXCEPTION WHEN foreign_key_violation THEN
        UPDATE users SET is_active = FALSE, session_version = session_version + 1 WHERE id = u;
        v_desactivados := v_desactivados + 1;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('filas', v_conteo, 'usuarios_borrados', v_borrados, 'usuarios_desactivados', v_desactivados);
END $$;

REVOKE ALL ON FUNCTION plataforma_eliminar_empresa(INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma_eliminar_empresa(INT, BOOLEAN) TO inventory_app;
