import type { Clock, ReconciliationDriverRepository, TakeoverService } from './service.js';

type ReconciliationDriverLogger = {
  debug(input: Record<string, unknown>, message: string): void;
  error(input: Record<string, unknown>, message: string): void;
  info(input: Record<string, unknown>, message: string): void;
  warn(input: Record<string, unknown>, message: string): void;
};

export type ReconciliationDriverRunResult = {
  discovered: number;
  failed: number;
  processed: number;
};

export type TakeoverReconciliationDriverOptions = {
  batchSize: number;
  clock: Clock;
  intervalMs?: number;
  logger: ReconciliationDriverLogger;
  repository: ReconciliationDriverRepository;
  service: Pick<TakeoverService, 'requestRefundForReconciliation'>;
};

export class TakeoverReconciliationDriver {
  private running = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: TakeoverReconciliationDriverOptions) {}

  async runOnce(): Promise<ReconciliationDriverRunResult> {
    if (this.running) {
      this.options.logger.debug(
        { event: 'takeover.reconciliation.overlap_skipped' },
        'Takeover reconciliation run skipped because another run is active',
      );
      return { discovered: 0, failed: 0, processed: 0 };
    }

    this.running = true;
    let failed = 0;
    let processed = 0;
    try {
      const paymentIds = await this.options.repository.findRefundReconciliationCandidates({
        limit: this.options.batchSize,
        now: this.options.clock.now(),
      });

      for (const paymentId of paymentIds) {
        this.options.logger.info(
          { event: 'takeover.reconciliation.discovered', paymentId },
          'Takeover reconciliation obligation discovered',
        );
        try {
          await this.options.service.requestRefundForReconciliation(paymentId);
          processed += 1;
        } catch (error) {
          failed += 1;
          this.options.logger.warn(
            { err: error, event: 'takeover.reconciliation.retryable_failure', paymentId },
            'Takeover reconciliation obligation failed and will be retried',
          );
        }
      }

      return { discovered: paymentIds.length, failed, processed };
    } finally {
      this.running = false;
    }
  }

  start(): void {
    if (this.timer !== undefined || this.options.intervalMs === undefined) return;
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.options.logger.error(
          { err: error, event: 'takeover.reconciliation.run_failed' },
          'Takeover reconciliation run failed',
        );
      });
    }, this.options.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
