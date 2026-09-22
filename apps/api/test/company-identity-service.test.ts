import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { parseApiConfig } from '../src/config/env.js';
import type { EmailProvider } from '../src/integrations/email/email-provider.js';
import {
  createCompanyIdentityService,
  InvalidCapabilityTokenError,
} from '../src/modules/company-identity/service.js';
import type {
  BeginClaimRecordResult,
  CompanyIdentityRepository,
  VerificationExchangeResult,
} from '../src/modules/company-identity/repository.js';
import { createOpaqueTokenService } from '../src/security/opaque-token.js';

const now = new Date('2026-08-30T13:00:00.000Z');
const company = {
  activatedAt: null,
  createdAt: now,
  expiresAt: new Date('2026-08-31T13:00:00.000Z'),
  id: '11111111-1111-4111-8111-111111111111',
  logoUrl: null,
  name: 'My Cool Startup',
  normalizedWebsite: 'https://mycoolstartup.com/',
  slug: null,
  status: 'DRAFT' as const,
  updatedAt: now,
  websiteUrl: 'https://mycoolstartup.com/',
};
const intent = {
  companyId: company.id,
  contactId: '22222222-2222-4222-8222-222222222222',
  expiresAt: new Date('2026-08-31T13:00:00.000Z'),
  id: '33333333-3333-4333-8333-333333333333',
  status: 'AWAITING_EMAIL_VERIFICATION' as const,
  territoryExternalRef: 'ai-coding',
};

function digest(value: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(value).digest());
}

function createHarness(
  options: { beginResult?: BeginClaimRecordResult; exchange?: VerificationExchangeResult } = {},
) {
  const beginResult: BeginClaimRecordResult =
    options.beginResult ??
    ({
      challenge: {
        companyId: company.id,
        contactId: intent.contactId,
        expiresAt: new Date('2026-08-30T13:15:00.000Z'),
        id: '44444444-4444-4444-8444-444444444444',
        selector: 'stored-selector',
        tokenDigest: digest('challenge'),
      },
      company,
      contact: {
        email: 'founder@gmail.com',
        emailVerifiedAt: null,
        id: intent.contactId,
        normalizedEmail: 'founder@gmail.com',
      },
      intent,
      kind: 'new_company',
    } satisfies BeginClaimRecordResult);
  const repository = {
    beginCompanyClaim: vi.fn(async () => beginResult),
    consumeContactVerification: vi.fn(async () => options.exchange ?? { kind: 'invalid' }),
    consumeManagementChallenge: vi.fn(async () => ({ kind: 'invalid' })),
    consumeRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
    decideAccessRequest: vi.fn(),
    getAccessRequestCompanyId: vi.fn(async () => null),
    getContactVerificationAccessScope: vi.fn(async () =>
      options.exchange?.kind === 'access_request'
        ? { companyId: company.id, normalizedEmail: 'founder@gmail.com' }
        : null,
    ),
    issueContactVerificationChallenge: vi.fn(async () => null),
    issueManagementChallenge: vi.fn(async () => null),
    listPendingAccessRequests: vi.fn(async () => ({ items: [], nextCursor: null })),
    listActiveManagerContacts: vi.fn(async () => []),
    markChallengeDelivery: vi.fn(async () => undefined),
    prepareAccessRequestNotifications: vi.fn(async () => []),
    recordAccessDecisionNotificationFailure: vi.fn(async () => undefined),
    requestManualRecovery: vi.fn(async () => null),
    resolveManagementSession: vi.fn(async () => null),
    revokeManagementSession: vi.fn(async () => undefined),
    updateTakeoverPreparation: vi.fn(async () => null),
    getTakeoverPreparation: vi.fn(async () => ({ intent: null, quote: null, territory: null })),
    generatePreparationQuote: vi.fn(async () => ({ kind: 'unauthorized' })),
    startTakeoverPreparation: vi.fn(async () => ({ kind: 'unauthorized' })),
    cancelTakeoverIntent: vi.fn(async () => null),
  } as unknown as CompanyIdentityRepository;
  const emailProvider: EmailProvider = {
    sendVerification: vi.fn(async () => ({ acceptedAt: now, messageId: 'message-1' })),
    sendManagementLink: vi.fn(async () => ({ acceptedAt: now, messageId: 'message-2' })),
    sendAccessRequestNotification: vi.fn(async () => ({ acceptedAt: now, messageId: 'message-3' })),
    sendAccessDecisionNotification: vi.fn(async () => ({
      acceptedAt: now,
      messageId: 'message-4',
    })),
  };
  const config = parseApiConfig({ NODE_ENV: 'test' }).identity;
  const service = createCompanyIdentityService({
    clock: { now: () => now },
    config,
    emailProvider,
    repository,
    tokens: createOpaqueTokenService(config.tokenHmacSecret),
  });
  return { emailProvider, repository, service };
}

