import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl || process.env.NEXT_PUBLIC_INDEXING !== 'true') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/api', '/login', '/register'],
    },
    sitemap: new URL('/sitemap.xml', siteUrl).toString(),
  };
}
