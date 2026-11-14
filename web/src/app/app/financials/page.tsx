'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, FileChartColumnIncreasing, Filter, TrendingDown, TrendingUp } from 'lucide-react';
import { FeatureGuard } from '@/components/feature-guard';
import { ErrorPanel, LoadingRows, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate, formatMoney, formatNumber, todayInTunis } from '@/lib/format';
import { useState } from 'react';

function daysBetween(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

function exportCsv(rows: NonNullable<ReturnType<typeof useQuery<Awaited<ReturnType<typeof api.financialDaily>>>>['data']>['data']) {
  const headings = ['التاريخ', 'الإيرادات (مليم)', 'الكلفة (مليم)', 'الربح الإجمالي (مليم)', 'الخسائر (مليم)', 'عدد المبيعات'];
  const data = rows.map((row) => [row.date, row.revenue_milliemes, row.cost_milliemes, row.gross_profit_milliemes, row.losses_milliemes, row.sales_count]);
  const csv = `\uFEFF${[headings, ...data].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `matjari-financials-${rows[0]?.date ?? 'report'}.csv`;
  link.click();
  URL.revokeObjectURL(href);
}

export default function FinancialsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rangeDays = from && to ? daysBetween(from, to) : null;
  const isRangeValid = (!from && !to) || (rangeDays !== null && rangeDays >= 0 && rangeDays <= 366);
  const partialRange = Boolean(from) !== Boolean(to);

  const summaryQuery = useQuery({
    queryKey: ['financial-summary', from, to],
    queryFn: () => api.financialSummary(from || undefined, to || undefined),
    enabled: isRangeValid && !partialRange,
  });
  const dailyQuery = useQuery({
    queryKey: ['financial-daily', from, to],
    queryFn: () => api.financialDaily(from, to),
    enabled: Boolean(from && to && isRangeValid),
  });
  const summary = summaryQuery.data;

  return <FeatureGuard feature="financials" title="التقارير المالية">
    <PageHeader title="التقارير المالية" description="ملخص مبيعات وتكاليف وخسائر الفترة المحددة، بتوقيت تونس." actions={<button className="button button-secondary button-sm" type="button" onClick={() => { const today = todayInTunis(); setFrom(today); setTo(today); }}><Filter size={15} aria-hidden="true" /> اليوم</button>} />
    <section className="card toolbar financial-filters"><div className="toolbar-group"><label className="date-filter"><span>من تاريخ</span><input className="filter-control" type="date" aria-label="من تاريخ" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="date-filter"><span>إلى تاريخ</span><input className="filter-control" type="date" aria-label="إلى تاريخ" value={to} onChange={(event) => setTo(event.target.value)} /></label></div><span className="field-hint">الفترة القصوى 367 يومًا شاملًا.</span></section>
    {partialRange && <div className="form-error" role="alert">اختر تاريخ البداية والنهاية معًا، أو أزل التاريخين لعرض اليوم.</div>}
    {from && to && !isRangeValid && <div className="form-error" role="alert">تحقق من الفترة: تاريخ النهاية يجب أن يكون بعد البداية، والمدة لا تتجاوز سنة واحدة.</div>}
    {summaryQuery.isError && <ErrorPanel error={summaryQuery.error} retry={() => void summaryQuery.refetch()} />}
    {summaryQuery.isLoading && <div className="stats-grid">{Array.from({ length: 5 }, (_, index) => <div className="skeleton" key={index} />)}</div>}
    {summary && <div className="stats-grid financial-stats">
      <article className="stat-card"><div className="stat-top"><span>الإيرادات</span><span className="stat-icon"><FileChartColumnIncreasing aria-hidden="true" /></span></div><div className="stat-value">{formatMoney(summary.revenue_milliemes)}</div><div className="stat-caption">تشمل رسوم التوصيل</div></article>
      <article className="stat-card"><div className="stat-top"><span>كلفة البضاعة</span><span className="stat-icon"><TrendingDown aria-hidden="true" /></span></div><div className="stat-value">{formatMoney(summary.cost_milliemes)}</div><div className="stat-caption">حسب الكلفة المسجلة عند البيع</div></article>
      <article className="stat-card stat-teal"><div className="stat-top"><span>الربح الإجمالي</span><span className="stat-icon"><TrendingUp aria-hidden="true" /></span></div><div className="stat-value">{formatMoney(summary.gross_profit_milliemes)}</div><div className="stat-caption">قبل النفقات الأخرى</div></article>
      <article className="stat-card stat-rose"><div className="stat-top"><span>خسائر المخزون</span><span className="stat-icon"><TrendingDown aria-hidden="true" /></span></div><div className="stat-value">{formatMoney(summary.losses_milliemes)}</div><div className="stat-caption">التالف المسجل بتكلفته</div></article>
      <article className="stat-card"><div className="stat-top"><span>عمليات البيع</span><span className="stat-icon"><FileChartColumnIncreasing aria-hidden="true" /></span></div><div className="stat-value">{formatNumber(summary.sales_count)}</div><div className="stat-caption">خلال الفترة</div></article>
    </div>}
    <section className="card card-padding financial-daily">
      <div className="card-heading"><div><h2>التفصيل اليومي</h2><p>{from && to ? `${formatDate(from)} — ${formatDate(to)}` : 'اختر فترة لعرض تفاصيل الأيام.'}</p></div>{dailyQuery.data?.data.length ? <button className="button button-secondary button-sm" type="button" onClick={() => exportCsv(dailyQuery.data!.data)}><Download size={15} aria-hidden="true" /> تصدير CSV</button> : null}</div>
      {dailyQuery.isError && <ErrorPanel error={dailyQuery.error} retry={() => void dailyQuery.refetch()} />}
      {dailyQuery.isLoading && <LoadingRows rows={4} />}
      {dailyQuery.data?.data.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>التاريخ</th><th>الإيرادات</th><th>الكلفة</th><th>الربح الإجمالي</th><th>الخسائر</th><th>عدد المبيعات</th></tr></thead><tbody>{dailyQuery.data.data.map((row) => <tr key={row.date}><td className="table-primary">{formatDate(row.date)}</td><td>{formatMoney(row.revenue_milliemes)}</td><td>{formatMoney(row.cost_milliemes)}</td><td>{formatMoney(row.gross_profit_milliemes)}</td><td>{formatMoney(row.losses_milliemes)}</td><td>{formatNumber(row.sales_count)}</td></tr>)}</tbody></table></div> : from && to && !dailyQuery.isLoading && !dailyQuery.isError ? <div className="inline-empty">لا توجد سجلات للفترة المحددة.</div> : <div className="inline-empty">اختر تاريخ البداية والنهاية لعرض السجل اليومي.</div>}
    </section>
    <div className="financial-disclaimer"><strong>مهم:</strong> الإيرادات تشمل رسوم التوصيل، بينما الربح الإجمالي لا يشملها. الخسائر تُحسب من حركة التالف المسجلة. هذه المؤشرات تشغيلية وليست كشفًا ضريبيًا أو محاسبيًا معتمدًا، ولا تشمل المصروفات غير المدخلة.</div>
  </FeatureGuard>;
}
