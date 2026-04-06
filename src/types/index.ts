export type Role = 'djelatnik' | 'admin'
export type SessionStatus = 'otvoreno' | 'u_tijeku' | 'zakljucano'
export type MatchStatus = 'prijedlog' | 'potvrdjeno' | 'odbijeno'

export interface Warehouse {
  id: string
  name: string
  created_at: string
}

export interface Product {
  id: string
  code: string
  name: string
  barcode: string | null
  is_active: boolean
  created_at: string
}

export interface BbmStock {
  id: string
  product_id: string
  warehouse_id: string
  quantity: number
  imported_at: string
}

export interface Profile {
  id: string
  full_name: string
  role: Role
  created_at: string
}

export interface InventorySession {
  id: string
  name: string
  warehouse_id: string
  status: SessionStatus
  created_by: string
  created_at: string
  closed_at: string | null
  warehouses?: Warehouse
}

export interface InventoryCount {
  id: string
  session_id: string
  product_id: string
  counted_quantity: number
  last_updated_by: string
  updated_at: string
  products?: Product
}

export interface InventoryLog {
  id: string
  session_id: string
  product_id: string
  user_id: string
  change_qty: number
  note: string | null
  created_at: string
  products?: Product
  profiles?: Profile
}

export interface TransferMatch {
  id: string
  product_id: string
  from_warehouse_id: string
  to_warehouse_id: string
  quantity: number
  status: MatchStatus
  created_at: string
  products?: Product
}

export interface DifferenceRow {
  product_id: string
  product_code: string
  product_name: string
  warehouse_id: string
  bbm_quantity: number
  counted_quantity: number
  difference: number
  status: 'visak' | 'manjak' | 'ok'
}