import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/noto-sans-arabic/index.css';
import '@fontsource-variable/inter/index.css';
import './globals.css';
import { Providers } from './providers';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const indexingEnabled = process.env.NEXT_PUBLIC_INDEXING === 'true' && Boolean(siteUrl);

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  applicationName: 'متجري',
  title: {
    default: 'متجري | إدارة عملية لمتجرك في تونس',
    template: '%s | متجري',
  },
  description:
    'متجري مساحة عربية لإدارة المنتجات والمخزون والمبيعات والطلبات في المتاجر التونسية، مع تقارير واضحة وصلاحيات تناسب صاحب المتجر وفريقه.',
  category: 'business',
  alternates: { languages: { 'ar-TN': '/' } },
  openGraph: {
    type: 'website',
    locale: 'ar_TN',
    siteName: 'متجري',
    title: 'متجري | إدارة عملية لمتجرك في تونس',
    description: 'نظّم المنتجات والمخزون والمبيعات والطلبات في مساحة عربية صُمّمت للمتاجر التونسية.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'متجري | إدارة عملية لمتجرك في تونس',
    description: 'نظّم المنتجات والمخزون والمبيعات والطلبات في مساحة عربية للمتاجر التونسية.',
  },
  robots: indexingEnabled
    ? { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } }
    : { index: false, follow: false, noarchive: true },
  referrer: 'strict-origin-when-cross-origin',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f8fafc',
  colorScheme: 'light',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar-TN" dir="rtl" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
