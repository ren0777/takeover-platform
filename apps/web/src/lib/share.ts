export function publicShareUrl(origin: string, path: string): string {
  if (!/^\/(territory|company)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) throw new Error('Only canonical public pages can be shared');
  const base = new URL(origin);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Invalid public origin');
  return new URL(path, base.origin).href;
}
