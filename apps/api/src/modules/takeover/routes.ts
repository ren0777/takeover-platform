import {
  attemptStatusSchema,
  checkoutRequestSchema,
  checkoutResponseSchema,
  quoteResponseSchema,
  type ApiSuccess,
} from '@takeover/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CompanyIdentityService } from '../company-identity/service.js';
import { ManagementAuthorizationRequiredError } from '../company-identity/authorization.js';
import { assertTrustedMutationOrigin } from '../../security/request-origin.js';
import {
  MANAGEMENT_CSRF_COOKIE_NAME,
  MANAGEMENT_SESSION_COOKIE_NAME,
} from '../../security/session-cookie.js';
import type { TakeoverService } from './service.js';

export type TakeoverRoutesOptions = {
  config: {
    /** DEV ONLY: present only when the local payment simulator is enabled. */
    developmentPayments?: { webhookSecret: string };
    dodoWebhookSecret?: string;
    webAppOrigin: string;
  };
  identityService: CompanyIdentityService;
  service: TakeoverService;
};

const quoteRequestSchema = z
  .object({
    territorySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();

const statusParamSchema = z
  .object({
    statusToken: z.string().regex(/^[A-Za-z0-9_-]{43,}$/),
  })
  .strict();

function requiredSecret(value: string | undefined): string {
  if (value === undefined || value.length === 0) throw new ManagementAuthorizationRequiredError();
  return value;
}

async function resolveMutationCompanyId(
  request: {
    cookies: Record<string, string | undefined>;
    headers: Record<string, string | string[] | undefined>;
  },
  options: Pick<TakeoverRoutesOptions, 'config' | 'identityService'>,
): Promise<string> {
  assertTrustedMutationOrigin(
    typeof request.headers.origin === 'string' ? request.headers.origin : undefined,
    options.config.webAppOrigin,
  );
  const sessionToken = requiredSecret(request.cookies[MANAGEMENT_SESSION_COOKIE_NAME]);
  const csrfCookie = requiredSecret(request.cookies[MANAGEMENT_CSRF_COOKIE_NAME]);
  const csrfToken = requiredSecret(
    typeof request.headers['x-csrf-token'] === 'string'
      ? request.headers['x-csrf-token']
      : undefined,
  );
  if (csrfCookie !== csrfToken) throw new ManagementAuthorizationRequiredError();
  const context = await options.identityService.getManagementContext(sessionToken, csrfToken);
  return context.company.id;
}

export async function takeoverRoutes(
  app: FastifyInstance,
  options: TakeoverRoutesOptions,
): Promise<void> {
  app.post('/api/takeover-quotes', async (request) => {
    const body = quoteRequestSchema.parse(request.body);
    const companyId = await resolveMutationCompanyId(request, options);
    const data = await options.service.createQuote({
      companyId,
      territorySlug: body.territorySlug,
    });
    quoteResponseSchema.parse(data);
    const response: ApiSuccess<typeof data> = { data, meta: { requestId: request.id } };
    return response;
  });

  app.post('/api/takeover-checkouts', async (request) => {
    const body = checkoutRequestSchema.parse(request.body);
    const companyId = await resolveMutationCompanyId(request, options);
    const data = await options.service.createCheckout({ companyId, quoteId: body.quoteId });
    checkoutResponseSchema.parse(data);
    const response: ApiSuccess<typeof data> = { data, meta: { requestId: request.id } };
    return response;
  });

  app.get<{ Params: { statusToken: string } }>(
    '/api/takeover-status/:statusToken',
    async (request) => {
      const { statusToken } = statusParamSchema.parse(request.params);
      const data = await options.service.getStatus(statusToken);
      attemptStatusSchema.parse(data);
      const response: ApiSuccess<typeof data> = { data, meta: { requestId: request.id } };
      return response;
    },
  );
}