describe('new company claim service', () => {
  it('creates a 24-hour private claim and delivers a 15-minute verification link', async () => {
    const { emailProvider, repository, service } = createHarness();

    const result = await service.beginCompanyClaim(
      {
        company: { name: 'My Cool Startup', websiteUrl: 'https://mycoolstartup.com' },
        contactEmail: 'founder@gmail.com',
        intent: { territoryExternalRef: 'ai-coding' },
      },
      { ipAddress: '203.0.113.20', requestId: 'request-1' },
    );

    expect(result).toMatchObject({
      checkoutAvailable: false,
      contactVerification: { deliveryAccepted: true, status: 'verification_required' },
      nextAction: 'verify_email',
    });
    expect(repository.beginCompanyClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        challenge: expect.objectContaining({ expiresAt: new Date('2026-08-30T13:15:00.000Z') }),
        company: expect.objectContaining({ expiresAt: new Date('2026-08-31T13:00:00.000Z') }),
        contact: expect.objectContaining({ normalizedEmail: 'founder@gmail.com' }),
        intent: expect.objectContaining({ expiresAt: new Date('2026-08-31T13:00:00.000Z') }),
      }),
    );
    const storedInput = vi.mocked(repository.beginCompanyClaim).mock.calls[0]?.[0];
    const deliveredInput = vi.mocked(emailProvider.sendVerification).mock.calls[0]?.[0];
    expect(storedInput?.challenge).not.toHaveProperty('rawToken');
    expect(deliveredInput?.rawToken).toEqual(expect.any(String));
    expect(JSON.stringify(storedInput)).not.toContain(deliveredInput?.rawToken);
    expect(repository.markChallengeDelivery).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
      'SENT',
    );
  });

  it('allows a Gmail management contact for a different website domain', async () => {
    const { service } = createHarness();
    await expect(
      service.beginCompanyClaim(
        {
          company: { name: 'My Cool Startup', websiteUrl: 'https://mycoolstartup.com' },
          contactEmail: 'founder@gmail.com',
          intent: { territoryExternalRef: 'ai-coding' },
        },
        { ipAddress: '203.0.113.20', requestId: 'request-2' },
      ),
    ).resolves.toMatchObject({ checkoutAvailable: false });
  });

  it('records failed delivery without pretending verification was sent', async () => {
    const { emailProvider, repository, service } = createHarness();
    vi.mocked(emailProvider.sendVerification).mockRejectedValueOnce(new Error('transport down'));

    await expect(
      service.beginCompanyClaim(
        {
          company: { name: 'My Cool Startup', websiteUrl: 'https://mycoolstartup.com' },
          contactEmail: 'founder@gmail.com',
          intent: { territoryExternalRef: 'ai-coding' },
        },
        { ipAddress: '203.0.113.20', requestId: 'request-3' },
      ),
    ).rejects.toThrow('transport down');
    expect(repository.markChallengeDelivery).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
      'FAILED',
    );
  });
});

describe('contact verification exchange service', () => {
  it('returns a draft-company session only after atomic verification succeeds', async () => {
    const exchange: VerificationExchangeResult = {
      company,
      intent: { ...intent, status: 'IDENTITY_READY' },
      kind: 'management_session',
      session: {
        companyId: company.id,
        csrfDigest: digest('csrf'),
        expiresAt: new Date('2026-08-30T21:00:00.000Z'),
        grantId: '55555555-5555-4555-8555-555555555555',
        sessionId: '66666666-6666-4666-8666-666666666666',
        tokenDigest: digest('session'),
      },
      verificationLevels: ['CONTACT_VERIFIED'],
    };
    const { repository, service } = createHarness({ exchange });

    const issued = createOpaqueTokenService(
      parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret,
    ).issueLinkToken();
    const result = await service.exchangeEmailVerification(
      { token: issued.rawToken },
      { ipAddress: '203.0.113.20', requestId: 'exchange-1' },
    );

    expect(result.response).toMatchObject({
      checkoutAvailable: false,
      managementContext: { verificationLevels: ['contact_verified'] },
      nextAction: 'manage_company',
    });
    expect(result.sessionToken).toEqual(expect.any(String));
    expect(result.csrfToken).toEqual(expect.any(String));
    expect(repository.consumeContactVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        accessRequestExpiresAt: new Date('2026-09-06T13:00:00.000Z'),
        maxFailedAttempts: 10,
        sessionExpiresAt: new Date('2026-08-30T21:00:00.000Z'),
      }),
    );
  });

  it('returns pending access without authority for an existing company', async () => {
    const exchange: VerificationExchangeResult = {
      accessRequest: {
        expiresAt: new Date('2026-09-06T13:00:00.000Z'),
        id: '77777777-7777-4777-8777-777777777777',
        requestedAt: now,
        status: 'PENDING',
      },
      company: { ...company, status: 'ACTIVE' },
      intent: { ...intent, status: 'AWAITING_COMPANY_ACCESS' },
      kind: 'access_request',
      requesterEmail: 'founder@gmail.com',
    };
    const { emailProvider, repository, service } = createHarness({ exchange });
    vi.mocked(repository.listActiveManagerContacts).mockResolvedValueOnce([
      { contactId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'manager@gmail.com' },
    ]);
    vi.mocked(repository.prepareAccessRequestNotifications).mockImplementationOnce(
      async (input) => [
        {
          challengeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          contactId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          selector: input.challenges[0]?.selector ?? 'missing-selector',
          toEmail: 'manager@gmail.com',
        },
      ],
    );
    const issued = createOpaqueTokenService(
      parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret,
    ).issueLinkToken();

    const result = await service.exchangeEmailVerification(
      { token: issued.rawToken },
      { ipAddress: '203.0.113.20', requestId: 'exchange-2' },
    );

    expect(result).not.toHaveProperty('sessionToken');
    expect(result.response).toMatchObject({
      accessRequest: { status: 'pending' },
      checkoutAvailable: false,
      nextAction: 'await_company_access',
    });
    const appliedLimits = vi
      .mocked(repository.consumeRateLimit)
      .mock.calls.map(([input]) => input.limit);
    expect(appliedLimits).toContain(3);
    expect(appliedLimits.filter((limit) => limit === 10)).toHaveLength(2);
    expect(emailProvider.sendAccessRequestNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        rawReviewToken: expect.any(String),
        requesterEmail: 'founder@gmail.com',
        toEmail: 'manager@gmail.com',
      }),
    );
  });

  it('enforces existing-company access limits before consuming the verification challenge', async () => {
    const exchange: VerificationExchangeResult = {
      accessRequest: {
        expiresAt: new Date('2026-09-06T13:00:00.000Z'),
        id: '77777777-7777-4777-8777-777777777777',
        requestedAt: now,
        status: 'PENDING',
      },
      company: { ...company, status: 'ACTIVE' },
      intent: { ...intent, status: 'AWAITING_COMPANY_ACCESS' },
      kind: 'access_request',
      requesterEmail: 'founder@gmail.com',
    };
    const { repository, service } = createHarness({ exchange });
    vi.mocked(repository.consumeRateLimit).mockImplementation(async (input) => ({
      allowed: input.limit !== 3,
      retryAfterSeconds: input.limit === 3 ? 86_400 : 0,
    }));
    const issued = createOpaqueTokenService(
      parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret,
    ).issueLinkToken();

    await expect(
      service.exchangeEmailVerification(
        { token: issued.rawToken },
        { ipAddress: '203.0.113.20', requestId: 'exchange-rate-limited' },
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 86_400 });
    expect(repository.consumeContactVerification).not.toHaveBeenCalled();
  });

  it.each(['malformed', 'selector.secret'])(
    'rejects malformed or invalid token %s generically',
    async (token) => {
      const { service } = createHarness();
      await expect(
        service.exchangeEmailVerification(
          { token },
          { ipAddress: '203.0.113.20', requestId: 'exchange-invalid' },
        ),
      ).rejects.toBeInstanceOf(InvalidCapabilityTokenError);
    },
  );
});

