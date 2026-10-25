-- 122 · Módulo `etiquetas` (25-10): "Imprimir etiquetas" de Inventario deja de ser para todos y pasa a ser un
-- módulo. Se prende solo en SolucionesMC VE y CO (inventario completo); a un cliente, desde Plataforma.
-- Solo agrega: compatible con la versión anterior (que muestra el botón a todos). Idempotente.
UPDATE empresas SET modulos = array_append(modulos, 'etiquetas')
WHERE id IN (1, 2) AND NOT ('etiquetas' = ANY (modulos));
