import {
  companyClaimRequestSchema,
  emailTokenExchangeRequestSchema,
  emailVerificationRequestSchema,
  type ApiSuccess,
} from '@takeover/shared';
import type { FastifyInstance } from 'fastify';
import type { IdentityConfig } from '../../config/env.js';
import { ManagementAuthorizationRequiredError } from './authorization.js';
import type { CompanyIdentityService } from './service.js';
import {
  MANAGEMENT_CSRF_COOKIE_NAME,
  MANAGEMENT_SESSION_COOKIE_NAME,
  managementCsrfCookieOptions,
  managementSessionCookieOptions,
} from '../../security/session-cookie.js';
import { assertTrustedMutationOrigin } from '../../security/request-origin.js';

export type CompanyIdentityRoutesOptions = {
  config: IdentityConfig;
  nodeEnv: 'development' | 'test' | 'production';
  service: CompanyIdentityService;
};

function requestContext(request: { id: string; ip: string }) {
  return { ipAddress: request.ip, requestId: request.id };
}

function requiredCookie(value: string | undefined): string {
  if (value === undefined || value.length === 0) throw new ManagementAuthorizationRequiredError();
  return value;
}

export async function companyIdentityRoutes(
  app: FastifyInstance,
  options: CompanyIdentityRoutesOptions,
): Promise<void> {
  app.post('/api/company-claims', async (request, reply) => {
    const input = companyClaimRequestSchema.parse(request.body);
    const data = await options.service.beginCompanyClaim(input, requestContext(request));
    const response: ApiSuccess<typeof data> = { data, meta: { requestId: request.id } };
    return reply.status(202).send(response);
  });

  app.post('/api/email-verifications', async (request, reply) => {
    const input = emailVerificationRequestSchema.parse(request.body);
    const data = await options.service.reissueEmailVerification(input, requestContext(request));
    return reply.status(202).send({ data, meta: { requestId: request.id } });
  });

  app.post('/api/email-verifications/exchange', async (request, reply) => {
    const input = emailTokenExchangeRequestSchema.parse(request.body);
    const exchanged = await options.service.exchangeEmailVerification(
      input,
      requestContext(request),
    );
    if (exchanged.sessionToken !== undefined && exchanged.csrfToken !== undefined) {
      reply.setCookie(
        MANAGEMENT_SESSION_COOKIE_NAME,
        exchanged.sessionToken,
        managementSessionCookieOptions(options.nodeEnv),
      );
      reply.setCookie(
        MANAGEMENT_CSRF_COOKIE_NAME,
        exchanged.csrfToken,
        managementCsrfCookieOptions(options.nodeEnv),
      );
    }
    return reply.send({ data: exchanged.response, meta: { requestId: request.id } });
  });

  app.get('/api/company-management/context', async (request) => {
    const sessionToken = requiredCookie(request.cookies[MANAGEMENT_SESSION_COOKIE_NAME]);
    const csrfToken = requiredCookie(request.cookies[MANAGEMENT_CSRF_COOKIE_NAME]);
    const data = await options.service.getManagementContext(sessionToken, csrfToken);
    return { data, meta: { requestId: request.id } };
  });

  app.delete('/api/company-management/session', async (request, reply) => {
    assertTrustedMutationOrigin(request.headers.origin, options.config.webAppOrigin);
    const sessionToken = requiredCookie(request.cookies[MANAGEMENT_SESSION_COOKIE_NAME]);
    const csrfCookie = requiredCookie(request.cookies[MANAGEMENT_CSRF_COOKIE_NAME]);
    const csrfHeader = requiredCookie(
      typeof request.headers['x-csrf-token'] === 'string'
        ? request.headers['x-csrf-token']
        : undefined,
    );
    if (csrfCookie !== csrfHeader) throw new ManagementAuthorizationRequiredError();
    await options.service.revokeManagementSession(
      sessionToken,
      csrfHeader,
      requestContext(request),
    );
    reply.clearCookie(
      MANAGEMENT_SESSION_COOKIE_NAME,
      managementSessionCookieOptions(options.nodeEnv),
    );
    reply.clearCookie(
      MANAGEMENT_CSRF_COOKIE_NAME,
      managementCsrfCookieOptions(options.nodeEnv),
    );
    return reply.status(204).send();
  });
}
