import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { privatePageMetadata } from '@/lib/metadata';
import { AccessReview } from './access-review';

export const metadata: Metadata = privatePageMetadata('Review access request');

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
      <PageHeader title="Review an access request" />
      <div className="mt-6">
        <AccessReview accessRequestId={accessRequestId} />
      </div>
    </div>
  );
}
