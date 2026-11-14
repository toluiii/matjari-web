'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, CircleAlert, Plus, Search, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/dialog';
import { FeatureGuard } from '@/components/feature-guard';
import { EmptyState, ErrorPanel, LoadingRows, PageHeader } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateTime, formatMoney, formatNumber, humanizeApiError, parseTnd } from '@/lib/format';
import type { Product } from '@/lib/types';

type MovementMode = 'receipt' | 'damage';

function MovementDialog({ open, mode, onClose }: { open: boolean; mode: MovementMode; onClose: () => void }) {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [cost, setCost] = useState('0.000');
  const [supplier, setSupplier] = useState('');
  const [invoice, setInvoice] = useState('');
  const [reason, setReason] = useState('damaged');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const productsQuery = useQuery({
    queryKey: ['products', 'movement-select', search],
    queryFn: () => api.products({ page: 1, page_size: 100, search }),
    enabled: open,
  });
  const selectedProduct = productsQuery.data?.data.find((product) => product.id === productId);

  const mutation = useMutation({
    mutationFn: () => {
      const safeQuantity = Number(quantity);
      if (!productId) throw new Error('اختر المنتج أولًا.');
      if (!Number.isInteger(safeQuantity) || safeQuantity < 1 || safeQuantity > 1_000_000) throw new Error('أدخل كمية صحيحة.');
      if (mode === 'receipt') {
        const safeCost = parseTnd(cost);
        if (safeCost === null || safeCost > 1_000_000_000_000) throw new Error('أدخل كلفة صحيحة حتى 3 أرقام بعد الفاصلة.');
        return api.receiveStock({ product_id: productId, quantity: safeQuantity, unit_cost_milliemes: safeCost, supplier: supplier.trim(), invoice_ref: invoice.trim() });
      }
      return api.reportDamage({ product_id: productId, quantity: safeQuantity, reason, note: note.trim() });
    },
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['products'] }), client.invalidateQueries({ queryKey: ['stock'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]);
      toast.success(mode === 'receipt' ? 'تم تسجيل التوريد وتحديث متوسط الكلفة.' : 'تم تسجيل الحركة وإنقاص المخزون.');
      onClose();
    },
    onError: (error) => setError(error instanceof ApiError ? humanizeApiError(error.code, error.message) : error instanceof Error ? error.message : 'تعذّر حفظ الحركة.'),
  });

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); mutation.mutate(); }

  return (
    <FormDialog open={open} onOpenChange={(value) => !value && onClose()} title={mode === 'receipt' ? 'تسجيل توريد مخزون' : 'تسجيل تلف أو فقدان'} description={mode === 'receipt' ? 'يحدّث التوريد رصيد المنتج ومتوسط تكلفة الشراء.' : 'تُسجّل الحركة في سجل المخزون ويُخصم مقدارها من الرصيد.'}>
      <form className="dialog-form" onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="movement-search">ابحث عن المنتج</label><div className="search-control"><Search aria-hidden="true" /><input id="movement-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setProductId(''); }} placeholder="اكتب اسم المنتج…" /></div></div>
        <div className="field"><label htmlFor="movement-product">المنتج</label><select className="field-control" id="movement-product" value={productId} onChange={(event) => setProductId(event.target.value)} required><option value="">اختر منتجًا</option>{productsQuery.data?.data.map((product: Product) => <option key={product.id} value={product.id}>{product.name} — المتوفر {formatNumber(product.stock)}</option>)}</select>{selectedProduct && <span className="field-hint">التكلفة الحالية: {formatMoney(selectedProduct.cost_milliemes)} · المتوفر: {formatNumber(selectedProduct.stock)}</span>}{productsQuery.data?.total && productsQuery.data.total > 100 && !search && <span className="field-hint">تظهر أول 100 نتيجة. اكتب اسم المنتج للبحث في بقية الأصناف.</span>}</div>
        <div className="field-row"><div className="field"><label htmlFor="movement-quantity">الكمية</label><input className="field-control" id="movement-quantity" type="number" inputMode="numeric" min={1} max={1_000_000} step={1} dir="ltr" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></div>{mode === 'receipt' && <div className="field"><label htmlFor="movement-cost">كلفة الوحدة (د.ت)</label><input className="field-control" id="movement-cost" inputMode="decimal" dir="ltr" value={cost} onChange={(event) => setCost(event.target.value)} required /></div>}</div>
        {mode === 'receipt' ? <div className="field-row"><div className="field"><label htmlFor="movement-supplier">المورّد <span className="field-hint">(اختياري)</span></label><input className="field-control" id="movement-supplier" maxLength={160} value={supplier} onChange={(event) => setSupplier(event.target.value)} /></div><div className="field"><label htmlFor="movement-invoice">مرجع الفاتورة <span className="field-hint">(اختياري)</span></label><input className="field-control" id="movement-invoice" maxLength={160} value={invoice} onChange={(event) => setInvoice(event.target.value)} /></div></div> : <><div className="field"><label htmlFor="movement-reason">سبب الحركة</label><select className="field-control" id="movement-reason" value={reason} onChange={(event) => setReason(event.target.value)}><option value="damaged">تالف</option><option value="stolen">سرقة</option><option value="lost">فقدان</option><option value="expired">انتهاء الصلاحية</option><option value="other">سبب آخر</option></select></div><div className="field"><label htmlFor="movement-note">ملاحظة <span className="field-hint">(اختياري)</span></label><textarea className="field-control field-textarea" id="movement-note" maxLength={80} value={note} onChange={(event) => setNote(event.target.value)} /></div></>}
        {error && <div className="form-error" role="alert">{error}</div>}
        {mode === 'damage' && selectedProduct && Number(quantity) > selectedProduct.stock && <div className="inline-alert"><CircleAlert aria-hidden="true" /> الكمية المطلوبة أكبر من الرصيد الحالي.</div>}
        <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onClose}>إلغاء</button><button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'جارٍ الحفظ…' : mode === 'receipt' ? 'تسجيل التوريد' : 'تسجيل النقص'}</button></div>
      </form>
    </FormDialog>
  );
}

