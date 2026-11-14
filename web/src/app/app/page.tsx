'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpLeft,
  Boxes,
  CircleDollarSign,
  Clock3,
  Package,
  Plus,
  ShoppingBag,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime, formatMoney, formatNumber, paymentLabel } from '@/lib/format';
import type { Feature } from '@/lib/types';
import { EmptyState, ErrorPanel, LoadingRows, PageHeader } from '@/components/ui';
import { useSession } from '@/components/workspace-shell';

export default function DashboardPage() {
  const session = useSession();
  const query = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, staleTime: 20_000 });
  const summary = query.data;

  const stats = summary ? [
    { title: 'إيراد اليوم', value: formatMoney(summary.today_revenue_milliemes), caption: 'يشمل رسوم التوصيل المسجلة', icon: CircleDollarSign, color: 'brand' },
    { title: 'عمليات البيع', value: formatNumber(summary.today_sales), caption: 'من بداية اليوم بتوقيت تونس', icon: ShoppingBag, color: 'teal' },
    { title: 'طلبات قيد المتابعة', value: formatNumber(summary.pending_orders), caption: 'لم تُسلّم أو تُلغَ بعد', icon: Truck, color: 'gold' },
    { title: 'منتجات منخفضة المخزون', value: formatNumber(summary.low_stock_count), caption: 'عند حد التنبيه أو دونه', icon: Boxes, color: 'rose' },
    ...(summary.today_gross_profit_milliemes !== null ? [{ title: 'الربح الإجمالي اليوم', value: formatMoney(summary.today_gross_profit_milliemes), caption: 'لا يشمل ربح التوصيل', icon: TrendingUp, color: 'teal' }] : []),
    ...(summary.outstanding_debts_milliemes !== null ? [{ title: 'الديون المتبقية', value: formatMoney(summary.outstanding_debts_milliemes), caption: 'على العملاء، حسب السجل اليدوي', icon: CircleDollarSign, color: 'gold' }] : []),
  ] : [];

  const quickActions: { href: string; label: string; icon: typeof Plus; feature: Feature }[] = [
    { href: '/app/products', label: 'إضافة منتج', icon: Package, feature: 'products' },
    { href: '/app/sales', label: 'تسجيل بيع', icon: ShoppingBag, feature: 'sales' },
    { href: '/app/stock', label: 'تسجيل توريد', icon: Boxes, feature: 'stock' },
    { href: '/app/orders', label: 'متابعة الطلبات', icon: Truck, feature: 'orders' },
  ];

  return (
    <>
      <PageHeader title={`مرحبًا، ${session.user.name}`} description={`إليك ملخص مساحة ${session.store.name}. آخر تحديث: ${formatDateTime(summary?.generated_at)}.`} actions={<button className="button button-secondary button-sm" type="button" onClick={() => void query.refetch()} disabled={query.isFetching}><Clock3 size={15} aria-hidden="true" /> {query.isFetching ? 'جارٍ التحديث…' : 'تحديث البيانات'}</button>} />
      {query.isError && <ErrorPanel error={query.error} retry={() => void query.refetch()} />}
      <div className="quick-actions" aria-label="إجراءات سريعة">
        {quickActions.filter((action) => session.permissions[action.feature]).map(({ href, label, icon: Icon }) => <Link className="quick-action" href={href} key={href}><span><Icon aria-hidden="true" /></span>{label}<ArrowUpLeft className="quick-arrow" aria-hidden="true" /></Link>)}
      </div>
      {query.isLoading ? <div className="stats-grid">{Array.from({ length: 4 }, (_, index) => <div className="skeleton" key={index} />)}</div> : summary && <div className="stats-grid">{stats.map(({ title, value, caption, icon: Icon, color }) => <article className={`stat-card stat-${color}`} key={title}><div className="stat-top"><span>{title}</span><span className="stat-icon"><Icon aria-hidden="true" /></span></div><div className="stat-value">{value}</div><div className="stat-caption">{caption}</div></article>)}</div>}
      <div className="dashboard-grid">
        <section className="card card-padding">
          <div className="card-heading"><div><h2>أحدث المبيعات</h2><p>آخر العمليات المسجّلة في المتجر</p></div><Link className="feature-link" href="/app/sales">كل المبيعات <ArrowLeft aria-hidden="true" /></Link></div>
          {query.isLoading ? <LoadingRows rows={3} /> : summary?.recent_sales.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>العملية</th><th>العميل</th><th>الدفع</th><th>الإجمالي</th><th>الوقت</th></tr></thead><tbody>
            {summary.recent_sales.map((sale) => <tr key={sale.id}><td className="table-primary">#{formatNumber(sale.number)}</td><td>{sale.customer_name || 'بيع مباشر'}</td><td>{paymentLabel(sale.payment_method)}</td><td className="table-primary">{formatMoney(sale.total_milliemes)}</td><td>{formatDateTime(sale.created_at)}</td></tr>)}
          </tbody></table></div> : <EmptyState icon={<ShoppingBag />} title="لا توجد مبيعات مسجلة بعد" description="ستظهر هنا أحدث عمليات البيع عند تسجيلها." action={session.permissions.sales ? <Link className="button button-primary button-sm" href="/app/sales"><Plus size={15} /> تسجيل أول بيع</Link> : undefined} />}
        </section>
        <section className="card card-padding">
          <div className="card-heading"><div><h2>تنبيهات المخزون</h2><p>أصناف عند حد التنبيه أو أقل</p></div><Link className="feature-link" href="/app/stock">المخزون <ArrowLeft aria-hidden="true" /></Link></div>
          {query.isLoading ? <LoadingRows rows={3} /> : summary?.low_stock_products.length ? <div className="list-stack">{summary.low_stock_products.map((product) => <div className="list-row" key={product.id}><div className="list-main"><span className="list-avatar"><Package aria-hidden="true" /></span><span className="list-copy"><strong>{product.name}</strong><small>{product.category || 'دون تصنيف'} · الحد الأدنى {formatNumber(product.min_stock)}</small></span></div><span className="badge badge-warning">المتوفر {formatNumber(product.stock)}</span></div>)}</div> : <div className="inline-empty">لا توجد تنبيهات مخزون حاليًا.</div>}
        </section>
      </div>
      {summary && <p className="dashboard-note">المؤشرات مبنية على السجلات المدخلة. الربح الإجمالي يحسب مبيعات البضاعة مطروحًا منها كلفتها، ولا يشمل رسوم التوصيل أو النفقات غير المسجلة.</p>}
    </>
  );
}
