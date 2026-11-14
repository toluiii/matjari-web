'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Edit3, Package, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { dinarsFromMilliemes, formatMoney, formatNumber, humanizeApiError, parseTnd } from '@/lib/format';
import type { Product } from '@/lib/types';
import { FormDialog } from '@/components/dialog';
import { FeatureGuard } from '@/components/feature-guard';
import { EmptyState, ErrorPanel, LoadingRows, PageHeader } from '@/components/ui';

function ProductFormDialog({ open, onClose, product }: { open: boolean; onClose: () => void; product?: Product | null }) {
  const client = useQueryClient();
  const [name, setName] = useState(product?.name ?? '');
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [cost, setCost] = useState(product ? dinarsFromMilliemes(product.cost_milliemes) : '0.000');
  const [quantity, setQuantity] = useState(product ? String(product.stock) : '0');
  const [minStock, setMinStock] = useState(product ? String(product.min_stock) : '5');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('أدخل اسم المنتج.');
      const safeMin = Number(minStock);
      if (!Number.isInteger(safeMin) || safeMin < 0 || safeMin > 1_000_000_000) throw new Error('أدخل حدًا أدنى صحيحًا للمخزون.');
      const common = { name: name.trim(), barcode: barcode.trim() || null, category: category.trim(), min_stock: safeMin };
      if (product) return api.updateProduct(product.id, common);
      const safeCost = parseTnd(cost);
      const safeQuantity = Number(quantity);
      if (safeCost === null || safeCost > 1_000_000_000_000) throw new Error('أدخل كلفة شراء صحيحة حتى 3 أرقام بعد الفاصلة.');
      if (!Number.isInteger(safeQuantity) || safeQuantity < 0 || safeQuantity > 1_000_000_000) throw new Error('أدخل كمية افتتاحية صحيحة.');
      return api.createProduct({ ...common, cost_milliemes: safeCost, initial_quantity: safeQuantity });
    },
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['products'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]);
      toast.success(product ? 'تم تحديث بيانات المنتج.' : 'تمت إضافة المنتج.');
      onClose();
    },
    onError: (reason) => setError(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : reason instanceof Error ? reason.message : 'تعذّر حفظ المنتج.'),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    mutation.mutate();
  }

  return (
    <FormDialog open={open} onOpenChange={(value) => !value && onClose()} title={product ? 'تعديل بيانات المنتج' : 'إضافة منتج'} description={product ? 'يمكن تعديل الاسم والتصنيف والباركود وحد التنبيه. سجّل تغييرات المخزون من قسم المخزون.' : 'أدخل معلومات الصنف ورصيده الافتتاحي.'}>
      <form className="dialog-form" onSubmit={submit} noValidate>
        <div className="dialog-grid">
          <div className="field span-two"><label htmlFor="product-name">اسم المنتج</label><input className="field-control" id="product-name" autoFocus maxLength={200} value={name} onChange={(event) => setName(event.target.value)} required /></div>
          <div className="field"><label htmlFor="product-category">التصنيف</label><input className="field-control" id="product-category" maxLength={100} value={category} onChange={(event) => setCategory(event.target.value)} placeholder="مثال: مواد غذائية" /></div>
          <div className="field"><label htmlFor="product-barcode">الباركود</label><input className="field-control" id="product-barcode" dir="ltr" maxLength={64} value={barcode} onChange={(event) => setBarcode(event.target.value)} /></div>
          {!product && <>
            <div className="field"><label htmlFor="product-cost">كلفة الشراء (د.ت)</label><input className="field-control" id="product-cost" inputMode="decimal" dir="ltr" value={cost} onChange={(event) => setCost(event.target.value)} /></div>
            <div className="field"><label htmlFor="product-quantity">الكمية الافتتاحية</label><input className="field-control" id="product-quantity" inputMode="numeric" dir="ltr" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^0-9]/g, ''))} /></div>
          </>}
          <div className="field"><label htmlFor="product-min-stock">حد تنبيه المخزون</label><input className="field-control" id="product-min-stock" inputMode="numeric" dir="ltr" value={minStock} onChange={(event) => setMinStock(event.target.value.replace(/[^0-9]/g, ''))} /></div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onClose}>إلغاء</button><button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'جارٍ الحفظ…' : product ? 'حفظ التغييرات' : 'إضافة المنتج'}</button></div>
      </form>
    </FormDialog>
  );
}