const kindLabels: Record<string, string> = { opening: 'رصيد افتتاحي', receipt: 'توريد', sale: 'بيع', damage: 'تالف أو فقدان' };

export default function StockPage() {
  const [mode, setMode] = useState<MovementMode | null>(null);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['stock', page, search, kind], queryFn: () => api.stockMovements({ page, page_size: 20, search, kind: kind || undefined }) });

  return (
    <FeatureGuard feature="stock" title="المخزون">
      <PageHeader title="المخزون" description="حركات التوريد والبيع والتالف المسجلة في متجرك." actions={<><button className="button button-secondary button-sm" type="button" onClick={() => setMode('damage')}><CircleAlert size={15} aria-hidden="true" /> تسجيل تلف أو فقدان</button><button className="button button-primary button-sm" type="button" onClick={() => setMode('receipt')}><Plus size={15} aria-hidden="true" /> تسجيل توريد</button></>} />
      <section className="card toolbar">
        <div className="toolbar-group"><label className="search-control"><Search aria-hidden="true" /><input aria-label="البحث في حركات المخزون" type="search" placeholder="ابحث باسم المنتج…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><select className="filter-control" aria-label="نوع الحركة" value={kind} onChange={(event) => { setKind(event.target.value); setPage(1); }}><option value="">كل الحركات</option><option value="receipt">التوريد</option><option value="damage">التالف والفقدان</option><option value="sale">البيع</option><option value="opening">الرصيد الافتتاحي</option></select></div>
        <span className="toolbar-count">{query.data ? `${formatNumber(query.data.total)} حركة` : 'سجل الحركات'}</span>
      </section>
      <section className="card">
        {query.isError && <div style={{ padding: 16 }}><ErrorPanel error={query.error} retry={() => void query.refetch()} /></div>}
        {query.isLoading ? <div style={{ padding: 17 }}><LoadingRows /></div> : query.data?.data.length ? <>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>المنتج</th><th>نوع الحركة</th><th>الكمية</th><th>كلفة الوحدة</th><th>ملاحظة / مرجع</th><th>التاريخ</th></tr></thead><tbody>
            {query.data.data.map((movement) => <tr key={movement.id}><td className="table-primary">{movement.product_name}</td><td><span className={`badge ${movement.kind === 'damage' ? 'badge-danger' : movement.kind === 'receipt' ? 'badge-success' : 'badge-brand'}`}>{kindLabels[movement.kind] ?? movement.kind}</span></td><td className={movement.quantity_delta < 0 ? 'negative-quantity' : 'positive-quantity'} dir="ltr">{movement.quantity_delta > 0 ? '+' : ''}{formatNumber(movement.quantity_delta)}</td><td>{formatMoney(movement.unit_cost_milliemes)}</td><td><span className="table-primary">{movement.supplier || movement.reason?.split(':')[0] || '—'}</span><span className="table-secondary">{movement.invoice_ref || movement.reason?.split(':').slice(1).join(':') || '—'}</span></td><td>{formatDateTime(movement.created_at)}</td></tr>)}
          </tbody></table></div>
          <div className="pagination"><span>عرض {formatNumber((page - 1) * 20 + 1)}–{formatNumber(Math.min(page * 20, query.data.total))} من {formatNumber(query.data.total)}</span><div className="pagination-actions"><button type="button" aria-label="الصفحة السابقة" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button><span className="pagination-current">{formatNumber(page)}</span><button type="button" aria-label="الصفحة التالية" disabled={page * 20 >= query.data.total} onClick={() => setPage((value) => value + 1)}>›</button></div></div>
        </> : !query.isError ? <EmptyState icon={<Boxes aria-hidden="true" />} title="لا توجد حركات مخزون بعد" description="سجّل التوريد عند استلام البضاعة، والتالف أو الفقدان عند حدوثه." action={<button className="button button-primary button-sm" type="button" onClick={() => setMode('receipt')}><Truck size={15} /> تسجيل أول توريد</button>} /> : null}
      </section>
      <div className="page-note">سجلات الحركات تُحفظ للتدقيق ولا يمكن تعديلها أو حذفها من واجهة المتجر.</div>
      <MovementDialog key={mode ?? 'closed'} open={mode !== null} mode={mode ?? 'receipt'} onClose={() => setMode(null)} />
    </FeatureGuard>
  );
}