describe('verification reissue and scoped session context', () => {
  it('lists pending access requests from the session company without requiring CSRF', async () => {
    const { repository, service } = createHarness();
    const config = parseApiConfig({ NODE_ENV: 'test' }).identity;
    const tokens = createOpaqueTokenService(config.tokenHmacSecret);
    const session = tokens.issueSessionToken();
    vi.mocked(repository.resolveManagementSession).mockResolvedValueOnce({
      company,
      companyId: company.id,
      contactId: intent.contactId,
      csrfDigest: digest('unused-csrf-digest'),
      expiresAt: new Date('2026-08-30T21:00:00.000Z'),
      grantId: '55555555-5555-4555-8555-555555555555',
      sessionId: '66666666-6666-4666-8666-666666666666',
      verificationLevels: ['CONTACT_VERIFIED'],
    });
    vi.mocked(repository.listPendingAccessRequests).mockResolvedValueOnce({
      items: [
        {
          companyId: company.id,
          contactEmail: 'requester@example.com',
          expiresAt: new Date('2026-09-06T13:00:00.000Z'),
          id: '77777777-7777-4777-8777-777777777777',
          intent: { id: intent.id, territoryExternalRef: 'ai-coding' },
          requestedAt: new Date('2026-08-30T12:00:00.000Z'),
        },
      ],
      nextCursor: null,
    });

    await expect(service.listAccessRequests({}, session.rawToken)).resolves.toEqual({
      items: [
        {
          companyId: company.id,
          expiresAt: '2026-09-06T13:00:00.000Z',
          id: '77777777-7777-4777-8777-777777777777',
          intent: { id: intent.id, territoryExternalRef: 'ai-coding' },
          requestedAt: '2026-08-30T12:00:00.000Z',
          requesterEmail: 'requester@example.com',
          status: 'pending',
        },
      ],
      nextCursor: null,
    });
    expect(repository.listPendingAccessRequests).toHaveBeenCalledWith({
      companyId: company.id,
      cursor: undefined,
      limit: 50,
      now,
    });
  });

  it('returns the same accepted result when a claim is unknown', async () => {
    const { emailProvider, service } = createHarness();

    await expect(
      service.reissueEmailVerification(
        { companyId: company.id, contactEmail: 'unknown@gmail.com' },
        { ipAddress: '203.0.113.20', requestId: 'reissue-1' },
      ),
    ).resolves.toEqual({ accepted: true });
    expect(emailProvider.sendVerification).not.toHaveBeenCalled();
  });

  it('reissues a verification link for a matching pending claim', async () => {
    const { emailProvider, repository, service } = createHarness();
    vi.mocked(repository.issueContactVerificationChallenge).mockResolvedValueOnce({
      challengeId: '88888888-8888-4888-8888-888888888888',
      companyName: company.name,
      toEmail: 'founder@gmail.com',
    });

    await expect(
      service.reissueEmailVerification(
        { companyId: company.id, contactEmail: 'founder@gmail.com' },
        { ipAddress: '203.0.113.20', requestId: 'reissue-2' },
      ),
    ).resolves.toEqual({ accepted: true });
    expect(emailProvider.sendVerification).toHaveBeenCalledWith(
      expect.objectContaining({ rawToken: expect.any(String), toEmail: 'founder@gmail.com' }),
    );
    expect(repository.markChallengeDelivery).toHaveBeenCalledWith(
      '88888888-8888-4888-8888-888888888888',
      'SENT',
    );
  });

  it('resolves one company context and verifies the client CSRF secret', async () => {
    const { repository, service } = createHarness();
    const config = parseApiConfig({ NODE_ENV: 'test' }).identity;
    const tokens = createOpaqueTokenService(config.tokenHmacSecret);
    const session = tokens.issueSessionToken();
    const csrf = tokens.issueSessionToken();
    vi.mocked(repository.resolveManagementSession).mockResolvedValueOnce({
      company,
      companyId: company.id,
      contactId: intent.contactId,
      csrfDigest: tokens.digestCsrfToken(csrf.rawToken),
      expiresAt: new Date('2026-08-30T21:00:00.000Z'),
      grantId: '55555555-5555-4555-8555-555555555555',
      sessionId: '66666666-6666-4666-8666-666666666666',
      verificationLevels: ['CONTACT_VERIFIED'],
    });

    await expect(
      service.getManagementContext(session.rawToken, csrf.rawToken),
    ).resolves.toMatchObject({
      company: { id: company.id },
      csrfToken: csrf.rawToken,
      verificationLevels: ['contact_verified'],
    });
  });

  it('rejects an absent session and does not revoke anything', async () => {
    const { repository, service } = createHarness();

    await expect(
      service.getManagementContext('unknown-session', 'unknown-csrf'),
    ).rejects.toMatchObject({
      code: 'AUTHORIZATION_REQUIRED',
    });
    expect(repository.revokeManagementSession).not.toHaveBeenCalled();
  });
});

