import { createHmac } from 'node:crypto';

export type SecurityDigestDomain = 'csrf' | 'ip' | 'link' | 'rate-key' | 'session';

export function hashSecurityScope(
  key: Uint8Array,
  domain: SecurityDigestDomain,
  ...parts: string[]
): Uint8Array {
  const hmac = createHmac('sha256', key);
  hmac.update(`takeover:${domain}:v1\0`);
  for (const part of parts) {
    hmac.update(part);
    hmac.update('\0');
  }
  return new Uint8Array(hmac.digest());
}
