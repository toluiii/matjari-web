import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpLeft,
  BarChart3,
  Boxes,
  Check,
  CheckCircle2,
  Clock3,
  FileChartColumnIncreasing,
  LockKeyhole,
  Package,
  ReceiptText,
  ShoppingBag,
  Store,
  UsersRound,
  Workflow,
} from 'lucide-react';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata(
  'برنامج إدارة متجر في تونس للمنتجات والمخزون والمبيعات',
  'نظّم منتجات متجرك ومخزونه ومبيعاته وطلباته في مساحة عربية واضحة. متجري برنامج إدارة متجر للمتاجر التونسية مع صلاحيات للفريق وتقارير عملية.',
  '/',
);

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const structuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'متجري',
    description: 'مساحة عربية لإدارة المنتجات والمخزون والبيع في المتاجر التونسية.',
    url: siteUrl,
    areaServed: { '@type': 'Country', name: 'Tunisia' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'متجري',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'ar-TN',
    description: 'أدوات ويب لإدارة المنتجات والمخزون والبيع والطلبات في المتاجر التونسية.',
    audience: { '@type': 'BusinessAudience', 'audienceType': 'أصحاب المتاجر وفرق البيع في تونس' },
    url: siteUrl,
    featureList: ['إدارة المنتجات', 'متابعة المخزون', 'تسجيل المبيعات', 'متابعة الطلبات', 'صلاحيات الفريق'],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'هل متجري مناسب للمتاجر الصغيرة؟',
        acceptedAnswer: { '@type': 'Answer', text: 'نعم. يبدأ الحساب بفترة تجريبية مدتها 14 يومًا، وتختلف حدود المنتجات والميزات بحسب الخطة.' },
      },
      {
        '@type': 'Question',
        name: 'هل يمكنني متابعة المخزون والمبيعات من مكان واحد؟',
        acceptedAnswer: { '@type': 'Answer', text: 'يمكنك إدارة المنتجات وحركات التوريد والتالف، وتسجيل المبيعات ومراجعة ملخص اليوم في مساحة المتجر.' },
      },
      {
        '@type': 'Question',
        name: 'هل تجمع متجري المدفوعات إلكترونيًا؟',
        acceptedAnswer: { '@type': 'Answer', text: 'لا. طلب تجديد الخطة يسجل طلب تواصل فقط؛ لا تتم معالجة أو تحصيل أي دفعة داخل التطبيق.' },
      },
    ],
  },
];

const features = [
  { icon: Package, title: 'كتالوج المنتجات', text: 'رتّب الأصناف بالاسم والتصنيف والباركود، وتابع رصيد كل منتج وحدّ التنبيه المناسب.' },
  { icon: Boxes, title: 'مخزون أوضح', text: 'سجّل التوريد والتالف والفقدان كحركات منفصلة، مع بقاء تاريخ التغييرات قابلًا للمراجعة.' },
  { icon: ShoppingBag, title: 'تسجيل المبيعات', text: 'سجّل عملية البيع وطريقة الدفع والمنتجات والكميات، مع تحديث المخزون بصورة مترابطة.' },
  { icon: Workflow, title: 'مسار الطلبات', text: 'تابع حالة الطلب خطوة بخطوة، وحدّد الأسعار قبل التسليم حتى تُسجّل عملية البيع على نحو صحيح.' },
  { icon: UsersRound, title: 'عمل بصلاحيات واضحة', text: 'أضف الموظفين برموز دخول لمرة واحدة، وامنح كل حساب صلاحيات تناسب مهامه اليومية.' },
  { icon: FileChartColumnIncreasing, title: 'مؤشرات عملية', text: 'راجع ملخص المبيعات اليومي والتنبيهات، وافتح التقارير المالية عند توفرها في الخطة.' },
];

