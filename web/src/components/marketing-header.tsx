'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Brand } from '@/components/brand';

const links = [
  { href: '/features', label: 'المزايا' },
  { href: '/pricing', label: 'الباقات' },
  { href: '/guides', label: 'دليل المتجر' },
  { href: '/about', label: 'عن متجري' },
  { href: '/contact', label: 'تواصل معنا' },
];

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Brand />
        <nav className="site-nav" aria-label="التنقل الرئيسي">
          {links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
        </nav>
        <div className="site-actions">
          <Link className="button button-secondary button-sm" href="/login">تسجيل الدخول</Link>
          <Link className="button button-primary button-sm" href="/register">ابدأ مجانًا</Link>
        </div>
        <button
          className="mobile-menu-button"
          type="button"
          aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>
      <div className="mobile-menu" data-open={open}>
        <div className="container">
          <nav aria-label="التنقل على الهاتف">
            {links.map((link) => <Link href={link.href} key={link.href} onClick={close}>{link.label}</Link>)}
          </nav>
          <div className="mobile-actions">
            <Link className="button button-secondary" href="/login" onClick={close}>تسجيل الدخول</Link>
            <Link className="button button-primary" href="/register" onClick={close}>ابدأ مجانًا</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
