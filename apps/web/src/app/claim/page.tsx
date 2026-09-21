import type { Metadata } from 'next';
import Link from 'next/link';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { describeReadFailure } from '@/lib/data/failure';
import { getTerritoryBySlug } from '@/lib/data/territories';
import { privatePageMetadata } from '@/lib/metadata';
import { ClaimForm } from './claim-form';

export const metadata: Metadata = privatePageMetadata('Claim a company');

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function boardLink(label = 'Choose a territory on the board') {
  return (
    <Link
      href="/territories"
      className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-[var(--color-foreground)] px-4 text-sm font-semibold text-[#09090b]"
    >
      {label}
    </Link>
  );
}

/**
 * Claiming always starts from a territory. The page resolves the board's
 * slug against the live API so the person sees the territory as it is now;
 * an absent, unknown, or disabled territory gets an explanation, not a form
 * that would record a reference the server cannot act on.
 */
export default async function ClaimPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const raw = query.territory;
  const slug = typeof raw === 'string' && SLUG_PATTERN.test(raw) ? raw : null;

  let body: React.ReactNode;
  if (slug === null) {
    body = (
      <div className="space-y-4">
        <Notice variant="info" title="Start from the territory board">
          <p>
            Pick the territory you want to claim; it stays attached while you verify your email.
          </p>
        </Notice>
        {boardLink()}
      </div>
    );
  } else {
    try {
      const territory = await getTerritoryBySlug(slug);
      if (territory === null) {
        body = (
          <div className="space-y-4">
            <Notice variant="warning" title="That territory does not exist">
              <p>
                No territory matches{' '}
                <span className="font-[family-name:var(--font-mono)]">{slug}</span>. Nothing was
                created.
              </p>
            </Notice>
            {boardLink('Back to the board')}
          </div>
        );
      } else if (territory.status === 'disabled') {
        body = (
          <div className="space-y-4">
            <Notice variant="warning" title={`${territory.name} is unavailable`}>
              <p>It cannot be claimed or captured right now. Nothing was created.</p>
            </Notice>
            {boardLink('Choose another territory')}
          </div>
        );
      } else {
        body = <ClaimForm territory={territory} />;
      }
    } catch (error: unknown) {
      const failure = describeReadFailure(error, 'the territory');
      body = (
        <Notice
          variant="error"
          title={failure.title}
          {...(failure.requestId === undefined ? {} : { requestId: failure.requestId })}
        >
          <p>{failure.description}</p>
        </Notice>
      );
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Claim a company"
        description="No account and no password. Enter your company details and verify your email — that creates a private draft. Capturing territory is a separate step that is not available yet."
      />
      <div className="mt-6">{body}</div>
    </div>
  );
}
