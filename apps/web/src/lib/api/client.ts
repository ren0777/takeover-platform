import { apiErrorSchema, ERROR_CODES } from '@takeover/shared';
import { resolveRequestUrl } from '@/lib/api/origin';

/**
 * Structural view of a schema's `safeParse`.
 *
 * Typed structurally so `apps/web` does not take a direct dependency on zod;
 * the schemas themselves always come from `@takeover/shared`.
 */
export type ResponseSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

/**
 * Lifts an item schema to an array schema without importing zod.
 *
 * Used where the contract publishes an item shape but no list wrapper.
 */
export function arrayOf<T>(schema: ResponseSchema<T>): ResponseSchema<T[]> {
  return {
    safeParse(value: unknown) {
      if (!Array.isArray(value)) return { success: false };

      const items: T[] = [];
      for (const entry of value) {
        const parsed = schema.safeParse(entry);
        if (!parsed.success) return { success: false };
        items.push(parsed.data);
      }

      return { success: true, data: items };
    },
  };
}

/** Readable (non-HttpOnly) CSRF cookie set alongside the HttpOnly session cookie. */
const CSRF_COOKIE_NAME = 'takeover_management_csrf';

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(init: {
    code: string;
    status: number;
    message: string;
    requestId?: string;
    retryAfterSeconds?: number;
  }) {
    super(init.message);
    this.name = 'ApiRequestError';
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

/**
 * Reads the CSRF token the API set as a readable cookie. Mutations must echo it
 * in `x-csrf-token`; the API rejects the request when it does not match.
 */
export function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;

  for (const entry of document.cookie.split(';')) {
    const [name, ...rest] = entry.trim().split('=');
    if (name === CSRF_COOKIE_NAME) {
      const value = rest.join('=');
      return value.length > 0 ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

type RequestOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  /** Send the CSRF header. Required by every cookie-authenticated mutation. */
  withCsrf?: boolean;
};

function parseRetryAfter(header: string | null): number | undefined {
  if (header === null) return undefined;
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/**
 * Calls the API through the same-origin `/api` proxy.
 *
 * Never accepts or returns raw token material beyond the single exchange body,
 * and never logs request bodies.
 */
async function executeRaw(options: RequestOptions): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  if (options.withCsrf === true) {
    const csrfToken = readCsrfToken();
    if (csrfToken === null) {
      throw new ApiRequestError({
        code: ERROR_CODES.AUTHORIZATION_REQUIRED,
        status: 401,
        message: 'No management session is active in this browser.',
      });
    }
    headers['x-csrf-token'] = csrfToken;
  }

  // Relative in the browser, absolute on the server. See `resolveRequestUrl`.
  const url = resolveRequestUrl(options.path);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      credentials: 'same-origin',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new ApiRequestError({
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      status: 0,
      message: 'The service could not be reached.',
    });
  }

  if (response.status === 204) return undefined;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiRequestError({
      code: response.ok ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.SERVICE_UNAVAILABLE,
      status: response.status,
      message: 'The service returned an unreadable response.',
    });
  }

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));

    if (parsed.success) {
      throw new ApiRequestError({
        code: parsed.data.error.code,
        status: response.status,
        message: parsed.data.error.message,
        ...(parsed.data.error.requestId === undefined
          ? {}
          : { requestId: parsed.data.error.requestId }),
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      });
    }

    throw new ApiRequestError({
      code: ERROR_CODES.INTERNAL_ERROR,
      status: response.status,
      message: 'The service returned an unexpected error.',
    });
  }

  return payload;
}

/** Returns only the `data` member of the success envelope. */
async function execute(options: RequestOptions): Promise<unknown> {
  const payload = await executeRaw(options);
  return (payload as { data?: unknown }).data;
}

/** Performs a request and validates the response payload against a shared schema. */
export async function apiRequest<T>(
  options: RequestOptions & { schema: ResponseSchema<T> },
): Promise<T> {
  const data = await execute(options);
  const parsed = options.schema.safeParse(data);

  if (!parsed.success) {
    // A contract mismatch is a bug, not a user error. Do not render partial state.
    throw new ApiRequestError({
      code: ERROR_CODES.INTERNAL_ERROR,
      status: 200,
      message: 'The service returned a response this app does not understand.',
    });
  }

  return parsed.data;
}

/**
 * Performs a request and validates the WHOLE envelope, not just `data`.
 *
 * `territoryPageSchema` and `territoryHistoryPageSchema` extend the success
 * envelope and make `meta` required, so their pagination cursor would be
 * silently discarded by `apiRequest`, which returns `data` alone. Paginated
 * reads must use this function so a missing `meta` is a parse failure rather
 * than an invisible loss of the cursor.
 */
export async function apiRequestEnvelope<T>(
  options: RequestOptions & { schema: ResponseSchema<T> },
): Promise<T> {
  const payload = await executeRaw(options);
  const parsed = options.schema.safeParse(payload);

  if (!parsed.success) {
    throw new ApiRequestError({
      code: ERROR_CODES.INTERNAL_ERROR,
      status: 200,
      message: 'The service returned a paginated response this app does not understand.',
    });
  }

  return parsed.data;
}

/** Performs a request whose response body carries nothing the UI needs. */
export async function apiCommand(options: RequestOptions): Promise<void> {
  await execute(options);
}
