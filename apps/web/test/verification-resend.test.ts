import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  VerificationResendView,
  resendDelaySuffix,
  type ResendState,
} from '../src/app/claim/verification-resend.js';

function render(state: ResendState): string {
  return renderToStaticMarkup(
    React.createElement(VerificationResendView, {
      state,
      contactEmail: 'founder@example.com',
      onResend: () => undefined,
    }),
  );
}

const idle: ResendState = { status: 'idle' };
const sending: ResendState = { status: 'sending' };
const sent: ResendState = { status: 'sent' };
const rateLimited: ResendState = {
  status: 'failed',
  code: 'RATE_LIMITED',
  requestId: 'req-123',
  retryAfterSeconds: 300,
};
const internal: ResendState = {
  status: 'failed',
  code: 'INTERNAL_ERROR',
  requestId: undefined,
  retryAfterSeconds: undefined,
};

describe('VerificationResendView', () => {
  it('offers the resend action and names the address it targets', () => {
    const html = render(idle);

    expect(html).toContain('Resend verification email');
    expect(html).toContain('founder@example.com');
    // Reissue revokes prior unconsumed challenges, so the copy must warn that
    // the old link dies — a user holding both emails must know which works.
    expect(html).toContain('previous link stops working');
  });

  it('shows the busy label while the resend is in flight', () => {
    const html = render(sending);

    expect(html).toContain('Resending…');
    expect(html).toContain('aria-busy="true"');
  });

  it('stays enumeration-safe on success: accepted, never dispatched', () => {
    const html = render(sent);

    // The API answers `accepted` whether or not the claim exists, so the copy
    // must not confirm an email was sent.
    expect(html).toContain('Resend accepted');
    expect(html).not.toContain('has been sent');
    expect(html).toContain('on its way');
  });

  it('tells the user a stale resend cannot be re-opened and an expired claim must be resubmitted', () => {
    const html = render(sent);

    expect(html).toContain('newest');
    expect(html).toContain('expired');
    expect(html).toContain('Submit the claim form again');
  });

  it('renders the rate-limit wait from the Retry-After value', () => {
    const html = render(rateLimited);

    expect(html).toContain('Too many attempts');
    expect(html).toContain('about 5 minutes');
    expect(html).toContain('Reference req-123');
  });

  it('omits the wait suffix for non-rate-limit failures', () => {
    const html = render(internal);

    expect(html).toContain('Something went wrong');
    expect(html).not.toContain('Try again in about');
  });

  it('never leaks a request reference that does not exist', () => {
    expect(render(internal)).not.toContain('Reference');
  });
});

describe('resendDelaySuffix', () => {
  it('rounds up to whole minutes and pluralises', () => {
    expect(resendDelaySuffix(undefined)).toBe('');
    expect(resendDelaySuffix(0)).toBe('');
    expect(resendDelaySuffix(60)).toBe(' Try again in about 1 minute.');
    expect(resendDelaySuffix(61)).toBe(' Try again in about 2 minutes.');
  });
});
