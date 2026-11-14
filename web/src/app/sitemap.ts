import type { MetadataRoute } from 'next';

const pages: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/features', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/guides', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/guides/gestion-stock', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/guides/logiciel-caisse', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl || process.env.NEXT_PUBLIC_INDEXING !== 'true') return [];
  const base = new URL(siteUrl);
  return pages.map((page) => ({
    url: new URL(page.path, base).toString(),
    lastModified: new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
