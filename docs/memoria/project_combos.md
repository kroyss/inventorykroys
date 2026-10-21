---
name: project-combos
description: "Combos (mig 098, prod 16-10): product_ml_codes.unidades = cuántas unidades del producto trae cada publicación de ML; ventas multiplican, la IA divide el stock; sugerencia por título; revisión de posibles combos en Productos"
metadata:
  type: project
---

En producción desde el 2026-10-16 (commit 8e3cd28, migración 098). Pedido del dueño: Wilmer vincula publicaciones (suelto, combo de 2/4/6, varias cuentas) al MISMO producto del inventario (por unidad).

- `product_ml_codes.unidades` (1 por defecto), `titulo`, `combo_revisado`.
- Ventas (VentasForm + /api/sales/ml-orden): cantidad = lo comprado × unidades; al vincular ("¿Esta publicación siempre es…?") hay un campo "Trae N u." que propone `lib/combos.ts → unidadesDelTitulo` ("Combo 4", "Pack de 6", "x2", "4und"; ignora 10w/20cm/500gb).
- IA de Preguntas/Mensajes: stock disponible de una publicación = inventario ÷ unidades.
- Productos: etiqueta "combos ×2 ×4", filtro "Con combos", aviso "N publicaciones parecen combo" (Revisar → poner unidades o "No es combo"), y en la ficha "Publicaciones en MercadoLibre" por cuenta con "trae N u." editable y ✕ para quitar el vínculo.
- No cubre kits de productos distintos (una publicación → varios productos) ni el stock en ML de cada combo.

**16-10 noche (24d01ce): en VENTAS se volvió a como era**, pedido del dueño y de su usuario (molestó al facturar rifas). Al cargar una venta de ML se vincula el código ML al producto y la cantidad la pone la persona: sin "Trae N u.", sin sugerencia por título y sin multiplicar por combo. Vincular desde Ventas no cambia las unidades que ya tenga la publicación. Siguen en pie: ficha del producto (trae N u.), "Revisar combos" en Productos y la división de stock para la IA. NO volver a meter combos automáticos en Ventas.

**16-10 noche (5ac8b08): COMBOS QUITADOS DE TODOS LADOS "de momento"** (pedido del dueño). Ventas, Productos (aviso, filtro, etiqueta), ficha (vuelve "Códigos ML") e IA (sin dividir stock) quedaron idénticos a antes de 8e3cd28. Borrados: CombosML.tsx, lib/combos.ts, /api/products/[id]/publicaciones, /api/products/posibles-combos. Las columnas de la mig 098 (unidades, titulo, combo_revisado) quedan en la base sin uso (2 publicaciones con unidades>1). Si se retoma: solo manual, nunca adivinar por título (rifas "100 números").
