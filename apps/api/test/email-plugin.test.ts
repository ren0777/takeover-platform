import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseApiConfig } from '../src/config/env.js';
import { EmailDeliveryUnavailableError } from '../src/integrations/email/unavailable-email-provider.js';
import { emailPlugin } from '../src/plugins/email.js';

const apps: Array<ReturnType<typeof Fastify>> = [];

function createApp() {
  const app = Fastify({ logger: false });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('emailPlugin', () => {
  it('writes development capability links to the application log only when enabled', async () => {
    const app = createApp();
    const info = vi.spyOn(app.log, 'info').mockImplementation(() => undefined);
    const config = parseApiConfig({
      DEV_EMAIL_LOG_ENABLED: 'true',
      EMAIL_PROVIDER: 'development',
      WEB_APP_ORIGIN: 'http://localhost:3100',
    });

    const capture = await emailPlugin(app, config);
    await app.emailProvider.sendVerification({
      companyName: 'Acme',
      rawToken: 'verification-secret',
      toEmail: 'founder@gmail.com',
    });

    expect(capture?.list()).toHaveLength(1);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'email.development.captured',
        link: 'http://localhost:3100/verify#token=verification-secret',
        type: 'verification',
      }),
      expect.any(String),
    );
  });

  it('keeps development captures out of the log by default', async () => {
    const app = createApp();
    const info = vi.spyOn(app.log, 'info').mockImplementation(() => undefined);
    const config = parseApiConfig({ EMAIL_PROVIDER: 'development' });

    const capture = await emailPlugin(app, config);
    await app.emailProvider.sendVerification({
      companyName: 'Acme',
      rawToken: 'verification-secret',
      toEmail: 'founder@gmail.com',
    });

    expect(capture?.list()).toHaveLength(1);
    expect(info).not.toHaveBeenCalled();
  });

  it('fails closed when delivery is unavailable', async () => {
    const app = createApp();
    const config = parseApiConfig({ EMAIL_PROVIDER: 'unavailable' });

    const capture = await emailPlugin(app, config);

    expect(capture).toBeNull();
    await expect(
      app.emailProvider.sendVerification({
        companyName: 'Acme',
        rawToken: 'never-delivered',
        toEmail: 'founder@gmail.com',
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryUnavailableError);
  });
});
