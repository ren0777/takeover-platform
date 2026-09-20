import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/', disallow: [
    '/api/', '/verify', '/manage', '/access-review', '/takeover/', '/claim',
  ] }] };
}