export default function ProductsPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [querySearch, setQuerySearch] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => { setQuerySearch(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useQuery({
    queryKey: ['products', page, querySearch, lowStock],
    queryFn: () => api.products({ page, page_size: 20, search: querySearch, low_stock: lowStock }),
  });
  const archiveMutation = useMutation({
    mutationFn: api.archiveProduct,
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['products'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]);
      toast.success('تمت أرشفة المنتج. تبقى الحركات السابقة محفوظة.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? humanizeApiError(error.code, error.message) : 'تعذّرت أرشفة المنتج.'),
  });

  function archive(product: Product) {
    if (window.confirm(`أرشفة «${product.name}»؟ سيختفي من قائمة المنتجات الجديدة، وتبقى السجلات السابقة محفوظة.`)) archiveMutation.mutate(product.id);
  }
  function openCreate() { setSelected(null); setDialogOpen(true); }
  function openEdit(product: Product) { setSelected(product); setDialogOpen(true); }

  return (
    <FeatureGuard feature="products" title="المنتجات">
      <PageHeader title="المنتجات" description="إدارة أصناف المتجر وتكلفة الشراء وحدود التنبيه." actions={<button className="button button-primary button-sm" type="button" onClick={openCreate}><Plus size={16} aria-hidden="true" /> إضافة منتج</button>} />
      <section className="card toolbar" aria-label="تصفية المنتجات">
        <div className="toolbar-group"><label className="search-control"><Search aria-hidden="true" /><input aria-label="البحث عن منتج" type="search" placeholder="ابحث بالاسم أو الباركود…" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button className="icon-button" type="button" aria-label="مسح البحث" onClick={() => setSearch('')}><X aria-hidden="true" /></button>}</label>
          <label className="toolbar-filter"><input type="checkbox" checked={lowStock} onChange={(event) => { setLowStock(event.target.checked); setPage(1); }} /> تنبيه المخزون فقط</label>
        </div>
        <span className="toolbar-count">{query.data ? `${formatNumber(query.data.total)} منتج` : 'قائمة المنتجات'}</span>
      </section>
      <section className="card">
        {query.isError && <div style={{ padding: 16 }}><ErrorPanel error={query.error} retry={() => void query.refetch()} /></div>}
        {query.isLoading ? <div style={{ padding: 17 }}><LoadingRows /></div> : query.data?.data.length ? <>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>المنتج</th><th>الباركود</th><th>تكلفة الوحدة</th><th>المخزون</th><th>حد التنبيه</th><th>إجراءات</th></tr></thead><tbody>
            {query.data.data.map((product) => <tr key={product.id}>
              <td><span className="table-primary">{product.name}</span><span className="table-secondary">{product.category || 'دون تصنيف'}</span></td>
              <td dir="ltr">{product.barcode || '—'}</td>
              <td>{formatMoney(product.cost_milliemes)}</td>
              <td><span className={`badge ${product.stock <= product.min_stock ? 'badge-warning' : 'badge-success'}`}>{formatNumber(product.stock)} وحدة</span></td>
              <td>{formatNumber(product.min_stock)}</td>
              <td><div className="table-actions"><button className="icon-button" type="button" title="تعديل المنتج" aria-label={`تعديل ${product.name}`} onClick={() => openEdit(product)}><Edit3 aria-hidden="true" /></button><button className="icon-button danger" type="button" title="أرشفة المنتج" aria-label={`أرشفة ${product.name}`} disabled={archiveMutation.isPending} onClick={() => archive(product)}><Archive aria-hidden="true" /></button></div></td>
            </tr>)}
          </tbody></table></div>
          <div className="pagination"><span>عرض {formatNumber((page - 1) * 20 + 1)}–{formatNumber(Math.min(page * 20, query.data.total))} من {formatNumber(query.data.total)}</span><div className="pagination-actions"><button type="button" aria-label="الصفحة السابقة" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button><span className="pagination-current">{formatNumber(page)}</span><button type="button" aria-label="الصفحة التالية" disabled={page * 20 >= query.data.total} onClick={() => setPage((value) => value + 1)}>›</button></div></div>
        </> : !query.isError ? <EmptyState icon={<Package aria-hidden="true" />} title={querySearch || lowStock ? 'لا توجد منتجات مطابقة' : 'ابدأ بإضافة منتجات متجرك'} description={querySearch || lowStock ? 'جرّب تغيير البحث أو إيقاف مرشح المخزون.' : 'أضف اسم المنتج وتكلفة الشراء والكمية الافتتاحية حتى تظهر بيانات مفيدة في لوحة التحكم.'} action={!querySearch && !lowStock ? <button className="button button-primary button-sm" type="button" onClick={openCreate}><Plus size={15} /> إضافة أول منتج</button> : undefined} /> : null}
      </section>
      <div className="page-note">تعديل المنتج لا يغيّر تكلفته الحالية أو مخزونه. استخدم قسم المخزون لتسجيل التوريد أو التلف وتحديث الكلفة والرصيد.</div>
      <ProductFormDialog key={`${dialogOpen}-${selected?.id ?? 'new'}`} open={dialogOpen} onClose={() => setDialogOpen(false)} product={selected} />
    </FeatureGuard>
  );
}