describe('management link lifecycle', () => {
  it('accepts unknown issuance without sending email', async () => {
    const { emailProvider, repository, service } = createHarness();
    await expect(
      service.requestManagementLink(
        { companySlug: 'unknown-company', contactEmail: 'unknown@gmail.com' },
        { ipAddress: '203.0.113.20', requestId: 'management-1' },
      ),
    ).resolves.toEqual({ accepted: true });
    expect(emailProvider.sendManagementLink).not.toHaveBeenCalled();
    expect(repository.issueManagementChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ locator: { normalizedSlug: 'unknown-company' } }),
    );
  });

  it('sends a 15-minute link only when the repository finds active authority', async () => {
    const { emailProvider, repository, service } = createHarness();
    vi.mocked(repository.issueManagementChallenge).mockResolvedValueOnce({
      challengeId: '99999999-9999-4999-8999-999999999999',
      companyName: company.name,
      toEmail: 'founder@gmail.com',
    });

    await service.requestManagementLink(
      { companyWebsiteUrl: 'https://MYCOOLSTARTUP.COM:443/', contactEmail: 'founder@gmail.com' },
      { ipAddress: '203.0.113.20', requestId: 'management-2' },
    );

    expect(repository.issueManagementChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: new Date('2026-08-30T13:15:00.000Z'),
        locator: { normalizedWebsite: 'https://mycoolstartup.com/' },
      }),
    );
    expect(repository.consumeRateLimit).toHaveBeenCalledTimes(3);
    expect(emailProvider.sendManagementLink).toHaveBeenCalledWith(
      expect.objectContaining({ rawToken: expect.any(String), toEmail: 'founder@gmail.com' }),
    );
  });

  it('uses one rate-limit bucket for equivalent IPv6 request addresses', async () => {
    const first = createHarness();
    const second = createHarness();
    const request = { companySlug: 'my-cool-startup', contactEmail: 'founder@gmail.com' };

    await first.service.requestManagementLink(request, {
      ipAddress: '2001:0db8:0:0:0:0:0:1',
      requestId: 'management-ip-1',
    });
    await second.service.requestManagementLink(request, {
      ipAddress: '2001:db8::1',
      requestId: 'management-ip-2',
    });

    const firstIpScope = vi.mocked(first.repository.consumeRateLimit).mock.calls[1]?.[0];
    const secondIpScope = vi.mocked(second.repository.consumeRateLimit).mock.calls[1]?.[0];
    expect(firstIpScope?.keyDigest).toEqual(secondIpScope?.keyDigest);
  });

  it('uses one rate-limit bucket for IPv4 and its IPv4-mapped IPv6 form', async () => {
    const first = createHarness();
    const second = createHarness();
    const request = { companySlug: 'my-cool-startup', contactEmail: 'founder@gmail.com' };

    await first.service.requestManagementLink(request, {
      ipAddress: '192.0.2.1',
      requestId: 'management-ipv4-1',
    });
    await second.service.requestManagementLink(request, {
      ipAddress: '::ffff:192.0.2.1',
      requestId: 'management-ipv4-2',
    });

    const firstIpScope = vi.mocked(first.repository.consumeRateLimit).mock.calls[1]?.[0];
    const secondIpScope = vi.mocked(second.repository.consumeRateLimit).mock.calls[1]?.[0];
    expect(firstIpScope?.keyDigest).toEqual(secondIpScope?.keyDigest);
  });

  it('exchanges a single-use link into one company context and an eight-hour session', async () => {
    const { repository, service } = createHarness();
    vi.mocked(repository.consumeManagementChallenge).mockResolvedValueOnce({
      company,
      kind: 'management_session',
      session: {
        companyId: company.id,
        csrfDigest: digest('csrf'),
        expiresAt: new Date('2026-08-30T21:00:00.000Z'),
        grantId: '55555555-5555-4555-8555-555555555555',
        sessionId: '66666666-6666-4666-8666-666666666666',
        tokenDigest: digest('session'),
      },
      verificationLevels: ['CONTACT_VERIFIED'],
    });
    const tokens = createOpaqueTokenService(
      parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret,
    );
    const link = tokens.issueLinkToken();

    const result = await service.exchangeManagementLink(
      { token: link.rawToken },
      { ipAddress: '203.0.113.20', requestId: 'management-exchange' },
    );

    expect(result.context).toMatchObject({
      company: { id: company.id },
      verificationLevels: ['contact_verified'],
    });
    expect(result.sessionToken).toEqual(expect.any(String));
    expect(result.csrfToken).toEqual(expect.any(String));
    expect(repository.consumeManagementChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ sessionExpiresAt: new Date('2026-08-30T21:00:00.000Z') }),
    );
  });

  it('denies a Company A session when authorizing Company B', async () => {
    const { repository, service } = createHarness();
    const tokens = createOpaqueTokenService(
      parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret,
    );
    const session = tokens.issueSessionToken();
    const csrf = tokens.issueSessionToken();
    vi.mocked(repository.resolveManagementSession).mockResolvedValueOnce({
      company,
      companyId: company.id,
      contactId: intent.contactId,
      csrfDigest: tokens.digestCsrfToken(csrf.rawToken),
      expiresAt: new Date('2026-08-30T21:00:00.000Z'),
      grantId: '55555555-5555-4555-8555-555555555555',
      sessionId: '66666666-6666-4666-8666-666666666666',
      verificationLevels: ['CONTACT_VERIFIED'],
    });

    await expect(
      service.authorizeCompanyMutation(
        session.rawToken,
        csrf.rawToken,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ),
    ).rejects.toThrow('company');
  });
});

