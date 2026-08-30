import type { Metadata } from 'next';
import { buildPageTitle } from '@/lib/site';
import { AccessReview } from './access-review';

export const metadata: Metadata = {
  title: buildPageTitle('Review access request'),
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccessReviewPage({ searchParams }: PageProps) {
  const query = await searchParams;
  // Forward-compatible: the review link does not carry this yet.
  const raw = query.requestId;
  const accessRequestId = typeof raw === 'string' && raw.length > 0 ? raw : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
        Review an access request
      </h1>
      <div className="mt-6">
        <AccessReview accessRequestId={accessRequestId} />
      </div>
    </div>
  );
}
