'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CircleDollarSign, Info, Phone, Send } from 'lucide-react';
import { toast } from 'sonner';
import { FeatureGuard } from '@/components/feature-guard';
import { ErrorPanel, LoadingRows, PageHeader } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDateTime, formatNumber, humanizeApiError, planLabel, remainingDays } from '@/lib/format';
import type { PlanId } from '@/lib/types';
import { useSession } from '@/components/workspace-shell';

const planOptions: { id: Exclude<PlanId, 'trial'>; name: string; description: string }[] = [
  { id: 'basic', name: 'الأساسية', description: 'إدارة العمليات اليومية لمتجر واحد.' },
  { id: 'medium', name: 'المتوسطة', description: 'دفتر ديون وتقارير مالية وإدارة فريق حتى 15 موظفًا.' },
  { id: 'premium', name: 'المميزة', description: 'إدارة عدة متاجر وحدود غير محدودة للمنتجات والفريق.' },
];
const requestStatus: Record<string, string> = { pending: 'بانتظار التواصل', contacted: 'تم التواصل', closed: 'مغلق' };

export default function BillingPage() {
  const session = useSession();
  const client = useQueryClient();
  const [plan, setPlan] = useState<Exclude<PlanId, 'trial'>>('basic');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestsQuery = useQuery({ queryKey: ['billing-requests'], queryFn: api.billingRequests });
  const mutation = useMutation({
    mutationFn: api.requestPlan,
    onSuccess: async (result) => { await client.invalidateQueries({ queryKey: ['billing-requests'] }); setError(''); setMessage(''); toast.success(result.message); },
    onError: (reason) => setError(reason instanceof ApiError ? humanizeApiError(reason.code, reason.message) : 'تعذّر إرسال الطلب.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); mutation.mutate({ plan_id: plan, message: message.trim() }); }
  const days = remainingDays(session.subscription.expires_at);

  return <FeatureGuard feature="billing" title="الخطة والتجديد">
    <PageHeader title="الخطة والتجديد" description="راجع حالة اشتراك المؤسسة وأرسل طلب تواصل عند الحاجة." />
    <div className="billing-overview">
      <section className="card card-padding billing-current">
        <div className="billing-current-top"><span className="billing-icon"><CircleDollarSign aria-hidden="true" /></span><span className={`badge ${session.subscription.active ? 'badge-success' : 'badge-danger'}`}>{session.subscription.active ? 'الخطة نشطة' : 'انتهت الخطة'}</span></div>
        <p className="billing-overline">الخطة الحالية</p><h2>{planLabel(session.subscription.plan)}</h2>
        <div className="billing-expiry"><CalendarClock aria-hidden="true" /><span>{session.subscription.active ? `متبقي ${formatNumber(days)} يومًا` : 'انتهت صلاحية الخطة'} · تنتهي في {new Intl.DateTimeFormat('ar-TN', { dateStyle: 'long', timeZone: 'Africa/Tunis' }).format(new Date(session.subscription.expires_at))}</span></div>
        <div className="plan-limit billing-limit"><span>حد المنتجات في المتجر</span><strong>{session.subscription.max_products < 0 ? 'غير محدود' : formatNumber(session.subscription.max_products)}</strong></div>
        <div className="plan-limit billing-limit"><span>حد الموظفين للمؤسسة</span><strong>{session.subscription.max_employees < 0 ? 'غير محدود' : formatNumber(session.subscription.max_employees)}</strong></div>
        <div className="plan-limit billing-limit"><span>حد المتاجر</span><strong>{session.subscription.max_stores < 0 ? 'غير محدود' : formatNumber(session.subscription.max_stores)}</strong></div>
      </section>
      <section className="card card-padding billing-request-card">
        <div className="card-heading"><div><h2>طلب تجديد أو تغيير الخطة</h2><p>يسجّل طلب تواصل ولا يخصم أي مبلغ.</p></div><Send size={18} color="#445b7a" /></div>
        <div className="inline-alert"><Info aria-hidden="true" /><span>لا يوجد دفع إلكتروني داخل التطبيق. لا تدخل معلومات بطاقة؛ يتواصل معك الفريق لتوضيح خطوات التجديد.</span></div>
        <form className="billing-form" onSubmit={submit} noValidate>
          <div className="field"><label htmlFor="renew-plan">الخطة المطلوبة</label><select className="field-control" id="renew-plan" value={plan} onChange={(event) => setPlan(event.target.value as typeof plan)}>{planOptions.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.description}</option>)}</select></div>
          <div className="field"><label htmlFor="renew-message">رسالة لفريق الدعم <span className="field-hint">(اختياري)</span></label><textarea className="field-control field-textarea" id="renew-message" maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="اكتب الوقت المناسب للتواصل أو استفسارك…" /></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'جارٍ إرسال الطلب…' : 'إرسال طلب تواصل'} <Send size={15} aria-hidden="true" /></button>
        </form>
        <p className="billing-contact"><Phone size={15} aria-hidden="true" /> تحتاج مساعدة؟ <Link href="/contact">اتصل بفريق متجري</Link></p>
      </section>
    </div>
    <section className="card card-padding billing-history">
      <div className="card-heading"><div><h2>طلبات المؤسسة</h2><p>آخر الطلبات المسجلة</p></div></div>
      {requestsQuery.isError ? <ErrorPanel error={requestsQuery.error} retry={() => void requestsQuery.refetch()} /> : requestsQuery.isLoading ? <LoadingRows rows={2} /> : requestsQuery.data?.data.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>الخطة المطلوبة</th><th>الحالة</th><th>تاريخ الطلب</th></tr></thead><tbody>{requestsQuery.data.data.map((request) => <tr key={request.id}><td className="table-primary">{planLabel(request.plan_id)}</td><td><span className={`badge ${request.status === 'pending' ? 'badge-warning' : 'badge-brand'}`}>{requestStatus[request.status] ?? request.status}</span></td><td>{formatDateTime(request.created_at)}</td></tr>)}</tbody></table></div> : <div className="inline-empty">لم تُسجّل طلبات تجديد بعد.</div>}
    </section>
    <div className="page-note">يؤكد النظام تفعيل الخطة بعد التحقق من الدفع خارج التطبيق. إرسال الطلب لا يعني قبول الدفع أو تفعيل الاشتراك.</div>
  </FeatureGuard>;
}