describe('existing-company access decisions', () => {
  it('approves with same-company authority and sends a continuation management link', async () => {
    const { emailProvider, repository, service } = createHarness();
    const tokens = createOpaqueTokenService(
      parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret,
    );
    const session = tokens.issueSessionToken();
    const csrf = tokens.issueSessionToken();
    vi.mocked(repository.getAccessRequestCompanyId).mockResolvedValueOnce(company.id);
    vi.mocked(repository.resolveManagementSession).mockResolvedValueOnce({
      company,
      companyId: company.id,
      contactId: intent.contactId,
      csrfDigest: tokens.digestCsrfToken(csrf.rawToken),
      expiresAt: new Date('2026-08-30T21:00:00.000Z'),
      grantId: '55555555-5555-4555-8555-555555555555',
      sessionId: '66666666-6666-4666-8666-666666666666',
      verificationLevels: ['CONTACT_VERIFIED'],
    });
    vi.mocked(repository.decideAccessRequest).mockResolvedValueOnce({
      accessRequest: {
        companyId: company.id,
        decidedAt: now,
        expiresAt: new Date('2026-09-06T13:00:00.000Z'),
        id: '77777777-7777-4777-8777-777777777777',
        requestedAt: now,
        status: 'APPROVED',
      },
      challengeId: '88888888-8888-4888-8888-888888888888',
      companyName: company.name,
      requesterEmail: 'requester@gmail.com',
    });

    const result = await service.approveAccessRequest(
      '77777777-7777-4777-8777-777777777777',
      {},
      session.rawToken,
      csrf.rawToken,
      { ipAddress: '203.0.113.20', requestId: 'approve-1' },
    );

    expect(result).toMatchObject({
      accessRequest: { status: 'approved' },
      checkoutAvailable: false,
    });
    expect(repository.decideAccessRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        decidedByGrantId: '55555555-5555-4555-8555-555555555555',
        decision: 'approved',
        managementChallenge: expect.objectContaining({
          expiresAt: new Date('2026-08-30T13:15:00.000Z'),
        }),
      }),
    );
    expect(emailProvider.sendAccessDecisionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'approved',
        rawManagementToken: expect.any(String),
        toEmail: 'requester@gmail.com',
      }),
    );
  });

  it('rejects without creating a management token', async () => {
    const { emailProvider, repository, service } = createHarness();
    const tokens = createOpaqueTokenService(
      parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret,
    );
    const session = tokens.issueSessionToken();
    const csrf = tokens.issueSessionToken();
    vi.mocked(repository.getAccessRequestCompanyId).mockResolvedValueOnce(company.id);
    vi.mocked(repository.resolveManagementSession).mockResolvedValueOnce({
      company,
      companyId: company.id,
      csrfDigest: tokens.digestCsrfToken(csrf.rawToken),
      expiresAt: new Date('2026-08-30T21:00:00.000Z'),
      grantId: '55555555-5555-4555-8555-555555555555',
      sessionId: '66666666-6666-4666-8666-666666666666',
      verificationLevels: ['CONTACT_VERIFIED'],
    });
    vi.mocked(repository.decideAccessRequest).mockResolvedValueOnce({
      accessRequest: {
        companyId: company.id,
        decidedAt: now,
        expiresAt: new Date('2026-09-06T13:00:00.000Z'),
        id: '77777777-7777-4777-8777-777777777777',
        requestedAt: now,
        status: 'REJECTED',
      },
      companyName: company.name,
      requesterEmail: 'requester@gmail.com',
    });

    await service.rejectAccessRequest(
      '77777777-7777-4777-8777-777777777777',
      { reason: 'Not recognized' },
      session.rawToken,
      csrf.rawToken,
      { ipAddress: '203.0.113.20', requestId: 'reject-1' },
    );

    expect(repository.decideAccessRequest).toHaveBeenCalledWith(
      expect.not.objectContaining({ managementChallenge: expect.anything() }),
    );
    expect(emailProvider.sendAccessDecisionNotification).toHaveBeenCalledWith({
      companyName: company.name,
      decision: 'rejected',
      toEmail: 'requester@gmail.com',
    });
  });
});

