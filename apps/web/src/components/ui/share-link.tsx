'use client';

import { useState } from 'react';
import { publicShareUrl } from '@/lib/share';

export function ShareLink({ path, title }: { path: string; title: string }) {
  const [message, setMessage] = useState('');
  async function share() {
    try {
      const url = publicShareUrl(window.location.origin, path);
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, url });
        setMessage('Share options opened.');
      } else {
        await navigator.clipboard.writeText(url);
        setMessage('Public link copied.');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setMessage('Unable to copy the link. Use your browser’s address bar to share this public page.');
    }
  }
  return <div className="mt-4 flex flex-wrap items-center gap-3">
    <button type="button" onClick={() => void share()} className="min-h-11 rounded border border-[var(--color-border)] px-4 text-sm hover:bg-[var(--color-surface-raised)] focus-visible:outline focus-visible:outline-2">Share</button>
    <span role="status" className="text-sm text-[var(--color-muted)]">{message}</span>
  </div>;
}
