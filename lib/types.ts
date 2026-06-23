export type Country = 'VE' | 'CO'
export type UserRole = 'admin' | 'user'

// ─── Auth ───────────────────────────────────────────
export interface AuthUser {
  id: number
  username: string
  full_name: string
  role: UserRole
  country: Country
}

// ─── Profit Categories ──────────────────────────────
export interface ProfitCategory {
  id: number
  name: string
  profit_percentage: number
  color: string
  description: string | null
  display_order: number
}

// ─── Products ───────────────────────────────────────
export interface Product {
  id: number
  code: string
  name: string
  is_active: boolean
  base_cost: number
  shipping_cost: number
  total_cost: number
  base_price_usd: number
  published_price_usd: number
  final_price_usd: number
  price_bolivares: number
  discount_percent: number
  category_name: string | null
  profit_percentage: number
  profit_category_id: number | null
  sale_price: number
  quantity: number
}

export interface MLCode {
  account: string
  code: string
}

// ─── Finance (módulo global VE+CO) ──────────────────
export type FinanceKind = 'income' | 'expense'

export interface FinanceAccount {
  id: number
  name: string
  type: string          // banco|efectivo|cripto|paypal|otro
  currency: string      // USD|COP|VES
  balance: number
  is_reserve: boolean
  is_active: boolean
  display_order: number
  notes: string | null
}

export interface FinanceCategory {
  id: number
  name: string
  kind: FinanceKind
  is_active: boolean
  display_order: number
}

export interface FinanceMovement {
  id: number
  date: string
  description: string | null
  amount: number
  kind: FinanceKind
  currency: string
  category_id: number | null
  category_name: string | null
  account_id: number | null
  account_name: string | null
  country: string | null
  source: 'manual' | 'auto'
  ref_type: string | null
  ref_id: number | null
  created_by: number | null
  created_at: string
}

// ─── Inventory ──────────────────────────────────────
export type StockStatus = 'OK' | 'BAJO' | 'SIN_STOCK' | 'INACTIVO'

export interface InventoryItem {
  product_id: number
  code: string
  name: string
  is_active: boolean
  base_cost: number
  shipping_cost: number
  total_cost: number
  final_price_usd: number
  inventory_id: number
  quantity: number
  min_stock: number
  max_stock: number
  sale_price: number
  last_updated: string | null
  ventas_6m: number
  min_stock_rec: number
  max_stock_rec: number
  status: StockStatus
}

export interface InventoryMovement {
  id: number
  movement_type: 'IN' | 'OUT' | 'ADJUST'
  quantity: number
  reference: string | null
  notes: string | null
  created_at: string
  username: string
  running_total: number
}

// ─── Exchange Rates (VE only) ────────────────────────
export interface ExchangeRate {
  id: number
  official_rate: number
  parallel_rate: number
  spread_percentage: number
  excess_percentage: number
  recommended_discount: number
  rate_date: string | null
  created_at: string | null
  source: string
}

// ─── Suppliers ──────────────────────────────────────
export interface Supplier {
  id: number
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  notes: string | null
}

// ─── Purchase Orders ────────────────────────────────
export type PurchaseStatus =
  | 'PENDIENTE' | 'PAGADA' | 'EN_CAMINO' | 'RECIBIDA'
  | 'PARCIAL' | 'FINALIZADA' | 'INCONSISTENTE' | 'REABIERTA'

export interface PurchaseOrderItem {
  id: number
  product_id: number
  product_name: string
  product_code: string
  quantity: number
  unit_cost_usd: number
  total_cost_usd: number
  received_qty: number
  total_received_qty: number
  notes: string | null
}

export interface PurchaseOrder {
  id: number
  order_number: string
  status: PurchaseStatus
  order_type: 'local' | 'import'
  total_usd: number
  total_paid: number
  notes: string | null
  created_at: string | null
  updated_at: string | null
  tracking_info: string | null
  supplier_id: number | null
  supplier_name: string
  created_by: string | null
  received_by: string | null
  received_at: string | null
  is_incomplete: boolean
  incomplete_note: string | null
  reopen_count: number
  items: PurchaseOrderItem[]
}

// ─── Import Orders ──────────────────────────────────
export type ImportStatus =
  | 'PENDIENTE' | 'PAGO_PARCIAL' | 'ESPERANDO_FOTOS' | 'PAGADA'
  | 'EN_TRANSITO' | 'ADUANA' | 'EN_IMPORTADOR_PAGAR' | 'EN_CAMINO'
  | 'RECIBIDA' | 'PARCIAL' | 'FINALIZADA' | 'INCONSISTENTE'

export interface ImportOrder {
  id: number
  order_number: string
  status: ImportStatus
  total_usd: number
  paid_50_done: boolean
  paid_50_at: string | null
  paid_50_amount: number
  paid_100_done: boolean
  paid_100_at: string | null
  paid_100_amount: number
  tracking_number: string | null
  shipping_company: string | null
  shipping_number: string | null
  shipping_cost: number
  insurance_cost: number
  customs_cost: number
  warehouse_cost: number
  box_count: number
  photos_notes: string | null
  origin_country: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  supplier_id: number | null
  supplier_name: string
  created_by: string | null
  received_by: string | null
  received_at: string | null
  file_count: number
  container_id: number | null
  container_code: string | null
  items: PurchaseOrderItem[]
}

// ─── Import Containers (agrupación de importaciones) ──
export type ContainerStatus = 'ABIERTO' | 'EN_TRANSITO' | 'RECIBIDO' | 'CERRADO'

export interface ImportContainer {
  id: number
  code: string
  name: string | null
  status: ContainerStatus
  origin_country: string | null
  tracking_number: string | null
  shipping_cost: number | null
  eta: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  order_count: number
  total_usd: number
  total_boxes: number
}

// ─── Sales ──────────────────────────────────────────
export type SaleStatus =
  | 'BORRADOR' | 'PAGO_VERIFICADO' | 'PROCESADA'
  | 'DESCARGADA' | 'DESCARGADA_LOCAL' | 'REABIERTA'

export interface SaleItem {
  id: number
  product_id: number
  product_name: string
  product_code: string
  quantity: number
  unit_price: number
  total_price: number
  notes: string | null
}

export interface Sale {
  id: number
  ml_order_number: string
  status: SaleStatus
  customer_name: string
  total_amount: number
  discount_percent: number
  notes: string | null
  created_at: string | null
  updated_at: string | null
  payment_verified_at: string | null
  processed_at: string | null
  created_by: string | null
  verified_by: string | null
  processed_by: string | null
  reopen_count: number
  is_flex: boolean
  items: SaleItem[]
}

// ─── Dashboard ──────────────────────────────────────
export interface DashboardSummary {
  active_products: number
  sales_count_month: number
  sales_amount_month: number
  costs_month: number
  profit_month: number
  profit_pct: number
  low_stock_alerts: number
  no_stock: number
  pending_sales: number
  in_transit: number
  remate_count: number
  last_month_sales_amount: number
}

export interface BonusProgress {
  current_phase: number | null
  current_phase_label: string | null
  phase_progress_pct: number
  completed_phases: number[]
  all_complete: boolean
  has_bonus: boolean
  bonus_earned: number
  sales_amount: number
  last_month_sales: number
}
