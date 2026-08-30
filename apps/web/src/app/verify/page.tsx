import type { Metadata } from 'next';
import { buildPageTitle } from '@/lib/site';
import { VerifyExchange } from './verify-exchange';

export const metadata: Metadata = {
  title: buildPageTitle('Verify your email'),
  // Capability landing, not public content.
  robots: { index: false, follow: false },
};

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
        Verify your contact email
      </h1>
      <div className="mt-6">
        <VerifyExchange />
      </div>
    </div>
  );
}
