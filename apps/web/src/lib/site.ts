export const SITE = {
  name: 'TakeOver',
  tagline: 'Own a piece of the internet.',
} as const;

export function buildPageTitle(pageName?: string): string {
  const normalizedPageName = pageName?.trim();
  if (normalizedPageName === undefined || normalizedPageName.length === 0) {
    return `${SITE.name} — ${SITE.tagline}`;
  }

  return `${normalizedPageName} — ${SITE.name}`;
}
