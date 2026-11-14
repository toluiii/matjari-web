import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  Barcode,
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  CreditCard,
  Package,
  ReceiptText,
  ShieldCheck,
  Store,
  UsersRound,
} from 'lucide-react';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata(
  'مزايا متجري لإدارة المنتجات والمخزون والمبيعات',
  'تعرّف على أدوات برنامج متجري: المنتجات والباركود، حركات المخزون، المبيعات، الطلبات، ديون العملاء، الموظفون وملخصات المتجر.',
  '/features',
);

const capabilities = [
  { icon: Package, title: 'المنتجات والباركود', text: 'سجل اسم المنتج وتصنيفه وباركوده وكلفة الشراء والكمية الافتتاحية وحدّ التنبيه. يتطلب تغيير المخزون تسجيل حركة حتى يبقى السجل مفهومًا.' },
  { icon: Boxes, title: 'حركة المخزون', text: 'أدخل التوريد مع المورد والمرجع عند الحاجة، وسجّل التلف أو الفقدان بسبب واضح. يحتفظ النظام بحركات المخزون كسجل تاريخي.' },
  { icon: CreditCard, title: 'تسجيل المبيعات', text: 'أنشئ عملية بيع بمنتجاتها وكمياتها وطريقة الدفع. يتحقق الخادم من الكمية المتاحة ويحفظ بيانات البيع كسجل غير قابل للتعديل من واجهة التطبيق.' },
  { icon: ClipboardList, title: 'إدارة الطلبات', text: 'تابع حالات الطلب من الجديد إلى التأكيد والتحضير والجاهزية. أضف الأسعار قبل التسليم؛ عند التسليم تُسجّل عملية البيع ويُخصم المخزون.' },
  { icon: ReceiptText, title: 'دفتر ديون يدوي', text: 'سجّل المبلغ المستحق والدفعات والموعد، مع رصيد متبقٍ واضح. هذا دفتر يدوي وليس ربطًا بنظام تحصيل أو حسابات مصرفية.' },
  { icon: ChartNoAxesCombined, title: 'مؤشرات وتقارير', text: 'شاهد ملخص اليوم والمنتجات منخفضة المخزون. تتيح الخطط المناسبة ملخصات مالية حسب التاريخ، وليست تقارير ضريبية أو محاسبية معتمدة.' },
  { icon: UsersRound, title: 'حسابات الفريق', text: 'أضف موظفًا برقم هاتف ورمز دخول مؤقت من ستة أرقام، ثم حدّد أقسام العمل المسموح بها. يمكنك إيقاف الحساب أو تدوير الرمز.' },
  { icon: Store, title: 'المتاجر والخطط', text: 'إدارة أكثر من متجر متاحة في الخطة المميزة. يتغير عدد المنتجات والموظفين والميزات حسب الخطة، وتُطبّق الحدود على الخادم.' },
  { icon: ShieldCheck, title: 'خصوصية الصلاحيات', text: 'لكل جلسة متجر نشط وصلاحيات مشتقة من الحساب والخطة. لا يعتمد الخادم على معرّف متجر يرسله المتصفح.' },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="content-page">
        <div className="container">
          <header className="content-heading">
            <span className="eyebrow"><span className="eyebrow-dot" /> ما الذي يساعدك عليه متجري؟</span>
            <h1>أدوات المتجر اليومية، مترابطة في مكان واحد</h1>
            <p>تعرّف على طريقة عمل المنتجات والمخزون والبيع والطلبات قبل إنشاء حساب. صُمّمت الواجهة بالعربية وللاستخدام اليومي في المتاجر التونسية.</p>
          </header>
          <div className="feature-grid">
            {capabilities.map(({ icon: Icon, title, text }) => (
              <article className="feature-card" key={title}>
                <span className="feature-icon"><Icon aria-hidden="true" /></span>
                <h2>{title}</h2>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section section-soft">
        <div className="container split-section">
          <div className="split-copy">
            <span className="eyebrow"><span className="eyebrow-dot" /> مفيد أن تعرف</span>
            <h2>المزايا واضحة، وحدودها أيضًا.</h2>
            <p>متجري يركّز على عمليات المتجر الداخلية. لا يصدر فواتير جبائية معتمدة، ولا يجمع المدفوعات الإلكترونية، ولا يستبدل إجراءات المحاسبة والمراجعة الرسمية.</p>
            <ul className="check-list">
              <li><Barcode aria-hidden="true" /> يمكن استخدام الباركود للعثور على منتج مسجّل.</li>
              <li><ShieldCheck aria-hidden="true" /> الأسعار والكميات والتحققات الأساسية تُراجع على الخادم.</li>
              <li><ReceiptText aria-hidden="true" /> هامش الربح في التقرير لا يشمل ربح التوصيل.</li>
            </ul>
          </div>
          <div className="process-card">
            <div className="card-heading"><div><h2>رحلة عملية البيع</h2><p>من إضافة البضاعة إلى مراجعة الحركة</p></div><ClipboardList color="#445b7a" /></div>
            <div className="process-row"><span className="process-number">١</span><span><strong>تحديث المنتج والمخزون</strong><small>سعر شراء ورصيد متوفر</small></span></div>
            <div className="process-row"><span className="process-number">٢</span><span><strong>تسجيل المنتج المباع</strong><small>الكمية، السعر وطريقة الدفع</small></span></div>
            <div className="process-row"><span className="process-number">٣</span><span><strong>مراجعة ملخص اليوم</strong><small>إيراد، عدد عمليات وتنبيهات</small></span></div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container"><div className="cta-panel"><div><h2>ابدأ بالأساسيات التي يحتاجها متجرك.</h2><p>التسجيل يتضمن فترة تجريبية مدتها 14 يومًا. راجع حدود كل خطة قبل طلب التجديد.</p></div><Link className="button" href="/register">إنشاء حساب <ArrowLeft aria-hidden="true" /></Link></div></div>
      </section>
    </>
  );
}
