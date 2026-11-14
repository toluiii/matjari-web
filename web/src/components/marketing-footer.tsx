import Link from 'next/link';
import { ArrowUpLeft } from 'lucide-react';
import { Brand } from '@/components/brand';

export function MarketingFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand-column">
            <Brand />
            <p className="footer-about">
              أدوات يومية تساعد صاحب المتجر وفريقه على تنظيم المنتجات والمخزون والبيع، بواجهة عربية تراعي احتياجات المتاجر في تونس.
            </p>
          </div>
          <div className="footer-column">
            <h3>متجري</h3>
            <Link href="/features">المزايا</Link>
            <Link href="/pricing">الباقات والحدود</Link>
            <Link href="/about">عن الخدمة</Link>
            <Link href="/contact">تواصل معنا</Link>
          </div>
          <div className="footer-column">
            <h3>دليل الاستخدام</h3>
            <Link href="/guides">مركز الأدلة</Link>
            <Link href="/guides/gestion-stock">تنظيم مخزون المتجر</Link>
            <Link href="/guides/logiciel-caisse">اختيار برنامج إدارة متجر</Link>
            <Link href="/login">الدخول إلى مساحة العمل</Link>
          </div>
          <div className="footer-column">
            <h3>معلومات مهمة</h3>
            <Link href="/privacy">الخصوصية</Link>
            <Link href="/terms">شروط الاستخدام</Link>
            <span>الدعم في تونس</span>
            <a href="tel:+21625739896" dir="ltr">+216 25 739 896</a>
            <a href="tel:+21658923247" dir="ltr">+216 58 923 247</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} متجري. جميع الحقوق محفوظة.</span>
          <Link href="#top">العودة إلى الأعلى <ArrowUpLeft size={14} aria-hidden="true" /></Link>
        </div>
      </div>
    </footer>
  );
}