describe('manual recovery and takeover preparation seams', () => {
  it('records recovery as pending while execution remains unavailable', async () => {
    const { repository, service } = createHarness();
    vi.mocked(repository.requestManualRecovery).mockResolvedValueOnce({
      expiresAt: new Date('2026-09-06T13:00:00.000Z'),
      id: '77777777-7777-4777-8777-777777777777',
      status: 'PENDING',
    });

    await expect(
      service.requestManualRecovery(
        {
          accessRequestId: '77777777-7777-4777-8777-777777777777',
          contactEmail: 'requester@gmail.com',
        },
        { ipAddress: '203.0.113.20', requestId: 'recovery-1' },
      ),
    ).resolves.toEqual({
      executionAvailable: false,
      expiresAt: '2026-09-06T13:00:00.000Z',
      id: '77777777-7777-4777-8777-777777777777',
      status: 'pending',
    });
    expect(repository.requestManualRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: new Date('2026-09-06T13:00:00.000Z') }),
    );
    expect(repository.consumeRateLimit).toHaveBeenCalledWith(expect.objectContaining({ limit: 2 }));
  });

  it('stores only reference data and always keeps checkout unavailable', async () => {
    const { repository, service } = createHarness();
    const tokens = createOpaqueTokenService(
      parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret,
    );
    const session = tokens.issueSessionToken();
    const csrf = tokens.issueSessionToken();
    vi.mocked(repository.resolveManagementSession).mockResolvedValueOnce({
      company,
      companyId: company.id,
      csrfDigest: tokens.digestCsrfToken(csrf.rawToken),
      expiresAt: new Date('2026-08-30T21:00:00.000Z'),
      grantId: '55555555-5555-4555-8555-555555555555',
      sessionId: '66666666-6666-4666-8666-666666666666',
      verificationLevels: ['CONTACT_VERIFIED'],
    });
    vi.mocked(repository.updateTakeoverPreparation).mockResolvedValueOnce({
      ...intent,
      currency: 'USD',
      intendedAmountMinor: 26_000n,
      quoteObservedAt: new Date('2026-08-30T12:55:00.000Z'),
      quotedMinimumAmountMinor: 26_000n,
      quotedOwnerCompanyId: null,
      quotedTerritoryVersion: 'version-7',
      quotedWinningAmountMinor: 25_000n,
      status: 'IDENTITY_READY',
    });

    const result = await service.updateTakeoverPreparation(
      intent.id,
      {
        intendedBid: { amountMinor: 26_000, currency: 'USD' },
        quoteSnapshot: {
          currentWinningAmount: { amountMinor: 25_000, currency: 'USD' },
          minimumTakeoverAmount: { amountMinor: 26_000, currency: 'USD' },
          observedAt: '2026-08-30T12:55:00.000Z',
          territoryVersion: 'version-7',
        },
        territoryExternalRef: 'ai-coding',
      },
      session.rawToken,
      csrf.rawToken,
      { ipAddress: '203.0.113.20', requestId: 'intent-preparation-1' },
    );

    expect(result).toMatchObject({
      checkoutAvailable: false,
      quoteAuthority: 'reference_only',
      status: 'identity_ready',
    });
    expect(repository.updateTakeoverPreparation).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: company.id,
        intendedAmountMinor: 26_000n,
        territoryExternalRef: 'ai-coding',
      }),
    );
  });
});

