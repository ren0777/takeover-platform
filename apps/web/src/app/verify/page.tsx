import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { privatePageMetadata } from '@/lib/metadata';
import { VerifyExchange } from './verify-exchange';

export const metadata: Metadata = privatePageMetadata('Verify your email');

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PageHeader title="Verify your contact email" />
      <div className="mt-6">
        <VerifyExchange />
      </div>
    </div>
  );
}
