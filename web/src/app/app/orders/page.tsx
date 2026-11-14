'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Eye, Plus, Search, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/dialog';
import { FeatureGuard } from '@/components/feature-guard';
import { EmptyState, ErrorPanel, LoadingRows, PageHeader } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { dinarsFromMilliemes, formatDateTime, formatMoney, formatNumber, humanizeApiError, parseTnd, statusLabel } from '@/lib/format';
import type { Order, OrderStatus, Product } from '@/lib/types';

const flow: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'delivered'];
const nextStatuses: Partial<Record<OrderStatus, OrderStatus>> = { pending: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'delivered' };
type DraftLine = { product_id: string; product_name: string; quantity: number; unit_price_milliemes: number | null; stock: number };
type OrderPayload = { customer_name: string; customer_phone: string; address: string; note: string; delivery_fee_milliemes: number; items: { product_id: string; quantity: number; unit_price_milliemes: number | null }[] };

function NewOrderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const intentKey = useRef<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('0.000');
  const [items, setItems] = useState<DraftLine[]>([]);
  const [error, setError] = useState('');
  const productsQuery = useQuery({ queryKey: ['products', 'order-select', productSearch], queryFn: () => api.products({ page: 1, page_size: 100, search: productSearch }), enabled: open });
  const selectedProduct = productsQuery.data?.data.find((product: Product) => product.id === productId);
  const keyForIntent = () => { intentKey.current ??= crypto.randomUUID(); return intentKey.current; };
  const invalidateIntent = () => { intentKey.current = null; };

  function addProduct() {
    if (!selectedProduct) { setError('اختر منتجًا من القائمة.'); return; }
    const count = Number(quantity);
    if (!Number.isInteger(count) || count < 1 || count > 100_000) { setError('أدخل كمية صحيحة.'); return; }
    if (items.some((item) => item.product_id === selectedProduct.id)) { setError('المنتج موجود في الطلب بالفعل.'); return; }
    const parsedPrice = price.trim() ? parseTnd(price) : null;
    if (price.trim() && (parsedPrice === null || parsedPrice < 1 || parsedPrice > 1_000_000_000_000)) { setError('أدخل سعرًا صحيحًا أو اتركه لتحديده لاحقًا.'); return; }
    invalidateIntent();
    setItems((current) => [...current, { product_id: selectedProduct.id, product_name: selectedProduct.name, quantity: count, unit_price_milliemes: parsedPrice, stock: selectedProduct.stock }]);
    setProductId(''); setProductSearch(''); setQuantity('1'); setPrice(''); setError('');
  }

  const mutation = useMutation({
    mutationFn: (payload: OrderPayload) => api.createOrder(payload, keyForIntent()),
    onSuccess: async () => {
      intentKey.current = null;
      await Promise.all([client.invalidateQueries({ queryKey: ['orders'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]);
      toast.success('تم تسجيل الطلب. لم يُخصم المخزون عند إنشاء الطلب.');
      onClose();
    },
    onError: (reason) => setError(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : reason instanceof Error ? reason.message : 'تعذّر إنشاء الطلب.'),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!customer.trim()) { setError('أدخل اسم العميل.'); return; }
    if (!items.length) { setError('أضف صنفًا واحدًا على الأقل.'); return; }
    if (customer.length > 160 || phone.length > 32 || address.length > 500 || note.length > 2000) { setError('تجاوز أحد الحقول الحد المسموح.'); return; }
    const fee = parseTnd(deliveryFee);
    if (fee === null || fee < 0 || fee > 1_000_000_000_000) { setError('أدخل رسوم توصيل صحيحة.'); return; }
    mutation.mutate({ customer_name: customer.trim(), customer_phone: phone.trim(), address: address.trim(), note: note.trim(), delivery_fee_milliemes: fee, items: items.map(({ product_id, quantity: count, unit_price_milliemes }) => ({ product_id, quantity: count, unit_price_milliemes })) });
  }

  return (
    <FormDialog open={open} onOpenChange={(value) => !value && onClose()} title="إنشاء طلب جديد" description="سجّل بيانات الطلب وأصنافه. لن يُحجز المخزون عند الإنشاء؛ سيُخصم عند التسليم." wide>
      <form className="dialog-form" onSubmit={submit} noValidate>
        <div className="dialog-grid">
          <div className="field"><label htmlFor="order-customer">اسم العميل</label><input className="field-control" id="order-customer" maxLength={160} value={customer} onChange={(event) => { setCustomer(event.target.value); invalidateIntent(); }} required /></div>
          <div className="field"><label htmlFor="order-phone">رقم الهاتف <span className="field-hint">(اختياري)</span></label><input className="field-control" id="order-phone" type="tel" dir="ltr" maxLength={32} value={phone} onChange={(event) => { setPhone(event.target.value); invalidateIntent(); }} /></div>
          <div className="field span-two"><label htmlFor="order-address">العنوان <span className="field-hint">(اختياري)</span></label><input className="field-control" id="order-address" maxLength={500} value={address} onChange={(event) => { setAddress(event.target.value); invalidateIntent(); }} /></div>
          <div className="field"><label htmlFor="order-fee">رسوم التوصيل (د.ت)</label><input className="field-control" id="order-fee" inputMode="decimal" dir="ltr" value={deliveryFee} onChange={(event) => { setDeliveryFee(event.target.value); invalidateIntent(); }} /></div>
          <div className="field"><label htmlFor="order-note">ملاحظة <span className="field-hint">(اختياري)</span></label><input className="field-control" id="order-note" maxLength={2000} value={note} onChange={(event) => { setNote(event.target.value); invalidateIntent(); }} /></div>
          <div className="field span-two"><label htmlFor="order-product-search">ابحث عن منتج</label><div className="search-control"><Search aria-hidden="true" /><input id="order-product-search" type="search" value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setProductId(''); invalidateIntent(); }} placeholder="اسم المنتج أو الباركود…" /></div></div>
          <div className="field span-two"><label htmlFor="order-product">أصناف الطلب</label><select className="field-control" id="order-product" value={productId} onChange={(event) => { setProductId(event.target.value); invalidateIntent(); }}><option value="">اختر منتجًا</option>{productsQuery.data?.data.map((product: Product) => <option key={product.id} value={product.id}>{product.name} — المتوفر الآن {formatNumber(product.stock)}</option>)}</select>{productsQuery.data?.total && productsQuery.data.total > 100 && !productSearch && <span className="field-hint">اكتب اسم المنتج للبحث في بقية الأصناف.</span>}</div>
          <div className="field"><label htmlFor="order-quantity">الكمية</label><input className="field-control" id="order-quantity" type="number" min={1} max={100_000} dir="ltr" value={quantity} onChange={(event) => { setQuantity(event.target.value); invalidateIntent(); }} /></div>
          <div className="field"><label htmlFor="order-unit-price">سعر الوحدة (د.ت) <span className="field-hint">(اختياري الآن)</span></label><input className="field-control" id="order-unit-price" inputMode="decimal" dir="ltr" value={price} onChange={(event) => { setPrice(event.target.value); invalidateIntent(); }} placeholder="يُحدد قبل التسليم" /></div>
        </div>
        <button className="button button-secondary button-sm" type="button" onClick={addProduct}><Plus size={15} aria-hidden="true" /> إضافة الصنف</button>
        {items.length > 0 && <div className="cart-list"><div className="cart-list-heading">أصناف الطلب <span>{formatNumber(items.length)} صنف</span></div>{items.map((item) => <div className="cart-line" key={item.product_id}><div><strong>{item.product_name}</strong><small>{formatNumber(item.quantity)} وحدة · المتوفر حاليًا {formatNumber(item.stock)}</small></div><span>{item.unit_price_milliemes === null ? 'سعر لاحقًا' : formatMoney(item.quantity * item.unit_price_milliemes)}</span><button className="icon-button danger" type="button" aria-label={`إزالة ${item.product_name}`} onClick={() => { invalidateIntent(); setItems((current) => current.filter((line) => line.product_id !== item.product_id)); }}>×</button></div>)}</div>}
        <div className="callout-info">تسجيل الطلب لا يحجز المخزون. يُفحص الرصيد ويُخصم عند التسليم، ولا يمكن التسليم قبل تحديد سعر كل صنف.</div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onClose}>إلغاء</button><button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'جارٍ إنشاء الطلب…' : 'إنشاء الطلب'}</button></div>
      </form>
    </FormDialog>
  );
}