const faq = [
  {
    question: 'هل متجري مخصص للمتاجر في تونس؟',
    answer: 'نعم، صُمّمت الواجهة بالعربية وتعرض المبالغ بالدينار التونسي مع دقة المليمات والتواريخ بتوقيت تونس.',
  },
  {
    question: 'كيف أبدأ؟',
    answer: 'أنشئ حساب صاحب المتجر، ثم أضف المنتجات وأرصدتها. التسجيل يفعّل فترة تجريبية مدتها 14 يومًا؛ تفاصيل الميزات والحدود موضحة في صفحة الباقات.',
  },
  {
    question: 'هل يقوم التطبيق بتحصيل رسوم الاشتراك؟',
    answer: 'لا. يمكنك إرسال طلب تجديد ليتم التواصل معك، ولا تُحصّل أي دفعة داخل التطبيق. لا تُرسل بيانات بطاقتك أو كلمات مرورك عبر الهاتف.',
  },
];

function HeroPreview() {
  return (
    <div className="hero-visual" aria-label="معاينة توضيحية لواجهة متجري">
      <div className="preview-orbit" aria-hidden="true" />
      <div className="hero-float hero-float-one"><Boxes aria-hidden="true" /> تنبيه للمخزون المنخفض</div>
      <div className="hero-float hero-float-two"><CheckCircle2 aria-hidden="true" /> مساحة عمل مرتبة لفريقك</div>
      <div className="preview-app">
        <div className="preview-bar">
          <div className="preview-brand"><span className="preview-brand-mark"><Store /></span><span>مساحة متجرك</span></div>
          <span className="preview-user" aria-hidden="true" />
        </div>
        <p className="preview-label">ملخص اليوم</p>
        <div className="preview-value">— د.ت</div>
        <div className="preview-cards" aria-hidden="true">
          <div className="preview-stat"><span>المبيعات</span><i /></div>
          <div className="preview-stat"><span>الطلبات</span><i /></div>
          <div className="preview-stat"><span>المنتجات</span><i /></div>
        </div>
        <div className="preview-chart" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /></div>
        <p className="preview-caption">معاينة توضيحية — لا تعرض بيانات متجر حقيقية</p>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, text }: (typeof features)[number]) {
  return (
    <article className="feature-card">
      <span className="feature-icon"><Icon aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{text}</p>
      <Link className="feature-link" href="/features">اكتشف المزايا <ArrowUpLeft aria-hidden="true" /></Link>
    </article>
  );
}

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow"><span className="eyebrow-dot" /> إدارة المتجر، ببساطة أكثر</span>
            <h1>كل تفاصيل متجرك، <span>في مساحة واحدة.</span></h1>
            <p>
              من المنتج الذي تبيعه إلى المخزون والطلب والمبيعات اليومية؛ رتّب شغل متجرك بأدوات عربية صُمّمت لتناسب يوم التاجر في تونس.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/register">أنشئ حساب متجرك <ArrowLeft aria-hidden="true" /></Link>
              <Link className="button button-secondary" href="/features">تعرّف على المزايا</Link>
            </div>
            <div className="hero-note"><Clock3 aria-hidden="true" /> حساب جديد مع فترة تجريبية لمدة 14 يومًا</div>
          </div>
          <HeroPreview />
        </div>
      </section>

      <div className="trust-row"><LockKeyhole aria-hidden="true" /><span>جلسات دخول آمنة، صلاحيات حسب الدور، وسجلات مالية لا تُعدّل بعد تسجيلها.</span></div>

      <section className="section" aria-labelledby="features-heading">
        <div className="container">
          <div className="section-heading">
            <span className="eyebrow"><span className="eyebrow-dot" /> أدوات يومية لمتجرك</span>
            <h2 id="features-heading">المهم في إدارة المتجر، من غير تعقيد</h2>
            <p>نظرة واضحة على المنتجات والمخزون والحركة اليومية تساعدك أنت وفريقك على إنجاز العمل بثقة.</p>
          </div>
          <div className="feature-grid">{features.map((feature) => <FeatureCard key={feature.title} {...feature} />)}</div>
        </div>
      </section>

      <section className="section section-soft">
        <div className="container split-section">
          <div className="split-copy">
            <span className="eyebrow"><span className="eyebrow-dot" /> تفاصيل أقرب إلى الواقع</span>
            <h2>قرارات أفضل تبدأ من سجلّ واضح.</h2>
            <p>تحديث رصيد المخزون عند حدوث الحركة، وتسجيل البيع وقت حدوثه، يساعد على أن تبقى الصورة أقرب لما يجري فعلًا في المتجر.</p>
            <ul className="check-list">
              <li><Check aria-hidden="true" /> سجّل توريد البضاعة وتكلفتها لمتابعة متوسط الكلفة.</li>
              <li><Check aria-hidden="true" /> راجع تنبيه الأصناف التي وصلت إلى حدّها الأدنى.</li>
              <li><Check aria-hidden="true" /> تابع الطلب من استلامه حتى تسليمه أو إلغائه.</li>
              <li><Check aria-hidden="true" /> اعرف ما يستطيع كل موظف الوصول إليه قبل منحه الصلاحية.</li>
            </ul>
          </div>
          <div className="process-card" aria-label="خطوات تشغيل المتجر">
            <div className="process-row"><span className="process-number">١</span><span><strong>أضف المنتجات</strong><small>اسم، تصنيف، باركود ورصيد افتتاحي</small></span><CheckCircle2 className="process-check" size={19} /></div>
            <div className="process-row"><span className="process-number">٢</span><span><strong>حدّث حركة المخزون</strong><small>توريد، تلف أو فقدان في سجل واحد</small></span><CheckCircle2 className="process-check" size={19} /></div>
            <div className="process-row"><span className="process-number">٣</span><span><strong>سجّل البيع والطلب</strong><small>متابعة عمليات اليوم خطوة بخطوة</small></span><CheckCircle2 className="process-check" size={19} /></div>
            <div className="process-row"><span className="process-number">٤</span><span><strong>راجع مؤشراتك</strong><small>ملخص يومي وتنبيهات للمراجعة</small></span><BarChart3 className="process-check" size={19} /></div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="faq-heading">
        <div className="container">
          <div className="section-heading">
            <span className="eyebrow"><span className="eyebrow-dot" /> أسئلة قبل البداية</span>
            <h2 id="faq-heading">أسئلة شائعة عن متجري</h2>
            <p>معلومات مباشرة عن التسجيل والخطة وما الذي يفعله التطبيق وما لا يفعله.</p>
          </div>
          <div className="faq-list">
            {faq.map((item) => <details className="faq-item" key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
          </div>
        </div>
      </section>

      <section className="section section-soft">
        <div className="container">
          <div className="cta-panel">
            <div>
              <h2>ابدأ بترتيب تفاصيل متجرك اليوم.</h2>
              <p>أنشئ حساب صاحب المتجر، أضف منتجاتك، وتعرّف على الأدوات التي تناسب سير عملك.</p>
            </div>
            <Link className="button" href="/register">ابدأ فترة التجربة <ArrowLeft aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <section className="section" aria-label="روابط دليل المتجر">
        <div className="container split-section">
          <div className="split-copy">
            <span className="eyebrow"><span className="eyebrow-dot" /> دليل عربي لأصحاب المتاجر</span>
            <h2>معلومة عملية تساعدك في شغل اليوم.</h2>
            <p>اقرأ أدلة قصيرة حول تنظيم المخزون واختيار طريقة مناسبة لإدارة عمليات متجرك.</p>
            <Link className="button button-secondary" href="/guides">زيارة مركز الأدلة <ArrowUpLeft aria-hidden="true" /></Link>
          </div>
          <div className="process-card">
            <div className="process-row"><span className="process-number"><Boxes size={18} /></span><span><strong>كيف تنظّم مخزون متجرك؟</strong><small>خطوات عملية لتقليل فروقات الجرد</small></span><ArrowLeft size={17} /></div>
            <div className="process-row"><span className="process-number"><ReceiptText size={18} /></span><span><strong>كيف تختار برنامج إدارة متجر؟</strong><small>أسئلة تساعدك على مقارنة الأدوات</small></span><ArrowLeft size={17} /></div>
          </div>
        </div>
      </section>
    </>
  );
}
