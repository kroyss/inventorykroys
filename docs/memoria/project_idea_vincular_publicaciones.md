---
name: project-idea-vincular-publicaciones
description: "Vincular con ML EN PRODUCCIÓN 20-10 (mig 109): /vincular-ml, cada variante = un producto, todo manual con clic (sin gemelas ni limpieza automáticas); empleados con permiso vincular_ml sin ver Productos"
metadata:
  type: project
---

En producción desde 2026-10-20 (mig 109, lib/vincularML.ts, components/productos/VincularMLClient.tsx, /api/vincular-ml).

**Decisiones del dueño (20-10):** nada automático ("las gemelas y limpieza de tu parte me da miedo"): el sistema solo SUGIERE y cada vínculo es un clic de una persona. Cada variante (color/modelo) es un producto aparte en inventario ("Guantes - Azul") → se vincula publicación:variante (product_ml_codes.ml_code "pub:varId"). Todos los empleados con permiso `vincular_ml` (por defecto, solo empresas con inventario); ven pestaña "Vincular ML" sin Productos ni precios. El dueño entra por Productos → "Vincular con ML"; desde ahí "Crear productos desde ML" (el importador viejo /productos/importar-ml). Dudas: "No sé, para Marcos" (ml_vinculo_dudas). Empleado solo deshace lo suyo. Se registra vinculado_por/at.

**Pendiente (no hacer sin OK):** códigos muertos (apuntan a publicaciones que no existen) y vinculación de gemelas en lote; pausadas y productos sin publicar.
