export type PlanId = 'trial' | 'basic' | 'medium' | 'premium';
export type Feature =
  | 'products'
  | 'stock'
  | 'sales'
  | 'orders'
  | 'debts'
  | 'financials'
  | 'employees'
  | 'multi_store'
  | 'settings'
  | 'billing';

export interface Session {
  user: {
    id: string;
    name: string;
    phone: string;
    role: 'owner' | 'employee';
  };
  store: { id: string; name: string; code: string };
  organization: { id: string; name: string };
  subscription: {
    plan: PlanId;
    expires_at: string;
    active: boolean;
    max_products: number;
    max_employees: number;
    max_stores: number;
  };
  permissions: Record<Feature, boolean>;
}

export interface PageResult<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface Product {
  id: string;
  name: string;
  barcode: string | null;
  category: string;
  cost_milliemes: number;
  stock: number;
  min_stock: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  number: number;
  customer_name: string;
  payment_method: 'cash' | 'card' | 'transfer';
  subtotal_milliemes: number;
  cost_milliemes: number;
  delivery_fee_milliemes: number;
  total_milliemes: number;
  order_id: string | null;
  created_at: string;
}

export interface SaleItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_milliemes: number;
  unit_cost_milliemes: number;
}

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export interface Order {
  id: string;
  number: number;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string;
  address: string;
  note: string;
  delivery_fee_milliemes: number;
  subtotal_milliemes: number;
  sale_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  stock: number;
  quantity: number;
  unit_price_milliemes: number | null;
}

export interface Debt {
  id: string;
  customer_name: string;
  customer_phone: string;
  note: string;
  total_milliemes: number;
  amount_paid_milliemes: number;
  due_date: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  name: string;
  phone: string;
  store_id: string;
  permissions: Partial<Record<'products' | 'stock' | 'sales' | 'orders' | 'debts', boolean>>;
  daily_wage_milliemes: number;
  active: boolean;
  created_at: string;
}

export interface Store {
  id: string;
  organization_id: string;
  name: string;
  address: string;
  code: string;
  active: boolean;
  created_at: string;
}

export interface DashboardSummary {
  today_revenue_milliemes: number;
  today_sales: number;
  today_gross_profit_milliemes: number | null;
  products_count: number;
  low_stock_count: number;
  pending_orders: number;
  outstanding_debts_milliemes: number | null;
  recent_sales: Sale[];
  low_stock_products: Product[];
  timezone: 'Africa/Tunis';
  generated_at: string;
}

export interface ApiErrorPayload {
  error?: { code?: string; message?: string };
}
