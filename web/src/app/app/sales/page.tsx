'use client';

import { FormEvent, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Plus, Search, ShoppingBag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/dialog';
import { FeatureGuard } from '@/components/feature-guard';
import { EmptyState, ErrorPanel, LoadingRows, PageHeader } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateTime, formatMoney, formatNumber, humanizeApiError, parseTnd, paymentLabel } from '@/lib/format';
import type { Product, Sale } from '@/lib/types';

type CartLine = { product_id: string; product_name: string; quantity: number; unit_price_milliemes: number; stock: number };
type SalePayload = { customer_name: string; payment_method: 'cash' | 'card' | 'transfer'; items: { product_id: string; quantity: number; unit_price_milliemes: number }[] };

function SaleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const intentKey = useRef<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [customer, setCustomer] = useState('');
  const [payment, setPayment] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState('');
  const productsQuery = useQuery({ queryKey: ['products', 'pos', productSearch], queryFn: () => api.products({ page: 1, page_size: 100, search: productSearch }), enabled: open });
  const product = productsQuery.data?.data.find((item: Product) => item.id === productId);

  function clearIntent() { intentKey.current = null; }
  function addProduct() {
    const count = Number(quantity);
    const priceValue = parseTnd(price);
    if (!product) { setError('ابحث عن منتج واختره.'); return; }
    if (!Number.isInteger(count) || count < 1 || count > 100_000) { setError('أدخل كمية صحيحة.'); return; }
    if (count > product.stock) { setError('الكمية أكبر من المتوفر في المخزون.'); return; }
    if (priceValue === null || priceValue < 1 || priceValue > 1_000_000_000_000) { setError('أدخل سعر بيع صحيحًا حتى 3 أرقام بعد الفاصلة.'); return; }
    if (cart.some((line) => line.product_id === product.id)) { setError('المنتج موجود في القائمة بالفعل.'); return; }
    clearIntent();
    setCart((lines) => [...lines, { product_id: product.id, product_name: product.name, quantity: count, unit_price_milliemes: priceValue, stock: product.stock }]);
    setProductId(''); setProductSearch(''); setQuantity('1'); setPrice(''); setError('');
  }
  function keyForIntent(): string {
    intentKey.current ??= crypto.randomUUID();
    return intentKey.current;
  }

  const mutation = useMutation({
    mutationFn: (payload: SalePayload) => api.createSale(payload, keyForIntent()),
    onSuccess: async () => {
      intentKey.current = null;
      await Promise.all([client.invalidateQueries({ queryKey: ['sales'] }), client.invalidateQueries({ queryKey: ['products'] }), client.invalidateQueries({ queryKey: ['stock'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]);
      toast.success('تم تسجيل البيع وتحديث المخزون.');
      onClose();
    },
    onError: (reason) => setError(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : reason instanceof Error ? reason.message : 'تعذّر تسجيل البيع.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!cart.length) { setError('أضف منتجًا واحدًا على الأقل.'); return; }
    const total = cart.reduce((sum, item) => sum + item.quantity * item.unit_price_milliemes, 0);
    if (!Number.isSafeInteger(total) || total > 100_000_000_000_000) { setError('إجمالي البيع يتجاوز الحد المسموح.'); return; }
    mutation.mutate({ customer_name: customer.trim(), payment_method: payment, items: cart.map(({ product_id, quantity: count, unit_price_milliemes }) => ({ product_id, quantity: count, unit_price_milliemes })) });
  }

  return (
    <FormDialog open={open} onOpenChange={(value) => !value && onClose()} title="تسجيل بيع جديد" description="اختر المنتجات والكميات والأسعار. يتحقق الخادم من المخزون ويخصم الكمية ضمن عملية البيع." wide>
      <form className="dialog-form" onSubmit={submit} noValidate>
        <div className="dialog-grid">
          <div className="field span-two"><label htmlFor="sale-search">ابحث عن منتج</label><div className="search-control"><Search aria-hidden="true" /><input id="sale-search" type="search" value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setProductId(''); clearIntent(); }} placeholder="اكتب اسم المنتج أو الباركود…" /></div></div>
          <div className="field span-two"><label htmlFor="sale-product">المنتج</label><select className="field-control" id="sale-product" value={productId} onChange={(event) => { setProductId(event.target.value); const selected = productsQuery.data?.data.find((item: Product) => item.id === event.target.value); if (selected) setPrice((selected.cost_milliemes / 1000).toFixed(3)); clearIntent(); }}><option value="">اختر منتجًا</option>{productsQuery.data?.data.map((item: Product) => <option key={item.id} value={item.id} disabled={item.stock < 1}>{item.name} — المتوفر {formatNumber(item.stock)}</option>)}</select>{productsQuery.data?.total && productsQuery.data.total > 100 && !productSearch && <span className="field-hint">تظهر أول 100 نتيجة؛ اكتب اسم المنتج للبحث في بقية الأصناف.</span>}</div>
          <div className="field"><label htmlFor="sale-quantity">الكمية</label><input className="field-control" id="sale-quantity" type="number" min={1} max={100_000} dir="ltr" value={quantity} onChange={(event) => { setQuantity(event.target.value); clearIntent(); }} /></div>
          <div className="field"><label htmlFor="sale-price">سعر الوحدة (د.ت)</label><input className="field-control" id="sale-price" inputMode="decimal" dir="ltr" value={price} onChange={(event) => { setPrice(event.target.value); clearIntent(); }} placeholder="0.000" /></div>
        </div>
        <button className="button button-secondary button-sm" type="button" onClick={addProduct}><Plus size={15} aria-hidden="true" /> إضافة الصنف إلى البيع</button>
        {cart.length > 0 && <div className="cart-list"><div className="cart-list-heading">أصناف البيع <span>{formatNumber(cart.length)} صنف</span></div>{cart.map((item) => <div className="cart-line" key={item.product_id}><div><strong>{item.product_name}</strong><small>{formatNumber(item.quantity)} × {formatMoney(item.unit_price_milliemes)}</small></div><strong>{formatMoney(item.quantity * item.unit_price_milliemes)}</strong><button className="icon-button danger" type="button" aria-label={`إزالة ${item.product_name}`} onClick={() => { clearIntent(); setCart((lines) => lines.filter((line) => line.product_id !== item.product_id)); }}><Trash2 aria-hidden="true" /></button></div>)}<div className="cart-total"><span>الإجمالي</span><strong>{formatMoney(cart.reduce((sum, item) => sum + item.quantity * item.unit_price_milliemes, 0))}</strong></div></div>}
        <div className="field-row"><div className="field"><label htmlFor="sale-customer">اسم العميل <span className="field-hint">(اختياري)</span></label><input className="field-control" id="sale-customer" maxLength={160} value={customer} onChange={(event) => { setCustomer(event.target.value); clearIntent(); }} /></div><div className="field"><label htmlFor="sale-payment">طريقة الدفع</label><select className="field-control" id="sale-payment" value={payment} onChange={(event) => { setPayment(event.target.value as typeof payment); clearIntent(); }}><option value="cash">نقدًا</option><option value="card">بطاقة</option><option value="transfer">تحويل</option></select></div></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onClose}>إلغاء</button><button className="button button-primary" type="submit" disabled={mutation.isPending || !cart.length}>{mutation.isPending ? 'جارٍ تسجيل البيع…' : 'تأكيد البيع'}</button></div>
      </form>
    </FormDialog>
  );
}

function SaleDetails({ saleId, onClose }: { saleId: string | null; onClose: () => void }) {
  const query = useQuery({ queryKey: ['sale', saleId], queryFn: () => api.sale(saleId!), enabled: Boolean(saleId) });
  return <FormDialog open={Boolean(saleId)} onOpenChange={(value) => !value && onClose()} title={query.data ? `تفاصيل عملية #${formatNumber(query.data.sale.number)}` : 'تفاصيل البيع'} description="تفاصيل البيع المسجلة في المتجر.">
    {query.isLoading ? <LoadingRows rows={3} /> : query.isError ? <ErrorPanel error={query.error} retry={() => void query.refetch()} /> : query.data && <>
      <div className="metric-line"><span>العميل</span><strong>{query.data.sale.customer_name || 'بيع مباشر'}</strong></div><div className="metric-line"><span>وقت البيع</span><strong>{formatDateTime(query.data.sale.created_at)}</strong></div><div className="metric-line"><span>طريقة الدفع</span><strong>{paymentLabel(query.data.sale.payment_method)}</strong></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>المجموع</th></tr></thead><tbody>{query.data.items.map((item) => <tr key={item.id}><td className="table-primary">{item.product_name}</td><td>{formatNumber(item.quantity)}</td><td>{formatMoney(item.unit_price_milliemes)}</td><td>{formatMoney(item.quantity * item.unit_price_milliemes)}</td></tr>)}</tbody></table></div>
      <div className="cart-total"><span>الإجمالي المسجل</span><strong>{formatMoney(query.data.sale.total_milliemes)}</strong></div>
    </>}
  </FormDialog>;
}

export default function SalesPage() {
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [saleId, setSaleId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['sales', page, search, from, to], queryFn: () => api.sales({ page, page_size: 20, search, from: from || undefined, to: to || undefined }) });

  return (
    <FeatureGuard feature="sales" title="المبيعات">
      <PageHeader title="المبيعات" description="راجع عمليات البيع المسجلة أو أضف عملية جديدة." actions={<button className="button button-primary button-sm" type="button" onClick={() => setNewSaleOpen(true)}><Plus size={15} aria-hidden="true" /> تسجيل بيع</button>} />
      <section className="card toolbar"><div className="toolbar-group"><label className="search-control"><Search aria-hidden="true" /><input aria-label="البحث في المبيعات" type="search" placeholder="ابحث باسم العميل…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><label className="date-filter"><span>من</span><input aria-label="من تاريخ" className="filter-control" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label><label className="date-filter"><span>إلى</span><input aria-label="إلى تاريخ" className="filter-control" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label></div><span className="toolbar-count">{query.data ? `${formatNumber(query.data.total)} عملية` : 'سجل المبيعات'}</span></section>
      {from && to && to < from && <div className="form-error" role="alert">يجب أن يكون تاريخ النهاية مساويًا لتاريخ البداية أو بعده.</div>}
      <section className="card">
        {query.isError && <div style={{ padding: 16 }}><ErrorPanel error={query.error} retry={() => void query.refetch()} /></div>}
        {query.isLoading ? <div style={{ padding: 17 }}><LoadingRows /></div> : query.data?.data.length ? <>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>رقم البيع</th><th>العميل</th><th>طريقة الدفع</th><th>المجموع</th><th>التاريخ</th><th>التفاصيل</th></tr></thead><tbody>{query.data.data.map((sale: Sale) => <tr key={sale.id}><td className="table-primary">#{formatNumber(sale.number)}</td><td>{sale.customer_name || 'بيع مباشر'}</td><td>{paymentLabel(sale.payment_method)}</td><td className="table-primary">{formatMoney(sale.total_milliemes)}</td><td>{formatDateTime(sale.created_at)}</td><td><button className="icon-button" type="button" title="عرض تفاصيل البيع" aria-label={`تفاصيل البيع رقم ${sale.number}`} onClick={() => setSaleId(sale.id)}><Eye aria-hidden="true" /></button></td></tr>)}</tbody></table></div>
          <div className="pagination"><span>عرض {formatNumber((page - 1) * 20 + 1)}–{formatNumber(Math.min(page * 20, query.data.total))} من {formatNumber(query.data.total)}</span><div className="pagination-actions"><button type="button" aria-label="الصفحة السابقة" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button><span className="pagination-current">{formatNumber(page)}</span><button type="button" aria-label="الصفحة التالية" disabled={page * 20 >= query.data.total} onClick={() => setPage((value) => value + 1)}>›</button></div></div>
        </> : !query.isError ? <EmptyState icon={<ShoppingBag aria-hidden="true" />} title="لا توجد مبيعات مسجلة" description="ستظهر هنا عمليات البيع المسجلة في متجرك." action={<button className="button button-primary button-sm" type="button" onClick={() => setNewSaleOpen(true)}><Plus size={15} /> تسجيل أول بيع</button>} /> : null}
      </section>
      <div className="page-note">العمليات المالية وسجل حركة المخزون لا يمكن تعديلها من واجهة المتجر. راجع تفاصيل البيع قبل تأكيده.</div>
      <SaleDialog open={newSaleOpen} onClose={() => setNewSaleOpen(false)} />
      <SaleDetails saleId={saleId} onClose={() => setSaleId(null)} />
    </FeatureGuard>
  );
}
