import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Check, CircleHelp, Minus } from 'lucide-react';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata(
  'باقات متجري وحدود المنتجات والموظفين',
  'قارن بين التجربة والأساسية والمتوسطة والمميزة في متجري: حدود المنتجات والموظفين والمتاجر وإتاحة الديون والتقارير المالية.',
  '/pricing',
);

const plans = [
  { id: 'trial', name: 'التجربة', intro: '14 يومًا للتعرّف على مساحة متجرك', products: '250', employees: 'لا تشمل موظفين', stores: 'متجر واحد', features: ['المنتجات والمخزون', 'المبيعات والطلبات'], highlighted: false },
  { id: 'basic', name: 'الأساسية', intro: 'لإدارة العمليات اليومية لمتجر واحد', products: '1,000', employees: 'لا تشمل موظفين', stores: 'متجر واحد', features: ['المنتجات والمخزون', 'المبيعات والطلبات'], highlighted: false },
  { id: 'medium', name: 'المتوسطة', intro: 'للمتجر الذي يعمل معه فريق', products: '10,000', employees: 'حتى 15 موظفًا', stores: 'متجر واحد', features: ['كل ما في الأساسية', 'دفتر الديون', 'التقارير المالية', 'إدارة الموظفين'], highlighted: true },
  { id: 'premium', name: 'المميزة', intro: 'لإدارة عدة متاجر من مؤسسة واحدة', products: 'غير محدود', employees: 'غير محدود', stores: 'متاجر متعددة', features: ['كل ما في المتوسطة', 'إدارة عدة متاجر', 'حدود غير محدودة للمنتجات والفريق'], highlighted: false },
];

const rows = [
  ['المنتجات لكل متجر', '250', '1,000', '10,000', 'غير محدود'],
  ['الموظفون للمؤسسة', '0', '0', '15', 'غير محدود'],
  ['عدد المتاجر', '1', '1', '1', 'غير محدود'],
  ['المبيعات والطلبات', 'متاحة', 'متاحة', 'متاحة', 'متاحة'],
  ['الديون والتقارير المالية', '—', '—', 'متاحة', 'متاحة'],
  ['إدارة الموظفين', '—', '—', 'متاحة', 'متاحة'],
  ['تعدد المتاجر', '—', '—', '—', 'متاحة'],
];

export default function PricingPage() {
  return (
    <>
      <section className="content-page">
        <div className="container">
          <header className="content-heading">
            <span className="eyebrow"><span className="eyebrow-dot" /> الباقات والحدود</span>
            <h1>اختر مساحة تناسب طريقة عمل متجرك</h1>
            <p>الحدود أدناه مأخوذة من إعدادات الخطط الحالية في النظام. لا تُعرض أسعار ثابتة هنا، ولا تتم أي عملية تحصيل داخل التطبيق.</p>
          </header>
          <div className="plan-grid">
            {plans.map((plan) => (
              <article className={`plan-card${plan.highlighted ? ' plan-card-featured' : ''}`} key={plan.id}>
                {plan.highlighted && <span className="plan-ribbon">للفريق</span>}
                <div className="plan-top"><h2>{plan.name}</h2><span className="plan-symbol">{plan.id === 'trial' ? '١٤' : plan.id === 'premium' ? '∞' : plan.id === 'medium' ? '٣' : '٢'}</span></div>
                <p className="plan-intro">{plan.intro}</p>
                <div className="plan-price">تواصل لمعرفة السعر</div>
                <div className="plan-limit"><span>المنتجات</span><strong>{plan.products}</strong></div>
                <div className="plan-limit"><span>الفريق</span><strong>{plan.employees}</strong></div>
                <div className="plan-limit"><span>المتاجر</span><strong>{plan.stores}</strong></div>
                <ul className="plan-feature-list">{plan.features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>
                <Link className={`button ${plan.highlighted ? 'button-primary' : 'button-secondary'} plan-button`} href={plan.id === 'trial' ? '/register' : '/contact'}>
                  {plan.id === 'trial' ? 'ابدأ التجربة' : 'استفسر عن الخطة'} <ArrowLeft size={16} aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
          <div className="pricing-note"><CircleHelp size={18} aria-hidden="true" /><p><strong>كيف يتم التجديد؟</strong> تسجّل طلبًا للتواصل معك. لا تُدخل بيانات بطاقة ولا يُحصّل التطبيق أي مبلغ تلقائيًا؛ يُتحقق من الدفع خارج التطبيق قبل تفعيل الخطة.</p></div>
          <div className="plan-table-wrap">
            <h2>مقارنة سريعة للميزات</h2>
            <div className="table-wrap"><table className="data-table plan-table"><thead><tr><th>الميزة</th><th>التجربة</th><th>الأساسية</th><th>المتوسطة</th><th>المميزة</th></tr></thead><tbody>
              {rows.map(([label, ...values]) => <tr key={label}><td className="table-primary">{label}</td>{values.map((value, index) => <td key={`${label}-${index}`}>{value === 'متاحة' ? <span className="plan-available"><Check size={15} aria-label="متاحة" /></span> : value === '—' ? <Minus size={14} aria-label="غير متاحة" /> : value}</td>)}</tr>)}
            </tbody></table></div>
          </div>
          <div className="callout-info pricing-disclaimer">الحدود والميزات قد تتغير بعد تحديث الخطة. يتحقق الخادم من كل إجراء ومن صلاحية الاشتراك. إذا لم تكن متأكدًا من احتياجك، تواصل معنا قبل إرسال طلب التجديد.</div>
        </div>
      </section>
    </>
  );
}