function OrderDetailsDialog({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const client = useQueryClient();
  const [priceOverrides, setPriceOverrides] = useState<Record<string, string> | null>(null);
  const [payment, setPayment] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [error, setError] = useState('');
  const transitionKeys = useRef<Record<string, string>>({});
  const query = useQuery({ queryKey: ['order', orderId], queryFn: () => api.order(orderId!), enabled: Boolean(orderId) });
  const order = query.data?.order;

  const prices = priceOverrides ?? Object.fromEntries((query.data?.items ?? []).map((item) => [item.product_id, item.unit_price_milliemes === null ? '' : dinarsFromMilliemes(item.unit_price_milliemes)]));
  const refresh = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ['orders'] }), client.invalidateQueries({ queryKey: ['order', orderId] }), client.invalidateQueries({ queryKey: ['dashboard'] }), client.invalidateQueries({ queryKey: ['products'] }), client.invalidateQueries({ queryKey: ['sales'] })]);
  };
  const priceMutation = useMutation({
    mutationFn: async () => {
      if (!query.data) throw new Error('لم يتم تحميل تفاصيل الطلب.');
      const values = query.data.items.map((item) => ({ product_id: item.product_id, unit_price_milliemes: parseTnd(prices[item.product_id] ?? '') }));
      if (values.some((item) => item.unit_price_milliemes === null || item.unit_price_milliemes < 1 || item.unit_price_milliemes > 1_000_000_000_000)) throw new Error('حدد سعرًا صحيحًا لكل صنف.');
      return api.updateOrderPrices(query.data.order.id, values as { product_id: string; unit_price_milliemes: number }[]);
    },
    onSuccess: async () => { await refresh(); setPriceOverrides(null); setError(''); toast.success('تم حفظ أسعار الطلب.'); },
    onError: (reason) => setError(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : reason instanceof Error ? reason.message : 'تعذّر حفظ الأسعار.'),
  });
  const transitionMutation = useMutation({
    mutationFn: ({ status }: { status: OrderStatus }) => {
      if (!order) throw new Error('لم يتم تحميل الطلب.');
      transitionKeys.current[status] ??= crypto.randomUUID();
      return api.transitionOrder(order.id, status, status === 'delivered' ? payment : undefined, transitionKeys.current[status]);
    },
    onSuccess: async (_result, variables) => {
      delete transitionKeys.current[variables.status];
      await refresh(); setError(''); toast.success(variables.status === 'delivered' ? 'تم تسليم الطلب وتسجيل البيع.' : `تم تحديث حالة الطلب إلى ${statusLabel(variables.status)}.`);
    },
    onError: (reason) => setError(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : reason instanceof Error ? reason.message : 'تعذّر تحديث حالة الطلب.'),
  });

  const missingPrices = query.data?.items.some((item) => item.unit_price_milliemes === null) ?? false;
  const pricesDirty = query.data?.items.some((item) => parseTnd(prices[item.product_id] ?? '') !== item.unit_price_milliemes) ?? false;
  const currentIndex = order ? flow.indexOf(order.status) : -1;
  const canProgress = order ? nextStatuses[order.status] : undefined;
  const cancelable = order && ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);

  return (
    <FormDialog open={Boolean(orderId)} onOpenChange={(value) => !value && onClose()} title={order ? `الطلب رقم ${formatNumber(order.number)}` : 'تفاصيل الطلب'} description="راجع الأصناف والحالة قبل تنفيذ الخطوة التالية." wide>
      {query.isLoading ? <LoadingRows rows={3} /> : query.isError ? <ErrorPanel error={query.error} retry={() => void query.refetch()} /> : order && query.data && <div className="order-details">
        <div className="order-info-grid"><div><small>العميل</small><strong>{order.customer_name}</strong></div><div><small>رقم الهاتف</small><strong dir="ltr">{order.customer_phone || '—'}</strong></div><div><small>تاريخ الطلب</small><strong>{formatDateTime(order.created_at)}</strong></div><div><small>الحالة الحالية</small><strong><span className={`badge ${order.status === 'delivered' ? 'badge-success' : order.status === 'cancelled' ? 'badge-danger' : 'badge-warning'}`}>{statusLabel(order.status)}</span></strong></div></div>
        {order.status === 'cancelled' ? <div className="inline-alert">تم إلغاء هذا الطلب.</div> : <div className="order-flow" aria-label="مراحل الطلب">{flow.map((step, index) => <div className={`order-step${index === currentIndex ? ' active' : ''}${index < currentIndex || order.status === 'delivered' ? ' done' : ''}`} key={step}><span className="order-step-icon">{index + 1}</span><span>{statusLabel(step)}</span></div>)}</div>}
        {order.address && <div className="metric-line"><span>العنوان</span><strong>{order.address}</strong></div>}{order.note && <div className="metric-line"><span>ملاحظة</span><strong>{order.note}</strong></div>}
        <div className="table-wrap"><table className="data-table"><thead><tr><th>المنتج</th><th>الكمية</th><th>المتوفر الآن</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>{query.data.items.map((item) => { const currentPrice = item.unit_price_milliemes === null ? null : item.unit_price_milliemes; return <tr key={item.id}><td className="table-primary">{item.product_name}</td><td>{formatNumber(item.quantity)}</td><td>{formatNumber(item.stock)}</td><td>{order.status === 'delivered' || order.status === 'cancelled' ? formatMoney(currentPrice) : <input className="table-price-input" aria-label={`سعر ${item.product_name}`} inputMode="decimal" dir="ltr" placeholder="0.000" value={prices[item.product_id] ?? ''} onChange={(event) => { setPriceOverrides((values) => ({ ...(values ?? prices), [item.product_id]: event.target.value })); transitionKeys.current = {}; }} />}</td><td>{currentPrice === null ? '—' : formatMoney(item.quantity * currentPrice)}</td></tr>; })}</tbody></table></div>
        <div className="order-total"><span>إجمالي الأصناف <small>رسوم التوصيل {formatMoney(order.delivery_fee_milliemes)}</small></span><strong>{formatMoney(order.subtotal_milliemes + order.delivery_fee_milliemes)}</strong></div>
        {order.status !== 'delivered' && order.status !== 'cancelled' && <div className="order-actions">
          <button className="button button-secondary button-sm" type="button" disabled={priceMutation.isPending} onClick={() => { setError(''); priceMutation.mutate(); }}>{priceMutation.isPending ? 'جارٍ حفظ الأسعار…' : 'حفظ أسعار الأصناف'}</button>
          {order.status === 'ready' && <label className="payment-select"><span>طريقة الدفع عند التسليم</span><select className="filter-control" value={payment} onChange={(event) => { setPayment(event.target.value as typeof payment); delete transitionKeys.current.delivered; }}><option value="cash">نقدًا</option><option value="card">بطاقة</option><option value="transfer">تحويل</option></select></label>}
          {canProgress && <button className="button button-primary button-sm" type="button" disabled={transitionMutation.isPending || (canProgress === 'delivered' && (missingPrices || pricesDirty))} onClick={() => { setError(''); transitionMutation.mutate({ status: canProgress }); }}>{transitionMutation.isPending ? 'جارٍ التحديث…' : canProgress === 'delivered' ? 'تسليم الطلب وتسجيل البيع' : `نقل إلى ${statusLabel(canProgress)}`}</button>}
          {cancelable && <button className="button button-danger button-sm" type="button" disabled={transitionMutation.isPending} onClick={() => { if (window.confirm('إلغاء الطلب؟ لا يمكن التراجع عن هذا الإجراء.')) { setError(''); transitionMutation.mutate({ status: 'cancelled' }); } }}>إلغاء الطلب</button>}
        </div>}
        {(missingPrices || pricesDirty) && order.status === 'ready' && <div className="inline-alert">حدّد سعر كل صنف واحفظ الأسعار قبل تسليم الطلب.</div>}
        {order.sale_id && <div className="callout-info">تم إنشاء سجل بيع مرتبط بالطلب.</div>}
        {error && <div className="form-error" role="alert">{error}</div>}
      </div>}
    </FormDialog>
  );
}

