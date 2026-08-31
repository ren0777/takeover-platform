import type { Metadata } from 'next';
import { buildPageTitle } from '@/lib/site';

/**
 * Metadata for capability landings and management surfaces.
 *
 * These pages are reachable only with a single-use link or an active session,
 * so they are never indexed and never carry a canonical URL — publishing one
 * would invite exactly the crawling this is meant to prevent.
 */
export function privatePageMetadata(title: string): Metadata {
  return {
    title: buildPageTitle(title),
    robots: { index: false, follow: false },
  };
}

type PublicPageInput = {
  title: string;
  description: string;
  /** Root-relative canonical path, e.g. `/territories`. */
  path: string;
};

/**
 * Metadata for indexable public pages.
 *
 * Not yet used: no public product page exists until Phase 2 territory data
 * lands. It is defined now so public routes cannot accidentally ship without
 * a canonical URL or social card.
 */
export function publicPageMetadata({ title, description, path }: PublicPageInput): Metadata {
  const brandedTitle = buildPageTitle(title);

  return {
    title: brandedTitle,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: brandedTitle,
      description,
      url: path,
      siteName: 'TakeOver',
      type: 'website',
    },
  };
}
