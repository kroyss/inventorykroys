import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/db'
import ComprasTabs from '@/components/compras/ComprasTabs'
import type { PurchaseOrder, ImportOrder, Supplier } from '@/lib/types'

export const metadata = { title: 'Compras — Syncsora Inventory' }

export default async function ComprasPage() {
  const session = await getServerSession(authOptions)
  const db      = getDb(session!.user.country)

  const [{ rows: orders }, { rows: imports }, { rows: localSup }, { rows: importSup }] = await Promise.all([
    db.query(`
      SELECT
        po.id, po.order_number, po.status, po.order_type,
        po.total_usd::float  AS total_usd,
        po.total_paid::float AS total_paid,
        po.notes, po.tracking_info,
        po.is_incomplete, po.incomplete_note, po.reopen_count,
        u.username AS received_by,
        po.received_at, po.created_at,
        s.id   AS supplier_id,
        s.name AS supplier_name,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id',               poi.id,
              'product_id',       poi.product_id,
              'product_code',     p.code,
              'product_name',     p.name,
              'quantity',         poi.quantity,
              'unit_cost_usd',    poi.unit_cost_usd::float,
              'total_cost_usd',   poi.total_cost_usd::float,
              'received_qty',     poi.received_qty,
              'total_received_qty', poi.total_received_qty,
              'notes',            poi.notes
            ) ORDER BY poi.id
          ) FILTER (WHERE poi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN users     u ON po.received_by = u.id
      LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
      LEFT JOIN products p ON poi.product_id = p.id
      WHERE po.order_type = 'local'
      GROUP BY po.id, s.id, u.username
      ORDER BY
        CASE po.status
          WHEN 'PENDIENTE'     THEN 0
          WHEN 'PAGADA'        THEN 1
          WHEN 'EN_CAMINO'     THEN 2
          WHEN 'RECIBIDA'      THEN 3
          WHEN 'PARCIAL'       THEN 4
          WHEN 'INCONSISTENTE' THEN 5
          WHEN 'REABIERTA'     THEN 6
          WHEN 'FINALIZADA'    THEN 7
          ELSE 8
        END,
        po.created_at DESC
    `),
    db.query(`
      SELECT
        io.id, io.order_number, io.status,
        io.total_usd::float       AS total_usd,
        io.paid_50_done, io.paid_50_at,
        io.paid_50_amount::float  AS paid_50_amount,
        io.paid_100_done, io.paid_100_at,
        io.paid_100_amount::float AS paid_100_amount,
        io.tracking_number, io.shipping_company, io.shipping_number,
        io.shipping_cost::float   AS shipping_cost,
        io.insurance_cost::float  AS insurance_cost,
        io.customs_cost::float    AS customs_cost,
        io.warehouse_cost::float  AS warehouse_cost,
        io.photos_notes, io.origin_country, io.notes, io.box_count,
        io.received_by, io.received_at,
        io.created_at, io.updated_at,
        s.id   AS supplier_id,
        s.name AS supplier_name,
        uc.username AS created_by,
        io.container_id, ct.code AS container_code,
        (SELECT COUNT(*) FROM import_order_files f WHERE f.import_order_id = io.id) AS file_count,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id',                 ioi.id,
              'product_id',         ioi.product_id,
              'product_code',       p.code,
              'product_name',       p.name,
              'quantity',           ioi.quantity,
              'unit_cost_usd',      ioi.unit_cost_usd::float,
              'total_cost_usd',     ioi.total_cost_usd::float,
              'received_qty',       COALESCE(ioi.received_qty, 0),
              'total_received_qty', COALESCE(ioi.total_received_qty, 0),
              'notes',              ioi.notes
            ) ORDER BY ioi.id
          ) FILTER (WHERE ioi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM import_orders io
      LEFT JOIN suppliers s  ON io.supplier_id = s.id
      LEFT JOIN users uc     ON io.created_by  = uc.id
      LEFT JOIN import_containers ct ON ct.id = io.container_id
      LEFT JOIN import_order_items ioi ON ioi.import_order_id = io.id
      LEFT JOIN products p ON p.id = ioi.product_id
      GROUP BY io.id, s.id, uc.username, ct.code
      ORDER BY
        CASE io.status
          WHEN 'PENDIENTE'           THEN 0
          WHEN 'PAGO_PARCIAL'        THEN 1
          WHEN 'ESPERANDO_FOTOS'     THEN 2
          WHEN 'PAGADA'              THEN 3
          WHEN 'EN_TRANSITO'         THEN 4
          WHEN 'ADUANA'              THEN 5
          WHEN 'EN_IMPORTADOR_PAGAR' THEN 6
          WHEN 'EN_CAMINO'           THEN 7
          WHEN 'RECIBIDA'            THEN 8
          WHEN 'PARCIAL'             THEN 9
          WHEN 'INCONSISTENTE'       THEN 10
          WHEN 'FINALIZADA'          THEN 11
          ELSE 12
        END,
        io.created_at DESC
    `),
    db.query(`
      SELECT id, name, contact, phone, email
      FROM suppliers
      WHERE is_active = TRUE AND (supplier_type = 'local' OR supplier_type IS NULL)
      ORDER BY name
    `),
    db.query(`
      SELECT id, name, contact, phone, email
      FROM suppliers
      WHERE is_active = TRUE AND supplier_type = 'import'
      ORDER BY name
    `),
  ])

  return (
    <ComprasTabs
      initialOrders={orders as PurchaseOrder[]}
      initialImports={imports as ImportOrder[]}
      localSuppliers={localSup as Supplier[]}
      importSuppliers={importSup as Supplier[]}
      userRole={session!.user.role}
      country={session!.user.country}
    />
  )
}
