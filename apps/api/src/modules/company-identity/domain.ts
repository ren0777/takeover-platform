import { isIP } from 'node:net';
import { z } from 'zod';
import {
  accessRequestStatusSchema,
  territoryExternalRefSchema,
  type AccessRequestStatus,
} from '@takeover/shared';

function isReservedIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  const [first = 0, second = 0] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && [0, 2, 168].includes(second)) ||
    (first === 198 && (second === 18 || second === 19 || second === 51)) ||
    (first === 203 && second === 0) ||
    first >= 224
  );
}

function isReservedIp(hostname: string): boolean {
  const bareHostname = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const version = isIP(bareHostname);
  if (version === 4) return isReservedIpv4(bareHostname);
  if (version !== 6) return false;
  return (
    bareHostname === '::' ||
    bareHostname === '::1' ||
    bareHostname.startsWith('fc') ||
    bareHostname.startsWith('fd') ||
    /^fe[89ab]/.test(bareHostname) ||
    bareHostname.startsWith('2001:db8:')
  );
}

export function normalizeCompanyWebsite(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'https:') throw new Error('Company website must use HTTPS');
  if (url.username !== '' || url.password !== '')
    throw new Error('Company website cannot contain credentials');
  if (url.search !== '' || url.hash !== '')
    throw new Error('Company website cannot contain a query or fragment');

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Company website must be public');
  }
  if (isReservedIp(hostname)) throw new Error('Company website must not use a reserved address');

  url.hostname = hostname;
  if (url.port === '443') url.port = '';
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

export function normalizeContactEmail(input: string): string {
  const normalized = input.trim().normalize('NFC');
  const separator = normalized.lastIndexOf('@');
  if (separator <= 0) throw new Error('Contact email is invalid');
  const value = `${normalized.slice(0, separator)}@${normalized.slice(separator + 1).toLowerCase()}`;
  return z.email().parse(value);
}

export function normalizeCompanyName(input: string): {
  displayName: string;
  normalizedName: string;
} {
  const displayName = input.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (displayName.length < 2 || displayName.length > 120)
    throw new Error('Company name is invalid');
  return { displayName, normalizedName: displayName.toLocaleLowerCase('en-US') };
}

export function validateTerritoryExternalRef(input: string): string {
  return territoryExternalRefSchema.parse(input);
}

const TERMINAL_ACCESS_STATES = new Set<AccessRequestStatus>([
  'approved',
  'rejected',
  'expired',
  'cancelled',
]);

export function assertAccessRequestTransition(
  current: AccessRequestStatus,
  next: AccessRequestStatus,
): void {
  accessRequestStatusSchema.parse(current);
  accessRequestStatusSchema.parse(next);
  if (current !== 'pending' || !TERMINAL_ACCESS_STATES.has(next)) {
    throw new Error(`Illegal company access transition from ${current} to ${next}`);
  }
}

export function hasExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export type ManualRecoveryResolution = {
  operatorReference: string;
  reason: string;
  status: 'approved' | 'rejected';
};

export interface ManualRecoveryOperatorPort {
  resolve(requestId: string): Promise<ManualRecoveryResolution>;
}

export class ManualRecoveryUnavailableError extends Error {
  readonly code = 'MANUAL_RECOVERY_UNAVAILABLE';
  readonly statusCode = 503;

  constructor() {
    super('Manual recovery execution is not available');
    this.name = 'ManualRecoveryUnavailableError';
  }
}

export const unavailableManualRecoveryOperator: ManualRecoveryOperatorPort = {
  async resolve(): Promise<never> {
    throw new ManualRecoveryUnavailableError();
  },
};
