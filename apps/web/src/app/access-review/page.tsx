import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { privatePageMetadata } from '@/lib/metadata';
import { AccessReview } from './access-review';

export const metadata: Metadata = privatePageMetadata('Review access request');

export default function AccessReviewPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PageHeader title="Review an access request" />
      <div className="mt-6">
        <AccessReview />
      </div>
    </div>
  );
}
