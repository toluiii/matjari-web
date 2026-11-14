import type {
  DashboardSummary,
  Debt,
  Employee,
  Order,
  OrderItem,
  PageResult,
  Product,
  Sale,
  SaleItem,
  Session,
  Store,
} from '@/lib/types';
import type { ApiErrorPayload } from '@/lib/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(status: number, code: string, message: string, requestId: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

type RequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: unknown;
  headers?: HeadersInit;
  idempotencyKey?: boolean | string;
};

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = fetch('/api/auth/csrf', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) throw new ApiError(response.status, 'csrf_unavailable', 'تعذّر تهيئة جلسة آمنة. أعد تحميل الصفحة.');
        const result = (await response.json()) as { csrf_token?: unknown };
        if (typeof result.csrf_token !== 'string' || !/^[a-f\d]{64}$/i.test(result.csrf_token)) {
          throw new ApiError(502, 'csrf_invalid', 'تعذّر تهيئة جلسة آمنة. أعد تحميل الصفحة.');
        }
        csrfToken = result.csrf_token;
        return result.csrf_token;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

function notifyUnauthorized(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('matjari:unauthorized'));
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body: inputBody, headers: inputHeaders, idempotencyKey, ...requestInit } = options;
  const method = (requestInit.method ?? 'GET').toUpperCase();
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const headers = new Headers(inputHeaders);
  headers.set('Accept', 'application/json');

  let body: BodyInit | undefined;
  if (inputBody !== undefined) {
    if (inputBody instanceof FormData || inputBody instanceof Blob || typeof inputBody === 'string') {
      body = inputBody;
    } else {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(inputBody);
    }
  }

  if (isMutation) {
    headers.set('X-Matjari-Client', 'web');
    headers.set('X-CSRF-Token', await getCsrfToken());
    if (idempotencyKey) headers.set('Idempotency-Key', typeof idempotencyKey === 'string' ? idempotencyKey : crypto.randomUUID());
  }

  const response = await fetch(`/api${path}`, {
    ...requestInit,
    method,
    headers,
    body,
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
    const code = payload?.error?.code ?? 'request_failed';
    const message = payload?.error?.message ?? 'تعذّر إكمال الطلب. حاول مرة أخرى.';
    if (response.status === 401) notifyUnauthorized();
    throw new ApiError(response.status, code, message, response.headers.get('x-request-id'));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function queryString(values: Record<string, string | number | boolean | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const result = query.toString();
  return result ? `?${result}` : '';
}

export const api = {
  csrf: getCsrfToken,
  session: () => request<Session>('/auth/session'),
  login: (body: {
    login_type: 'owner' | 'employee';
    phone: string;
    password?: string;
    store_code?: string;
    access_code?: string;
  }) => request<Session>('/auth/login', { method: 'POST', body }),
  register: (body: {
    store_name: string;
    owner_name: string;
    phone: string;
    password: string;
    address: string;
    accept_terms: boolean;
  }) => request<Session>('/auth/register', { method: 'POST', body }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  dashboard: () => request<DashboardSummary>('/dashboard'),

  products: (args: { page?: number; page_size?: number; search?: string; low_stock?: boolean } = {}) =>
    request<PageResult<Product>>(`/products${queryString(args)}`),
  createProduct: (body: {
    name: string;
    barcode: string | null;
    category: string;
    cost_milliemes: number;
    initial_quantity: number;
    min_stock: number;
  }, idempotencyKey?: string) => request<Product>('/products', { method: 'POST', body, idempotencyKey: idempotencyKey ?? true }),
  updateProduct: (id: string, body: { name: string; barcode: string | null; category: string; min_stock: number }) =>
    request<Product>(`/products/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  archiveProduct: (id: string) => request<void>(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  stockMovements: (args: { page?: number; page_size?: number; search?: string; kind?: string } = {}) =>
    request<PageResult<{
      id: string;
      product_id: string;
      product_name: string;
      kind: string;
      quantity_delta: number;
      unit_cost_milliemes: number;
      reason: string;
      supplier: string;
      invoice_ref: string;
      created_at: string;
    }>>(`/stock/movements${queryString(args)}`),
  receiveStock: (body: {
    product_id: string;
    quantity: number;
    unit_cost_milliemes: number;
    supplier: string;
    invoice_ref: string;
  }, idempotencyKey?: string) => request<Product>('/stock/receipts', { method: 'POST', body, idempotencyKey: idempotencyKey ?? true }),
  reportDamage: (body: { product_id: string; quantity: number; reason: string; note: string }, idempotencyKey?: string) =>
    request<Product>('/stock/damage', { method: 'POST', body, idempotencyKey: idempotencyKey ?? true }),

  sales: (args: { page?: number; page_size?: number; search?: string; from?: string; to?: string } = {}) =>
    request<PageResult<Sale>>(`/sales${queryString(args)}`),
  sale: (id: string) => request<{ sale: Sale; items: SaleItem[] }>(`/sales/${encodeURIComponent(id)}`),
  createSale: (body: {
    customer_name: string;
    payment_method: 'cash' | 'card' | 'transfer';
    items: { product_id: string; quantity: number; unit_price_milliemes: number }[];
  }, idempotencyKey?: string) => request<{ sale: Sale; items: SaleItem[] }>('/sales', { method: 'POST', body, idempotencyKey: idempotencyKey ?? true }),

  orders: (args: { page?: number; page_size?: number; search?: string; status?: string } = {}) =>
    request<PageResult<Order>>(`/orders${queryString(args)}`),
  order: (id: string) => request<{ order: Order; items: OrderItem[] }>(`/orders/${encodeURIComponent(id)}`),
  createOrder: (body: {
    customer_name: string;
    customer_phone: string;
    address: string;
    note: string;
    delivery_fee_milliemes: number;
    items: { product_id: string; quantity: number; unit_price_milliemes: number | null }[];
  }, idempotencyKey?: string) => request<Order>('/orders', { method: 'POST', body, idempotencyKey: idempotencyKey ?? true }),
  updateOrderPrices: (id: string, items: { product_id: string; unit_price_milliemes: number }[]) =>
    request<Order>(`/orders/${encodeURIComponent(id)}/prices`, { method: 'PUT', body: { items } }),
  transitionOrder: (id: string, status: string, payment_method?: 'cash' | 'card' | 'transfer', idempotencyKey?: string) =>
    request<Order>(`/orders/${encodeURIComponent(id)}/transition`, {
      method: 'POST', body: { status, payment_method }, idempotencyKey: idempotencyKey ?? true,
    }),

  debts: (args: { page?: number; page_size?: number; search?: string; archived?: boolean } = {}) =>
    request<PageResult<Debt>>(`/debts${queryString(args)}`),
  debt: (id: string) => request<Debt>(`/debts/${encodeURIComponent(id)}`),
  createDebt: (body: {
    customer_name: string;
    customer_phone: string;
    note: string;
    total_milliemes: number;
    due_date: string | null;
  }, idempotencyKey?: string) => request<Debt>('/debts', { method: 'POST', body, idempotencyKey: idempotencyKey ?? true }),
  archiveDebt: (id: string) => request<void>(`/debts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  debtPayments: (id: string) => request<{ data: { id: string; amount_milliemes: number; created_at: string }[] }>(`/debts/${encodeURIComponent(id)}/payments`),
  payDebt: (id: string, amount_milliemes: number, idempotencyKey?: string) =>
    request<Debt>(`/debts/${encodeURIComponent(id)}/payments`, {
      method: 'POST', body: { amount_milliemes }, idempotencyKey: idempotencyKey ?? true,
    }),

  employees: (args: { page?: number; page_size?: number; search?: string } = {}) =>
    request<PageResult<Employee>>(`/employees${queryString(args)}`),
  createEmployee: (body: {
    name: string;
    phone: string;
    daily_wage_milliemes: number;
    permissions: Record<'products' | 'stock' | 'sales' | 'orders' | 'debts', boolean>;
  }) => request<{ employee: Employee; access_code: string }>('/employees', { method: 'POST', body }),
  updateEmployee: (id: string, body: {
    name: string;
    daily_wage_milliemes: number;
    permissions: Record<'products' | 'stock' | 'sales' | 'orders' | 'debts', boolean>;
    active: boolean;
  }) => request<Employee>(`/employees/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  rotateEmployeeCode: (id: string) =>
    request<{ access_code: string }>(`/employees/${encodeURIComponent(id)}/access-code`, { method: 'POST' }),

  stores: () => request<{ data: Store[] }>('/stores'),
  createStore: (body: { name: string; address: string }) => request<Store>('/stores', { method: 'POST', body }),
  switchStore: (id: string) => request<Store>(`/stores/${encodeURIComponent(id)}/switch`, { method: 'POST' }),

  financialSummary: (from?: string, to?: string) =>
    request<{
      from: string;
      to: string;
      revenue_milliemes: number;
      cost_milliemes: number;
      gross_profit_milliemes: number;
      losses_milliemes: number;
      sales_count: number;
      timezone: string;
      note: string;
    }>(`/financials/summary${queryString({ from, to })}`),
  financialDaily: (from: string, to: string) =>
    request<{ data: { date: string; revenue_milliemes: number; cost_milliemes: number; gross_profit_milliemes: number; losses_milliemes: number; sales_count: number }[]; timezone: string }>(`/financials/daily${queryString({ from, to })}`),
  storeSettings: () => request<Store>('/stores/settings'),
  updateStoreSettings: (body: { name: string; address: string }) =>
    request<Store>('/stores/settings', { method: 'PATCH', body }),
  changePassword: (body: { current_password: string; new_password: string }) =>
    request<void>('/auth/password', { method: 'POST', body }),
  billingRequests: () => request<{ data: { id: string; plan_id: string; status: string; created_at: string }[] }>('/billing/requests'),
  requestPlan: (body: { plan_id: string; message: string }) =>
    request<{ id: string; status: string; message: string }>('/billing/requests', { method: 'POST', body }),
};
