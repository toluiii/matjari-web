import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Clock3, Phone, ShieldCheck } from 'lucide-react';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata(
  'تواصل مع فريق متجري في تونس',
  'تواصل هاتفيًا مع فريق متجري للاستفسار عن الحساب أو الباقات أو استخدام المنتجات والمخزون والطلبات.',
  '/contact',
);

export default function ContactPage() {
  return (
    <section className="content-page">
      <div className="container">
        <header className="content-heading">
          <span className="eyebrow"><span className="eyebrow-dot" /> نحن هنا للمساعدة</span>
          <h1>تواصل مع متجري</h1>
          <p>للاستفسارات المتعلقة بالحساب أو طريقة استخدام الخدمة، اتصل بأحد أرقام الدعم أدناه. لا تشارك كلمة المرور أو رمز دخول الموظف.</p>
        </header>
        <div className="contact-grid">
          <article className="contact-card">
            <span className="contact-icon"><Phone aria-hidden="true" /></span>
            <h2>اتصل بفريق الدعم</h2>
            <p>استخدم الرقم الأنسب لك للاستفسار عن الحساب أو الباقة أو استخدام الخدمة.</p>
            <a className="contact-number" href="tel:+21625739896" dir="ltr">+216 25 739 896</a>
            <a className="contact-number" href="tel:+21658923247" dir="ltr">+216 58 923 247</a>
          </article>
          <article className="contact-card contact-card-muted">
            <span className="contact-icon"><Clock3 aria-hidden="true" /></span>
            <h2>قبل الاتصال</h2>
            <p>جهّز رقم الهاتف المرتبط بالحساب ووصفًا مختصرًا للمشكلة. لا ترسل كلمات مرور، رموز دخول، أو تفاصيل دفع حساسة.</p>
            <div className="contact-help"><ShieldCheck aria-hidden="true" /> لن يطلب منك فريق متجري كلمة مرورك أو رمز الموظف المؤقت.</div>
          </article>
        </div>
        <div className="contact-note">لا يتضمن الإصدار الحالي نموذج تواصل أو تحصيلًا إلكترونيًا. طلب تجديد الخطة داخل التطبيق يسجل طلب تواصل فقط، ولا يُعدّ تأكيدًا للدفع.</div>
        <div className="contact-actions"><Link className="button button-secondary" href="/guides">زيارة دليل الاستخدام</Link><Link className="button button-primary" href="/register">إنشاء حساب <ArrowLeft aria-hidden="true" /></Link></div>
      </div>
    </section>
  );
}
