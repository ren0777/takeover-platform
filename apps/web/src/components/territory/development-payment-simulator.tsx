'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { ApiRequestError, readCsrfToken } from '@/lib/api/client';

/**
 * DEV ONLY — drives the local payment simulator.
 *
 * Rendered only for an attempt the server itself marked simulated, and every
 * action posts to a development-only endpoint that signs a provider event and
 * replays it through the normal webhook route. No money can move: there is no
 * provider, no card, and no network call to anything outside this machine.
 */

type SimulatedOutcome = {
  description: string;
  label: string;
  primary?: boolean;
  value: string;
};

const OUTCOMES: SimulatedOutcome[] = [
  {
    description: 'Settles the payment, captures the territory and raises the next price by 20%.',
    label: 'Simulate successful payment',
    primary: true,
    value: 'success',
  },
  {
    description: 'A declined payment. Nothing is captured and no price changes.',
    label: 'Simulate failed payment',
    value: 'failure',
  },
  {
    description: 'A payment still in flight. Recorded as a receipt only.',
    label: 'Simulate pending payment',
    value: 'pending',
  },
  {
    description: 'An event the processor does not recognise. It must be ignored, not guessed.',
    label: 'Simulate unknown outcome',
    value: 'unknown',
  },
  {
    description: 'The same settled payment announced twice. It must capture only once.',
    label: 'Simulate duplicate success',
    value: 'duplicate_success',
  },
  {
    description: 'A failure arriving after the money settled. It must not undo the capture.',
    label: 'Simulate late failure after success',
    value: 'late_failure',
  },
];

type SimulationState =
  | { status: 'idle' }
  | { status: 'running'; outcome: string }
  | { status: 'done'; outcome: string }
  | { status: 'failed'; message: string };

export function DevelopmentPaymentSimulator({ statusToken }: { statusToken: string }) {
  const [state, setState] = useState<SimulationState>({ status: 'idle' });

  async function simulate(outcome: string) {
    setState({ status: 'running', outcome });
    try {
      const csrfToken = readCsrfToken();
      const response = await fetch('/api/dev/payment-simulations', {
        body: JSON.stringify({ outcome, statusToken }),
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          ...(csrfToken === null ? {} : { 'x-csrf-token': csrfToken }),
        },
        method: 'POST',
      });
      if (!response.ok) {
        setState({
          status: 'failed',
          message: `The simulator refused this request (HTTP ${response.status}). Nothing changed.`,
        });
        return;
      }
      setState({ status: 'done', outcome });
      // The authoritative outcome lives on the server; re-read it rather than
      // claiming anything here.
      window.location.reload();
    } catch (error: unknown) {
      setState({
        status: 'failed',
        message:
          error instanceof ApiRequestError
            ? error.message
            : 'The simulator could not be reached. Nothing changed.',
      });
    }
  }

  const busy = state.status === 'running';

  return (
    <section className="mt-8 rounded-[var(--radius-control)] border-2 border-dashed border-[var(--color-warning)] p-4">
      <p className="font-[family-name:var(--font-mono)] text-xs font-bold tracking-widest text-[var(--color-warning)] uppercase">
        Dev only — no real charge
      </p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-lg font-bold">
        Local payment simulator
      </h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        This attempt was created by a local simulator, not a payment provider. No card, no money and
        no external request is involved. Each action signs a provider event and replays it through
        the normal webhook route, so the real capture and reconciliation rules decide what happens.
      </p>

      <div className="mt-4 space-y-3">
        {OUTCOMES.map((outcome) => (
          <div key={outcome.value}>
            <Button
              variant={outcome.primary === true ? 'primary' : 'secondary'}
              onClick={() => void simulate(outcome.value)}
              busy={busy && state.status === 'running' && state.outcome === outcome.value}
              busyLabel="Sending simulated event…"
              disabled={busy}
            >
              {outcome.label}
            </Button>
            <p className="mt-1 text-xs text-[var(--color-muted)]">{outcome.description}</p>
          </div>
        ))}
      </div>

      {state.status === 'failed' && (
        <div className="mt-4">
          <Notice variant="error" title="The simulation did not run">
            <p>{state.message}</p>
          </Notice>
        </div>
      )}
    </section>
  );
}
