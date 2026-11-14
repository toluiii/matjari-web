'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MapPin, Plus, Store as StoreIcon } from 'lucide-react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/dialog';
import { FeatureGuard } from '@/components/feature-guard';
import { EmptyState, ErrorPanel, LoadingRows, PageHeader } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatNumber, humanizeApiError } from '@/lib/format';
import { useSession } from '@/components/workspace-shell';

function CreateStoreDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: () => {
      if (!name.trim()) throw new Error('أدخل اسم المتجر.');
      return api.createStore({ name: name.trim(), address: address.trim() });
    },
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ['stores'] }), client.invalidateQueries({ queryKey: ['session'] })]); toast.success('تم إنشاء المتجر.'); onClose(); },
    onError: (reason) => setError(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : reason instanceof Error ? reason.message : 'تعذّر إنشاء المتجر.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); mutation.mutate(); }
  return <FormDialog open={open} onOpenChange={(value) => !value && onClose()} title="إضافة متجر" description="سيُنشأ متجر مستقل داخل المؤسسة مع سجل حركاته الخاص.">
    <form className="dialog-form" onSubmit={submit} noValidate><div className="field"><label htmlFor="new-store-name">اسم المتجر</label><input className="field-control" id="new-store-name" maxLength={160} value={name} onChange={(event) => setName(event.target.value)} required /></div><div className="field"><label htmlFor="new-store-address">العنوان <span className="field-hint">(اختياري)</span></label><input className="field-control" id="new-store-address" maxLength={500} value={address} onChange={(event) => setAddress(event.target.value)} /></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onClose}>إلغاء</button><button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'جارٍ الإنشاء…' : 'إنشاء المتجر'}</button></div></form>
  </FormDialog>;
}

export default function StoresPage() {
  const router = useRouter();
  const client = useQueryClient();
  const session = useSession();
  const [createOpen, setCreateOpen] = useState(false);
  const query = useQuery({ queryKey: ['stores'], queryFn: api.stores });
  const switchMutation = useMutation({
    mutationFn: api.switchStore,
    onSuccess: async (store) => {
      await Promise.all([client.invalidateQueries({ queryKey: ['session'] }), client.invalidateQueries({ queryKey: ['dashboard'] }), client.invalidateQueries({ queryKey: ['products'] }), client.invalidateQueries({ queryKey: ['sales'] }), client.invalidateQueries({ queryKey: ['orders'] }), client.invalidateQueries({ queryKey: ['stock'] }), client.invalidateQueries({ queryKey: ['debts'] })]);
      toast.success(`تم التبديل إلى ${store.name}.`);
      router.refresh();
    },
    onError: (reason) => toast.error(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : 'تعذّر التبديل إلى المتجر.'),
  });
  const max = session.subscription.max_stores;
  const currentCount = query.data?.data.length ?? 0;
  const canAdd = max < 0 || currentCount < max;

  return <FeatureGuard feature="multi_store" title="المتاجر">
    <PageHeader title="المتاجر" description="أدر متاجر المؤسسة وانتقل إلى مساحة المتجر النشط." actions={<button className="button button-primary button-sm" type="button" onClick={() => setCreateOpen(true)} disabled={!canAdd}><Plus size={15} aria-hidden="true" /> إضافة متجر</button>} />
    <div className="inline-alert"><StoreIcon aria-hidden="true" /><span>كل متجر له مخزونه وعملياته. تأكد من المتجر النشط قبل تسجيل بيع أو حركة مخزون.</span></div>
    <section className="card card-padding stores-summary"><span>المتاجر النشطة</span><strong>{formatNumber(currentCount)}{max >= 0 ? ` من ${formatNumber(max)}` : ''}</strong><small>الخطة {session.subscription.plan === 'premium' ? 'المميزة' : session.subscription.plan}</small></section>
    {query.isError && <ErrorPanel error={query.error} retry={() => void query.refetch()} />}
    {query.isLoading ? <LoadingRows rows={3} /> : query.data?.data.length ? <div className="store-grid">{query.data.data.map((store) => {
      const active = store.id === session.store.id;
      return <article className={`store-card${active ? ' store-card-current' : ''}`} key={store.id}>
        <div className="store-card-top"><span className="store-card-icon"><StoreIcon aria-hidden="true" /></span>{active ? <span className="badge badge-success">المتجر النشط</span> : <span className="badge badge-brand">متاح</span>}</div>
        <h2>{store.name}</h2><p className="store-address"><MapPin size={14} aria-hidden="true" /> {store.address || 'لم يُحدد عنوان'}</p><div className="store-code"><span>رمز المتجر</span><strong dir="ltr">{store.code}</strong></div>
        {!active && <button className="button button-secondary store-switch" type="button" disabled={switchMutation.isPending} onClick={() => switchMutation.mutate(store.id)}>{switchMutation.isPending ? 'جارٍ التبديل…' : 'فتح مساحة هذا المتجر'} <Check size={15} aria-hidden="true" /></button>}
      </article>;
    })}</div> : !query.isError ? <EmptyState icon={<StoreIcon aria-hidden="true" />} title="لا توجد متاجر أخرى" description="أضف متجرًا جديدًا إلى المؤسسة لإدارة مخزونه وعملياته بصورة منفصلة." action={<button className="button button-primary button-sm" type="button" onClick={() => setCreateOpen(true)}><Plus size={15} /> إضافة متجر</button>} /> : null}
    {!canAdd && <div className="page-note">وصلت إلى الحد الحالي لعدد المتاجر. راجع صفحة <a href="/pricing">الباقات</a> لمعرفة الخيارات المتاحة.</div>}
    <CreateStoreDialog open={createOpen} onClose={() => setCreateOpen(false)} />
  </FeatureGuard>;
}
