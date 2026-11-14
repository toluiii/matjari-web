import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const indexingEnabled = process.env.NEXT_PUBLIC_INDEXING === 'true' && Boolean(siteUrl);

export function pageMetadata(title: string, description: string, pathname: string): Metadata {
  const canonical = siteUrl ? new URL(pathname, siteUrl) : undefined;
  return {
    title,
    description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      type: 'website',
      locale: 'ar_TN',
      siteName: 'متجري',
      title: `${title} | متجري`,
      description,
      url: canonical,
    },
    robots: indexingEnabled
      ? { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } }
      : { index: false, follow: false, noarchive: true },
  };
}
