'use client';

import { useState, type FormEvent } from 'react';
import { type TakeoverIntent, type TakeoverPreparationRequest } from '@takeover/shared';
import { Notice } from '@/components/ui/notice';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ApiRequestError } from '@/lib/api/client';
import { updateTakeoverPreparation } from '@/lib/api/identity';
import { describeIdentityError } from '@/lib/identity/error-copy';
import { formatMoney, parseMajorAmountToMinor } from '@/lib/format/money';

type PrepState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'saved'; intent: TakeoverIntent }
  | { status: 'invalid'; message: string }
  | { status: 'failed'; code: string; requestId: string | undefined };

export function TakeoverPreparationForm({
  intentId,
  currency,
}: {
  intentId: string;
  currency: string;
}) {
  const [state, setState] = useState<PrepState>({ status: 'idle' });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const territoryExternalRef = String(form.get('territoryExternalRef') ?? '').trim();
    const bidInput = String(form.get('intendedBid') ?? '').trim();

    const request: TakeoverPreparationRequest = { territoryExternalRef };

    if (bidInput.length > 0) {
      const amountMinor = parseMajorAmountToMinor(bidInput, currency);
      if (amountMinor === null || amountMinor <= 0) {
        setState({
          status: 'invalid',
          message: 'Enter a positive amount with no more precision than the currency allows.',
        });
        return;
      }
      request.intendedBid = { amountMinor, currency };
    }

    setState({ status: 'submitting' });
    try {
      const intent = await updateTakeoverPreparation(intentId, request);
      setState({ status: 'saved', intent });
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        setState({ status: 'failed', code: error.code, requestId: error.requestId });
        return;
      }
      setState({ status: 'failed', code: 'INTERNAL_ERROR', requestId: undefined });
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 max-w-md space-y-4">
      <FormField
        id="territoryExternalRef"
        name="territoryExternalRef"
        label="Territory reference"
        required
        disabled={state.status === 'submitting'}
        hint="Territories are not modelled yet, so this is an opaque reference only."
      />
      <FormField
        id="intendedBid"
        name="intendedBid"
        label={`Intended bid (${currency})`}
        disabled={state.status === 'submitting'}
        hint="Recorded for reference. It does not reserve a price or create a charge."
      />

      <Button
        type="submit"
        variant="secondary"
        fullWidth
        busy={state.status === 'submitting'}
        busyLabel="Saving…"
      >
        Save preparation
      </Button>

      {state.status === 'invalid' && (
        <Notice variant="error" title="Check the amount">
          <p>{state.message}</p>
        </Notice>
      )}

      {state.status === 'failed' && (
        <Notice
          variant="error"
          title={describeIdentityError(state.code).title}
          {...(state.requestId === undefined ? {} : { requestId: state.requestId })}
        >
          <p>{describeIdentityError(state.code).message}</p>
        </Notice>
      )}

      {state.status === 'saved' && (
        <Notice variant="info" title="Preparation saved">
          <p>
            Status{' '}
            <span className="font-[family-name:var(--font-mono)]">{state.intent.status}</span>. This
            snapshot is {state.intent.quoteAuthority.replace('_', ' ')} and does not lock a price.
          </p>
          {state.intent.intendedBid !== undefined && (
            <p className="mt-1">Recorded bid {formatMoney(state.intent.intendedBid)}.</p>
          )}
          <p className="mt-2">Checkout remains unavailable.</p>
        </Notice>
      )}
    </form>
  );
}
