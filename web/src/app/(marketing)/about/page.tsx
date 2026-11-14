import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Compass, Handshake, MapPin, ShieldCheck } from 'lucide-react';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata(
  'عن متجري، مساحة لإدارة المتاجر التونسية',
  'متجري مشروع برمجيات عربي يركز على تنظيم العمليات اليومية للمتاجر في تونس: المنتجات والمخزون والمبيعات والطلبات.',
  '/about',
);

export default function AboutPage() {
  return (
    <>
      <section className="content-page">
        <div className="container-narrow">
          <header className="content-heading">
            <span className="eyebrow"><span className="eyebrow-dot" /> عن متجري</span>
            <h1>أدوات عملية ليبقى شغل المتجر واضحًا</h1>
            <p>متجري مساحة ويب عربية تساعد صاحب المتجر وفريقه على متابعة المنتجات والمخزون والمبيعات والطلبات اليومية.</p>
          </header>
          <div className="prose">
            <p>بدأت فكرة متجري من احتياج بسيط: أن تكون تفاصيل الصنف وحركته وبيعه في مكان يسهل الوصول إليه. نركّز على جعل إجراءات اليوم مفهومة، مع مراعاة الدينار التونسي والتوقيت المحلي والواجهة العربية.</p>
            <h2>ما الذي نريد تحسينه؟</h2>
            <div className="about-values">
              <article className="about-value"><span className="feature-icon"><Compass aria-hidden="true" /></span><h3>وضوح العمل</h3><p>كل توريد أو بيع أو خسارة له حركة يمكن الرجوع إليها.</p></article>
              <article className="about-value"><span className="feature-icon"><MapPin aria-hidden="true" /></span><h3>ملاءمة محلية</h3><p>واجهة عربية، عملة الدينار التونسي، وتاريخ بتوقيت تونس.</p></article>
              <article className="about-value"><span className="feature-icon"><ShieldCheck aria-hidden="true" /></span><h3>صلاحيات مسؤولة</h3><p>المتجر النشط والخطة وصلاحيات الحساب تُراجع في الخادم.</p></article>
              <article className="about-value"><span className="feature-icon"><Handshake aria-hidden="true" /></span><h3>معلومات صريحة</h3><p>لا ندّعي تحصيل المدفوعات أو إصدار فواتير جبائية معتمدة.</p></article>
            </div>
            <h2>حدود الخدمة جزء من تصميمها</h2>
            <p>متجري موجّه لتنظيم البيانات التشغيلية، وليس نظامًا محاسبيًا معتمدًا أو أداة إقرارات ضريبية. طلب التجديد يسجل رغبتك في التواصل ولا يسحب أي مبلغ. نوضح هذه الحدود حتى تتمكن من تقييم الخدمة على حقيقتها.</p>
            <div className="prose-callout">للاطلاع على ما يشمله كل اشتراك، راجع <Link href="/pricing">مقارنة الباقات</Link>. لأسئلة الحساب أو المزايا، تواصل عبر <Link href="/contact">صفحة التواصل</Link>.</div>
          </div>
        </div>
      </section>
      <section className="section section-soft"><div className="container"><div className="cta-panel"><div><h2>جرّب الأدوات على سير عملك.</h2><p>ابدأ بفترة تجريبية، وأضف بيانات الاختبار أو بيانات متجرك بعد مراجعة سياسة الخصوصية.</p></div><Link className="button" href="/register">إنشاء حساب <ArrowLeft aria-hidden="true" /></Link></div></div></section>
    </>
  );
}
