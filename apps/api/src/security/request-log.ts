/** Capability URLs and arbitrary query parameters must never enter access logs. */
export function safeRequestUrl(url: string): string {
  return url.split('?')[0]!.replace(/(\/api\/takeover-status\/)[^/]+/, '$1[redacted]');
}