describe('takeover preparation lifecycle', () => {
  const contactId = '22222222-2222-4222-8222-222222222222';
  const territory = {
    availabilityStatus: 'ACTIVE' as const,
    categoryName: 'AI',
    currency: 'USD',
    currentOwner: null,
    hasActiveOwner: false,
    id: '21000000-0000-4000-8000-000000000001',
    minimumTakeoverAmountMinor: 25_000n,
    name: 'AI Coding',
    slug: 'ai-coding',
    version: 3n,
  };
  const readyIntent = {
    ...intent,
    currency: null,
    intendedAmountMinor: null,
    quoteObservedAt: null,
    quotedMinimumAmountMinor: null,
    quotedOwnerCompanyId: null,
    quotedTerritoryVersion: null,
    quotedWinningAmountMinor: null,
    status: 'IDENTITY_READY' as const,
  };
  const context = { ipAddress: '203.0.113.20', requestId: 'prep-1' };

  function authorizedHarness() {
    const harness = createHarness();
    const tokens = createOpaqueTokenService(
      parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret,
    );
    const session = tokens.issueSessionToken();
    const csrf = tokens.issueSessionToken();
    vi.mocked(harness.repository.resolveManagementSession).mockResolvedValue({
      company,
      companyId: company.id,
      contactId,
      csrfDigest: tokens.digestCsrfToken(csrf.rawToken),
      expiresAt: new Date('2026-08-30T21:00:00.000Z'),
      grantId: '55555555-5555-4555-8555-555555555555',
      sessionId: '66666666-6666-4666-8666-666666666666',
      verificationLevels: ['CONTACT_VERIFIED'],
    });
    return { ...harness, csrf: csrf.rawToken, session: session.rawToken };
  }

  it('reports no preparation when the contact has no live ready intent', async () => {
    const { csrf, service, session, repository } = authorizedHarness();

    await expect(service.getTakeoverPreparation(session, csrf)).resolves.toEqual({
      checkoutAvailable: false,
      intent: null,
      quote: null,
      quoteState: 'none',
      territory: null,
      territoryState: 'none',
    });
    expect(repository.getTakeoverPreparation).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: company.id, contactId }),
    );
  });

  it('projects the territory as it stands now, never offering checkout', async () => {
    const { csrf, service, session, repository } = authorizedHarness();
    vi.mocked(repository.getTakeoverPreparation).mockResolvedValueOnce({
      intent: readyIntent,
      quote: null,
      territory: {
        ...territory,
        currentOwner: { name: 'Northwind', slug: 'northwind' },
        hasActiveOwner: true,
      },
    });

    const view = await service.getTakeoverPreparation(session, csrf);

    expect(view).toMatchObject({
      checkoutAvailable: false,
      intent: { id: intent.id, status: 'identity_ready', checkoutAvailable: false },
      territory: {
        currentOwner: { name: 'Northwind', slug: 'northwind' },
        minimumTakeoverAmount: { amountMinor: 25_000, currency: 'USD' },
        name: 'AI Coding',
        status: 'claimed',
      },
      territoryState: 'claimed',
    });
  });

  it.each([
    ['disabled', { ...territory, availabilityStatus: 'DISABLED' as const }, 'disabled', 'disabled'],
    ['missing', null, 'missing', undefined],
  ])(
    'surfaces a %s territory instead of failing the read',
    async (_label, record, state, status) => {
      const { csrf, service, session, repository } = authorizedHarness();
      vi.mocked(repository.getTakeoverPreparation).mockResolvedValueOnce({
        intent: readyIntent,
        quote: null,
        territory: record,
      });

      const view = await service.getTakeoverPreparation(session, csrf);

      expect(view.territoryState).toBe(state);
      expect(view.territory?.status).toBe(status);
      expect(view.intent?.id).toBe(intent.id);
    },
  );

  it('refuses every preparation read and mutation without a valid session', async () => {
    const { service } = createHarness();

    await expect(service.getTakeoverPreparation('nope', 'nope')).rejects.toMatchObject({
      code: 'AUTHORIZATION_REQUIRED',
    });
    await expect(
      service.startTakeoverPreparation(
        { territoryExternalRef: 'ai-coding' },
        'nope',
        'nope',
        context,
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_REQUIRED' });
    await expect(
      service.cancelTakeoverIntent(intent.id, 'nope', 'nope', context),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_REQUIRED' });
  });

  it('starts preparation for the session contact with the configured draft lifetime', async () => {
    const { csrf, service, session, repository } = authorizedHarness();
    vi.mocked(repository.startTakeoverPreparation).mockResolvedValueOnce({
      created: true,
      intent: readyIntent,
      kind: 'ready',
      quote: null,
      territory,
    });

    const view = await service.startTakeoverPreparation(
      { territoryExternalRef: 'ai-coding' },
      session,
      csrf,
      context,
    );

    expect(view).toMatchObject({ territoryState: 'available', checkoutAvailable: false });
    expect(repository.startTakeoverPreparation).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: company.id,
        contactId,
        expiresAt: new Date(now.getTime() + 86_400 * 1000),
        sessionId: '66666666-6666-4666-8666-666666666666',
        territoryExternalRef: 'ai-coding',
      }),
    );
  });

  it.each([
    ['territory_missing', 'TERRITORY_NOT_FOUND', 404],
    ['territory_disabled', 'TERRITORY_DISABLED', 409],
    ['unauthorized', 'AUTHORIZATION_REQUIRED', 401],
  ] as const)('maps a %s start outcome to %s', async (kind, code, statusCode) => {
    const { csrf, service, session, repository } = authorizedHarness();
    vi.mocked(repository.startTakeoverPreparation).mockResolvedValueOnce({ kind });

    await expect(
      service.startTakeoverPreparation(
        { territoryExternalRef: 'ai-coding' },
        session,
        csrf,
        context,
      ),
    ).rejects.toMatchObject({ code, statusCode });
  });

  it('cancels only an intent the repository confirms belongs to this company', async () => {
    const { csrf, service, session, repository } = authorizedHarness();
    vi.mocked(repository.cancelTakeoverIntent).mockResolvedValueOnce({
      intent: { ...readyIntent, status: 'CANCELLED' },
      quote: null,
      territory,
    });

    const view = await service.cancelTakeoverIntent(intent.id, session, csrf, context);

    expect(view.intent?.status).toBe('cancelled');
    expect(view.territoryState).toBe('available');
    expect(repository.cancelTakeoverIntent).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: company.id, contactId, intentId: intent.id }),
    );

    vi.mocked(repository.cancelTakeoverIntent).mockResolvedValueOnce(null);
    await expect(
      service.cancelTakeoverIntent(intent.id, session, csrf, context),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_REQUIRED' });
  });
});