export default function OrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['orders', page, search, status], queryFn: () => api.orders({ page, page_size: 20, search, status: status || undefined }) });

  return (
    <FeatureGuard feature="orders" title="الطلبات">
      <PageHeader title="الطلبات" description="تابع حالة الطلب وحدّد الأسعار قبل التسليم." actions={<button className="button button-primary button-sm" type="button" onClick={() => setCreateOpen(true)}><Plus size={15} aria-hidden="true" /> طلب جديد</button>} />
      <div className="inline-alert"><Truck aria-hidden="true" /><span>إنشاء الطلب لا يحجز المخزون. تُفحص الكمية وتُخصم عند التسليم، ويُسجّل البيع في الخطوة نفسها.</span></div>
      <section className="card toolbar"><div className="toolbar-group"><label className="search-control"><Search aria-hidden="true" /><input aria-label="البحث عن طلب" type="search" placeholder="اسم العميل أو الهاتف أو رقم الطلب…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><select className="filter-control" aria-label="تصفية حسب الحالة" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">كل الحالات</option><option value="pending">جديد</option><option value="confirmed">مؤكّد</option><option value="preparing">قيد التحضير</option><option value="ready">جاهز للتسليم</option><option value="delivered">تمّ التسليم</option><option value="cancelled">ملغى</option></select></div><span className="toolbar-count">{query.data ? `${formatNumber(query.data.total)} طلب` : 'طلبات المتجر'}</span></section>
      <section className="card">
        {query.isError && <div style={{ padding: 16 }}><ErrorPanel error={query.error} retry={() => void query.refetch()} /></div>}
        {query.isLoading ? <div style={{ padding: 17 }}><LoadingRows /></div> : query.data?.data.length ? <>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>الطلب</th><th>العميل</th><th>الحالة</th><th>قيمة الأصناف + التوصيل</th><th>التاريخ</th><th>تفاصيل</th></tr></thead><tbody>{query.data.data.map((order: Order) => <tr key={order.id}><td className="table-primary">#{formatNumber(order.number)}</td><td><span className="table-primary">{order.customer_name}</span><span className="table-secondary" dir="ltr">{order.customer_phone || '—'}</span></td><td><span className={`badge ${order.status === 'delivered' ? 'badge-success' : order.status === 'cancelled' ? 'badge-danger' : 'badge-warning'}`}>{statusLabel(order.status)}</span></td><td>{formatMoney(order.subtotal_milliemes + order.delivery_fee_milliemes)}</td><td>{formatDateTime(order.created_at)}</td><td><button className="icon-button" type="button" title="عرض تفاصيل الطلب" aria-label={`تفاصيل الطلب ${order.number}`} onClick={() => setSelectedId(order.id)}><Eye aria-hidden="true" /></button></td></tr>)}</tbody></table></div>
          <div className="pagination"><span>عرض {formatNumber((page - 1) * 20 + 1)}–{formatNumber(Math.min(page * 20, query.data.total))} من {formatNumber(query.data.total)}</span><div className="pagination-actions"><button type="button" aria-label="الصفحة السابقة" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button><span className="pagination-current">{formatNumber(page)}</span><button type="button" aria-label="الصفحة التالية" disabled={page * 20 >= query.data.total} onClick={() => setPage((value) => value + 1)}>›</button></div></div>
        </> : !query.isError ? <EmptyState icon={<ClipboardList aria-hidden="true" />} title="لا توجد طلبات حتى الآن" description="سجّل بيانات العميل والأصناف للبدء بمتابعة الطلبات." action={<button className="button button-primary button-sm" type="button" onClick={() => setCreateOpen(true)}><Plus size={15} /> إنشاء أول طلب</button>} /> : null}
      </section>
      <NewOrderDialog key={createOpen ? 'open' : 'closed'} open={createOpen} onClose={() => setCreateOpen(false)} />
      <OrderDetailsDialog key={selectedId ?? 'none'} orderId={selectedId} onClose={() => setSelectedId(null)} />
    </FeatureGuard>
  );
}
