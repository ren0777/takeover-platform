import { describe, expect, it, vi } from 'vitest';
import {
  createDevelopmentEmailProvider,
} from '../src/integrations/email/development-email-provider.js';
import {
  EmailDeliveryUnavailableError,
  unavailableEmailProvider,
} from '../src/integrations/email/unavailable-email-provider.js';

function createHarness(capacity = 10) {
  let nextId = 0;
  return createDevelopmentEmailProvider({
    capacity,
    createMessageId: () => `dev-message-${++nextId}`,
    now: () => new Date('2026-08-30T00:00:00.000Z'),
    webAppOrigin: 'http://localhost:3000',
  });
}

describe('development email provider', () => {
  it('captures every supported message without using an application logger', async () => {
    const logger = { info: vi.fn(), error: vi.fn() };
    const { capture, provider } = createHarness();

    await provider.sendVerification({
      companyName: 'Acme',
      rawToken: 'verification-secret',
      toEmail: 'founder@gmail.com',
    });
    await provider.sendManagementLink({
      companyName: 'Acme',
      rawToken: 'management-secret',
      toEmail: 'founder@gmail.com',
    });
    await provider.sendAccessRequestNotification({
      companyName: 'Acme',
      rawReviewToken: 'review-secret',
      requesterEmail: 'new-manager@gmail.com',
      toEmail: 'founder@gmail.com',
    });
    await provider.sendAccessDecisionNotification({
      companyName: 'Acme',
      decision: 'approved',
      rawManagementToken: 'decision-secret',
      toEmail: 'new-manager@gmail.com',
    });

    expect(capture.list().map((message) => message.type)).toEqual([
      'verification',
      'management_link',
      'access_request',
      'access_decision',
    ]);
    expect(JSON.stringify(capture.list())).toContain('/verify#token=verification-secret');
    expect(JSON.stringify(capture.list())).toContain('/manage#token=management-secret');
    expect(JSON.stringify(capture.list())).toContain('/access-review#token=review-secret');
    expect(JSON.stringify(capture.list())).not.toContain('?token=');
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('bounds retained secret material and can erase all captures', async () => {
    const { capture, provider } = createHarness(2);

    for (const rawToken of ['one', 'two', 'three']) {
      await provider.sendVerification({
        companyName: 'Acme',
        rawToken,
        toEmail: 'founder@gmail.com',
      });
    }

    expect(capture.list()).toHaveLength(2);
    expect(JSON.stringify(capture.list())).not.toContain('#token=one');
    expect(capture.get('dev-message-1')).toBeNull();
    capture.clear();
    expect(capture.list()).toEqual([]);
  });

  it('returns accepted delivery evidence without exposing the raw link', async () => {
    const { provider } = createHarness();

    await expect(
      provider.sendVerification({
        companyName: 'Acme',
        rawToken: 'verification-secret',
        toEmail: 'founder@gmail.com',
      }),
    ).resolves.toEqual({
      acceptedAt: new Date('2026-08-30T00:00:00.000Z'),
      messageId: 'dev-message-1',
    });
  });
});

describe('unavailable email provider', () => {
  it('fails with a typed service-unavailable error', async () => {
    await expect(
      unavailableEmailProvider.sendVerification({
        companyName: 'Acme',
        rawToken: 'never-delivered',
        toEmail: 'founder@gmail.com',
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryUnavailableError);
    await expect(
      unavailableEmailProvider.sendManagementLink({
        companyName: 'Acme',
        rawToken: 'never-delivered',
        toEmail: 'founder@gmail.com',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_UNAVAILABLE', statusCode: 503 });
  });
});
