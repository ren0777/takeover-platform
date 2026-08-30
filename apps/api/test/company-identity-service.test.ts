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

function createHarness(options: { beginResult?: BeginClaimRecordResult; exchange?: VerificationExchangeResult } = {}) {
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
    issueContactVerificationChallenge: vi.fn(async () => null),
    issueManagementChallenge: vi.fn(async () => null),
    listActiveManagerContacts: vi.fn(async () => []),
    markChallengeDelivery: vi.fn(async () => undefined),
    prepareAccessRequestNotifications: vi.fn(async () => []),
    recordAccessDecisionNotificationFailure: vi.fn(async () => undefined),
    resolveManagementSession: vi.fn(async () => null),
    revokeManagementSession: vi.fn(async () => undefined),
  } as unknown as CompanyIdentityRepository;
  const emailProvider: EmailProvider = {
    sendVerification: vi.fn(async () => ({ acceptedAt: now, messageId: 'message-1' })),
    sendManagementLink: vi.fn(async () => ({ acceptedAt: now, messageId: 'message-2' })),
    sendAccessRequestNotification: vi.fn(async () => ({ acceptedAt: now, messageId: 'message-3' })),
    sendAccessDecisionNotification: vi.fn(async () => ({ acceptedAt: now, messageId: 'message-4' })),
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

    const issued = createOpaqueTokenService(parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret).issueLinkToken();
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
    vi.mocked(repository.prepareAccessRequestNotifications).mockImplementationOnce(async (input) => [
      {
        challengeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        contactId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        selector: input.challenges[0]?.selector ?? 'missing-selector',
        toEmail: 'manager@gmail.com',
      },
    ]);
    const issued = createOpaqueTokenService(parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret).issueLinkToken();

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
    expect(emailProvider.sendAccessRequestNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        rawReviewToken: expect.any(String),
        requesterEmail: 'founder@gmail.com',
        toEmail: 'manager@gmail.com',
      }),
    );
  });

  it.each(['malformed', 'selector.secret'])('rejects malformed or invalid token %s generically', async (token) => {
    const { service } = createHarness();
    await expect(
      service.exchangeEmailVerification(
        { token },
        { ipAddress: '203.0.113.20', requestId: 'exchange-invalid' },
      ),
    ).rejects.toBeInstanceOf(InvalidCapabilityTokenError);
  });
});

describe('verification reissue and scoped session context', () => {
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

    await expect(service.getManagementContext(session.rawToken, csrf.rawToken)).resolves.toMatchObject({
      company: { id: company.id },
      csrfToken: csrf.rawToken,
      verificationLevels: ['contact_verified'],
    });
  });

  it('rejects an absent session and does not revoke anything', async () => {
    const { repository, service } = createHarness();

    await expect(service.getManagementContext('unknown-session', 'unknown-csrf')).rejects.toMatchObject({
      code: 'AUTHORIZATION_REQUIRED',
    });
    expect(repository.revokeManagementSession).not.toHaveBeenCalled();
  });
});

describe('management link lifecycle', () => {
  it('accepts unknown issuance without sending email', async () => {
    const { emailProvider, service } = createHarness();
    await expect(
      service.requestManagementLink(
        { companyId: company.id, contactEmail: 'unknown@gmail.com' },
        { ipAddress: '203.0.113.20', requestId: 'management-1' },
      ),
    ).resolves.toEqual({ accepted: true });
    expect(emailProvider.sendManagementLink).not.toHaveBeenCalled();
  });

  it('sends a 15-minute link only when the repository finds active authority', async () => {
    const { emailProvider, repository, service } = createHarness();
    vi.mocked(repository.issueManagementChallenge).mockResolvedValueOnce({
      challengeId: '99999999-9999-4999-8999-999999999999',
      companyName: company.name,
      toEmail: 'founder@gmail.com',
    });

    await service.requestManagementLink(
      { companyId: company.id, contactEmail: 'founder@gmail.com' },
      { ipAddress: '203.0.113.20', requestId: 'management-2' },
    );

    expect(repository.issueManagementChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: new Date('2026-08-30T13:15:00.000Z') }),
    );
    expect(emailProvider.sendManagementLink).toHaveBeenCalledWith(
      expect.objectContaining({ rawToken: expect.any(String), toEmail: 'founder@gmail.com' }),
    );
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
    const tokens = createOpaqueTokenService(parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret);
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
    const tokens = createOpaqueTokenService(parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret);
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
    const tokens = createOpaqueTokenService(parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret);
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

    expect(result).toMatchObject({ accessRequest: { status: 'approved' }, checkoutAvailable: false });
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
    const tokens = createOpaqueTokenService(parseApiConfig({ NODE_ENV: 'test' }).identity.tokenHmacSecret);
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