describe('takeover preparation quotes', () => {
  const contactId = '22222222-2222-4222-8222-222222222222';
  const territory = {
    availabilityStatus: 'ACTIVE' as const,
    categoryName: 'AI',
    currency: 'USD',
    currentOwner: null,
    hasActiveOwner: false,
    id: '21000000-0000-4000-8000-000000000001',
    minimumTakeoverAmountMinor: 1_000n,
    name: 'AI Coding',
    slug: 'ai-coding',
    version: 3n,
  };
  const readyIntent = {
    ...intent,
    currency: null,
    intendedAmountMinor: null,
    quoteObservedAt: null,
    quotedMinimumAmountMinor: null,
    quotedOwnerCompanyId: null,
    quotedTerritoryVersion: null,
    quotedWinningAmountMinor: null,
    status: 'IDENTITY_READY' as const,
  };
  const quote = {
    companyId: company.id,
    consumedAt: null,
    createdAt: new Date('2026-08-30T12:55:00.000Z'),
    currency: 'USD',
    expiresAt: new Date('2026-08-30T13:05:00.000Z'),
    id: '44444444-4444-4444-8444-444444444444',
    minimumAmountMinor: 1_000n,
    status: 'ACTIVE' as const,
    takeoverIntentId: intent.id,
    territoryId: territory.id,
    territoryVersion: 3n,
  };
  const context = { ipAddress: '203.0.113.20', requestId: 'quote-1' };

  function authorizedHarness() {
    const harness = createHarness();
    const tokens = createOpaqueTokenService(
      parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret,
    );
    const session = tokens.issueSessionToken();
    const csrf = tokens.issueSessionToken();
    vi.mocked(harness.repository.resolveManagementSession).mockResolvedValue({
      company,
      companyId: company.id,
      contactId,
      csrfDigest: tokens.digestCsrfToken(csrf.rawToken),
      expiresAt: new Date('2026-08-30T21:00:00.000Z'),
      grantId: '55555555-5555-4555-8555-555555555555',
      sessionId: '66666666-6666-4666-8666-666666666666',
      verificationLevels: ['CONTACT_VERIFIED'],
    });
    return { ...harness, csrf: csrf.rawToken, session: session.rawToken };
  }

  it('prices the quote from the territory row and never offers checkout', async () => {
    const { csrf, service, session, repository } = authorizedHarness();
    vi.mocked(repository.generatePreparationQuote).mockResolvedValueOnce({
      intent: readyIntent,
      kind: 'quoted',
      quote,
      reused: false,
      territory,
    });

    const view = await service.generateTakeoverQuote(session, csrf, context);

    expect(view).toMatchObject({
      checkoutAvailable: false,
      quote: {
        amount: { amountMinor: 1_000, currency: 'USD' },
        checkoutAvailable: false,
        expiresAt: '2026-08-30T13:05:00.000Z',
        id: quote.id,
        intentId: intent.id,
        status: 'active',
        territoryVersion: '3',
        usable: true,
      },
      quoteState: 'active',
      territory: { pricingConfigured: true },
    });
    expect(repository.generatePreparationQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: company.id,
        contactId,
        // Default TAKEOVER_QUOTE_TTL_SECONDS is five minutes.
        expiresAt: new Date(now.getTime() + 300 * 1000),
        sessionId: '66666666-6666-4666-8666-666666666666',
      }),
    );
  });

  it.each([
    ['unauthorized', 'AUTHORIZATION_REQUIRED', 401],
    ['no_intent', 'CONFLICT', 409],
    ['territory_missing', 'TERRITORY_NOT_FOUND', 404],
    ['territory_disabled', 'TERRITORY_DISABLED', 409],
    ['pricing_not_configured', 'PRICING_NOT_CONFIGURED', 409],
  ] as const)('maps a %s outcome to %s', async (kind, code, statusCode) => {
    const { csrf, service, session, repository } = authorizedHarness();
    vi.mocked(repository.generatePreparationQuote).mockResolvedValueOnce({ kind });

    await expect(service.generateTakeoverQuote(session, csrf, context)).rejects.toMatchObject({
      code,
      statusCode,
    });
  });

  it('refuses to quote without a valid session before touching the repository', async () => {
    const { service, repository } = createHarness();

    await expect(service.generateTakeoverQuote('nope', 'nope', context)).rejects.toMatchObject({
      code: 'AUTHORIZATION_REQUIRED',
    });
    expect(repository.generatePreparationQuote).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', { expiresAt: new Date('2026-08-30T12:59:00.000Z') }, {}, 'expired', undefined],
    ['stale after a version bump', {}, { version: 4n }, 'stale', 'territory_version_changed'],
    [
      'stale after a price change',
      {},
      { minimumTakeoverAmountMinor: 2_000n },
      'stale',
      'pricing_changed',
    ],
    [
      'stale once disabled',
      {},
      { availabilityStatus: 'DISABLED' as const },
      'stale',
      'territory_disabled',
    ],
    ['cancelled', { status: 'CANCELLED' as const }, {}, 'cancelled', undefined],
  ])('reports a quote as %s without altering the stored row', async (_l, q, t, state, reason) => {
    const { csrf, service, session, repository } = authorizedHarness();
    vi.mocked(repository.getTakeoverPreparation).mockResolvedValueOnce({
      intent: readyIntent,
      quote: { ...quote, ...q },
      territory: { ...territory, ...t },
    });

    const view = await service.getTakeoverPreparation(session, csrf);

    expect(view.quoteState).toBe(state);
    expect(view.quote?.usable).toBe(false);
    expect(view.quote?.amount).toEqual({ amountMinor: 1_000, currency: 'USD' });
    if (reason !== undefined) expect(view.quote?.staleReason).toBe(reason);
  });

  it('reports pricing as not configured for a zero minimum and shows no quote', async () => {
    const { csrf, service, session, repository } = authorizedHarness();
    vi.mocked(repository.getTakeoverPreparation).mockResolvedValueOnce({
      intent: readyIntent,
      quote: null,
      territory: { ...territory, minimumTakeoverAmountMinor: 0n },
    });

    const view = await service.getTakeoverPreparation(session, csrf);

    expect(view.territory?.pricingConfigured).toBe(false);
    expect(view.quote).toBeNull();
    expect(view.quoteState).toBe('none');
  });
});

describe('takeover preparation quotes on claimed territories', () => {
  it('maps a claimed_pricing_not_configured outcome to its own 409 code', async () => {
    const harness = createHarness();
    const tokens = createOpaqueTokenService(
      parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret,
    );
    const session = tokens.issueSessionToken();
    const csrf = tokens.issueSessionToken();
    vi.mocked(harness.repository.resolveManagementSession).mockResolvedValue({
      company,
      companyId: company.id,
      contactId: '22222222-2222-4222-8222-222222222222',
      csrfDigest: tokens.digestCsrfToken(csrf.rawToken),
      expiresAt: new Date('2026-08-30T21:00:00.000Z'),
      grantId: '55555555-5555-4555-8555-555555555555',
      sessionId: '66666666-6666-4666-8666-666666666666',
      verificationLevels: ['CONTACT_VERIFIED'],
    });
    vi.mocked(harness.repository.generatePreparationQuote).mockResolvedValueOnce({
      kind: 'claimed_pricing_not_configured',
    });

    await expect(
      harness.service.generateTakeoverQuote(session.rawToken, csrf.rawToken, {
        ipAddress: '203.0.113.20',
        requestId: 'quote-claimed',
      }),
    ).rejects.toMatchObject({
      code: 'CLAIMED_TERRITORY_PRICING_NOT_CONFIGURED',
      statusCode: 409,
    });
  });
});
