'use client';

import { FormEvent, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Clock3, Eye, Plus, ReceiptText, Search } from 'lucide-react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/dialog';
import { FeatureGuard } from '@/components/feature-guard';
import { EmptyState, ErrorPanel, LoadingRows, PageHeader } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney, formatNumber, humanizeApiError, parseTnd } from '@/lib/format';
import { normalizeTunisianPhone } from '@/lib/schemas';
import type { Debt } from '@/lib/types';

function NewDebtDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const intentKey = useRef<string | null>(null);
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const keyForIntent = () => { intentKey.current ??= crypto.randomUUID(); return intentKey.current; };
  const clearIntent = () => { intentKey.current = null; };
  const mutation = useMutation({
    mutationFn: () => {
      if (!customer.trim()) throw new Error('أدخل اسم العميل.');
      const total = parseTnd(amount);
      if (total === null || total < 1 || total > 1_000_000_000_000) throw new Error('أدخل مبلغًا صحيحًا حتى 3 أرقام بعد الفاصلة.');
      let normalizedPhone = '';
      if (phone.trim()) {
        const normalized = normalizeTunisianPhone(phone);
        if (!normalized) throw new Error('أدخل رقم هاتف تونسيًا صحيحًا أو اترك الحقل فارغًا.');
        normalizedPhone = normalized;
      }
      return api.createDebt({ customer_name: customer.trim(), customer_phone: normalizedPhone, note: note.trim(), total_milliemes: total, due_date: due || null }, keyForIntent());
    },
    onSuccess: async () => {
      intentKey.current = null;
      await Promise.all([client.invalidateQueries({ queryKey: ['debts'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]);
      toast.success('تم تسجيل الدين في الدفتر.'); onClose();
    },
    onError: (reason) => setError(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : reason instanceof Error ? reason.message : 'تعذّر تسجيل الدين.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); mutation.mutate(); }

  return <FormDialog open={open} onOpenChange={(value) => !value && onClose()} title="تسجيل دين جديد" description="سجّل الرصيد المتبقي للعميل وتاريخ الاستحقاق عند الحاجة.">
    <form className="dialog-form" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="debt-customer">اسم العميل</label><input className="field-control" id="debt-customer" maxLength={160} value={customer} onChange={(event) => { setCustomer(event.target.value); clearIntent(); }} required /></div>
      <div className="field"><label htmlFor="debt-phone">رقم الهاتف <span className="field-hint">(اختياري)</span></label><input className="field-control" id="debt-phone" type="tel" dir="ltr" maxLength={32} value={phone} onChange={(event) => { setPhone(event.target.value); clearIntent(); }} /></div>
      <div className="field-row"><div className="field"><label htmlFor="debt-amount">المبلغ (د.ت)</label><input className="field-control" id="debt-amount" inputMode="decimal" dir="ltr" value={amount} onChange={(event) => { setAmount(event.target.value); clearIntent(); }} placeholder="0.000" required /></div><div className="field"><label htmlFor="debt-due">تاريخ الاستحقاق <span className="field-hint">(اختياري)</span></label><input className="field-control" id="debt-due" type="date" value={due} onChange={(event) => { setDue(event.target.value); clearIntent(); }} /></div></div>
      <div className="field"><label htmlFor="debt-note">ملاحظة <span className="field-hint">(اختياري)</span></label><textarea className="field-control field-textarea" id="debt-note" maxLength={2000} value={note} onChange={(event) => { setNote(event.target.value); clearIntent(); }} /></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onClose}>إلغاء</button><button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'جارٍ الحفظ…' : 'تسجيل الدين'}</button></div>
    </form>
  </FormDialog>;
}

function DebtDetailsDialog({ debtId, onClose }: { debtId: string | null; onClose: () => void }) {
  const client = useQueryClient();
  const intentKey = useRef<string | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const debtQuery = useQuery({ queryKey: ['debt', debtId], queryFn: () => api.debt(debtId!), enabled: Boolean(debtId) });
  const paymentQuery = useQuery({ queryKey: ['debt-payments', debtId], queryFn: () => api.debtPayments(debtId!), enabled: Boolean(debtId) });
  const debt = debtQuery.data;
  const remaining = debt ? debt.total_milliemes - debt.amount_paid_milliemes : 0;
  const mutation = useMutation({
    mutationFn: () => {
      if (!debt) throw new Error('لم يتم تحميل الدين.');
      const payment = parseTnd(amount);
      if (payment === null || payment < 1) throw new Error('أدخل مبلغ دفعة صحيحًا.');
      if (payment > remaining) throw new Error('المبلغ أكبر من الرصيد المتبقي.');
      intentKey.current ??= crypto.randomUUID();
      return api.payDebt(debt.id, payment, intentKey.current);
    },
    onSuccess: async () => {
      intentKey.current = null;
      setAmount('');
      await Promise.all([client.invalidateQueries({ queryKey: ['debt', debtId] }), client.invalidateQueries({ queryKey: ['debt-payments', debtId] }), client.invalidateQueries({ queryKey: ['debts'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]);
      setError(''); toast.success('تم تسجيل الدفعة وتحديث الرصيد.');
    },
    onError: (reason) => setError(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : reason instanceof Error ? reason.message : 'تعذّر تسجيل الدفعة.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); mutation.mutate(); }

  return <FormDialog open={Boolean(debtId)} onOpenChange={(value) => !value && onClose()} title="تفاصيل الدين" description="الرصيد والدفعات المسجلة في الدفتر.">
    {debtQuery.isLoading ? <LoadingRows rows={3} /> : debtQuery.isError ? <ErrorPanel error={debtQuery.error} retry={() => void debtQuery.refetch()} /> : debt && <>
      <div className="metric-line"><span>العميل</span><strong>{debt.customer_name}</strong></div><div className="metric-line"><span>المبلغ الأصلي</span><strong>{formatMoney(debt.total_milliemes)}</strong></div><div className="metric-line"><span>المسدّد</span><strong>{formatMoney(debt.amount_paid_milliemes)}</strong></div><div className="metric-line debt-balance"><span>المتبقي</span><strong>{formatMoney(remaining)}</strong></div><div className="metric-line"><span>الاستحقاق</span><strong>{formatDate(debt.due_date)}</strong></div>{debt.note && <div className="metric-line"><span>ملاحظة</span><strong>{debt.note}</strong></div>}
      {remaining > 0 && !debt.archived && <form className="debt-payment-form" onSubmit={submit} noValidate><div className="field"><label htmlFor="debt-payment-amount">تسجيل دفعة (د.ت)</label><input className="field-control" id="debt-payment-amount" inputMode="decimal" dir="ltr" value={amount} onChange={(event) => { setAmount(event.target.value); intentKey.current = null; }} placeholder="0.000" /></div>{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary button-sm" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'جارٍ التسجيل…' : 'تسجيل الدفعة'}</button></form>}
      <div className="card-heading payment-history-heading"><div><h2>سجل الدفعات</h2><p>حتى آخر 100 دفعة</p></div><Clock3 size={17} /></div>
      {paymentQuery.isLoading ? <LoadingRows rows={2} /> : paymentQuery.isError ? <ErrorPanel error={paymentQuery.error} retry={() => void paymentQuery.refetch()} /> : paymentQuery.data?.data.length ? <div className="list-stack">{paymentQuery.data.data.map((payment) => <div className="list-row" key={payment.id}><span className="list-copy"><strong>{formatDateTime(payment.created_at)}</strong><small>دفعة مسجلة</small></span><strong>{formatMoney(payment.amount_milliemes)}</strong></div>)}</div> : <div className="inline-empty">لا توجد دفعات مسجلة بعد.</div>}
    </>}
  </FormDialog>;
}

export default function DebtsPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['debts', page, search, archived], queryFn: () => api.debts({ page, page_size: 20, search, archived }) });
  const archiveMutation = useMutation({
    mutationFn: api.archiveDebt,
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ['debts'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]); toast.success('تمت أرشفة الدين مع الاحتفاظ بسجله.'); },
    onError: (reason) => toast.error(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : 'تعذّرت أرشفة الدين.'),
  });

  return <FeatureGuard feature="debts" title="ديون العملاء">
    <PageHeader title="ديون العملاء" description="تابع الرصيد المتبقي وسجل الدفعات في دفتر يدوي." actions={!archived ? <button className="button button-primary button-sm" type="button" onClick={() => setCreateOpen(true)}><Plus size={15} aria-hidden="true" /> تسجيل دين</button> : undefined} />
    <div className="inline-alert"><ReceiptText aria-hidden="true" /><span>هذا دفتر متابعة يدوي؛ لا يرسل مطالبات ولا يتصل بنظام دفع أو حساب مصرفي.</span></div>
    <section className="card toolbar"><div className="toolbar-group"><label className="search-control"><Search aria-hidden="true" /><input aria-label="البحث عن دين" type="search" placeholder="اسم العميل أو رقم الهاتف…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><label className="toolbar-filter"><input type="checkbox" checked={archived} onChange={(event) => { setArchived(event.target.checked); setPage(1); }} /> عرض المؤرشف</label></div><span className="toolbar-count">{query.data ? `${formatNumber(query.data.total)} سجل` : 'دفتر الديون'}</span></section>
    <section className="card">
      {query.isError && <div style={{ padding: 16 }}><ErrorPanel error={query.error} retry={() => void query.refetch()} /></div>}
      {query.isLoading ? <div style={{ padding: 17 }}><LoadingRows /></div> : query.data?.data.length ? <>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>العميل</th><th>المبلغ الأصلي</th><th>المسدّد</th><th>المتبقي</th><th>الاستحقاق</th><th>الإجراءات</th></tr></thead><tbody>{query.data.data.map((debt: Debt) => { const remaining = debt.total_milliemes - debt.amount_paid_milliemes; return <tr key={debt.id}><td><span className="table-primary">{debt.customer_name}</span><span className="table-secondary" dir="ltr">{debt.customer_phone || '—'}</span></td><td>{formatMoney(debt.total_milliemes)}</td><td>{formatMoney(debt.amount_paid_milliemes)}</td><td className="table-primary">{formatMoney(remaining)}</td><td>{formatDate(debt.due_date)}</td><td><div className="table-actions"><button className="icon-button" type="button" title="التفاصيل والدفعات" aria-label={`تفاصيل دين ${debt.customer_name}`} onClick={() => setSelectedId(debt.id)}><Eye aria-hidden="true" /></button>{!archived && <button className="icon-button danger" type="button" title="أرشفة الدين" aria-label={`أرشفة دين ${debt.customer_name}`} disabled={archiveMutation.isPending} onClick={() => { if (window.confirm('أرشفة سجل الدين؟ سيبقى محفوظًا ضمن الأرشيف.')) archiveMutation.mutate(debt.id); }}><Archive aria-hidden="true" /></button>}</div></td></tr>; })}</tbody></table></div>
        <div className="pagination"><span>عرض {formatNumber((page - 1) * 20 + 1)}–{formatNumber(Math.min(page * 20, query.data.total))} من {formatNumber(query.data.total)}</span><div className="pagination-actions"><button type="button" aria-label="الصفحة السابقة" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button><span className="pagination-current">{formatNumber(page)}</span><button type="button" aria-label="الصفحة التالية" disabled={page * 20 >= query.data.total} onClick={() => setPage((value) => value + 1)}>›</button></div></div>
      </> : !query.isError ? <EmptyState icon={<ReceiptText aria-hidden="true" />} title={archived ? 'لا توجد سجلات مؤرشفة' : 'لا توجد ديون مسجلة'} description={archived ? 'السجلات المؤرشفة ستظهر هنا.' : 'سجّل دينًا لمتابعة المبلغ والدفعات المتبقية.'} action={!archived ? <button className="button button-primary button-sm" type="button" onClick={() => setCreateOpen(true)}><Plus size={15} /> تسجيل أول دين</button> : undefined} /> : null}
    </section>
    <div className="page-note">الأرشفة تخفي السجل عن القائمة النشطة ولا تعني حذفه من قاعدة البيانات.</div>
    <NewDebtDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    <DebtDetailsDialog debtId={selectedId} onClose={() => setSelectedId(null)} />
  </FeatureGuard>;
}
