import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpLeft, Boxes, ClipboardCheck, Store } from 'lucide-react';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata(
  'دليل إدارة المتاجر والمخزون والبيع',
  'أدلة عربية عملية لأصحاب المتاجر في تونس: تنظيم المخزون، تسجيل حركة البضاعة، واختيار برنامج لإدارة المتجر.',
  '/guides',
);

const guides = [
  {
    href: '/guides/gestion-stock',
    icon: Boxes,
    tag: 'المخزون',
    title: 'كيف تنظّم مخزون متجرك خطوة بخطوة؟',
    text: 'طريقة عملية لبدء سجل أصناف موثوق، وتسجيل التوريد والتالف ومراجعة الأصناف التي تحتاج إلى إعادة طلب.',
    read: '٦ دقائق',
  },
  {
    href: '/guides/logiciel-caisse',
    icon: Store,
    tag: 'اختيار الأدوات',
    title: 'ما الذي تبحث عنه في برنامج إدارة متجر؟',
    text: 'قائمة تحقق تساعدك على مقارنة حلول البيع والمخزون والصلاحيات والتكاليف قبل اعتماد أداة جديدة.',
    read: '٥ دقائق',
  },
  {
    href: '/features',
    icon: ClipboardCheck,
    tag: 'متجري',
    title: 'كيف تعمل دورة الطلب داخل متجري؟',
    text: 'تعرّف على الحالات التي يمر بها الطلب، ومتى يُخصم المخزون ومتى تُسجّل المبيعات.',
    read: 'دليل المنتج',
  },
];

export default function GuidesPage() {
  return (
    <section className="content-page">
      <div className="container">
        <header className="content-heading">
          <span className="eyebrow"><span className="eyebrow-dot" /> معرفة عملية للتاجر</span>
          <h1>دليل إدارة المتجر</h1>
          <p>مقالات واضحة عن تنظيم المخزون، تسجيل حركة البيع، واختيار الأدوات التي تناسب احتياجات متجرك اليوم.</p>
        </header>
        <div className="guide-grid">
          {guides.map(({ href, icon: Icon, tag, title, text, read }) => (
            <article className="guide-card" key={href}>
              <div className="guide-card-top"><span className="feature-icon"><Icon aria-hidden="true" /></span><span className="badge badge-brand">{tag}</span></div>
              <h2>{title}</h2>
              <p>{text}</p>
              <div className="guide-card-bottom"><span>{read}</span><Link className="feature-link" href={href}>اقرأ الدليل <ArrowUpLeft aria-hidden="true" /></Link></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
