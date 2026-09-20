'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { activityPageSchema, activityItemSchema, type ActivityPage } from '@takeover/shared';
import { apiRequest } from '@/lib/api/client';

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityPage['items']>([]);
  const [status, setStatus] = useState('Loading committed captures…');
  useEffect(() => {
    let disposed = false;
    let source: EventSource | undefined;
    async function start() {
      try {
        const page = await apiRequest({
          method: 'GET',
          path: '/api/activity?latest=true',
          schema: activityPageSchema,
        });
        if (disposed) return;
        setItems(page.items);
        source = new EventSource(`/api/activity/stream?cursor=${page.nextCursor}`);
        source.onopen = () => setStatus('Connected · committed captures only');
        source.onerror = () =>
          setStatus('Reconnecting… missed captures will replay automatically.');
        source.addEventListener('capture', (event: MessageEvent<string>) => {
          try {
            const item = activityItemSchema.parse(JSON.parse(event.data));
            setItems((previous) =>
              previous.some((row) => row.id === item.id)
                ? previous
                : [...previous, item].slice(-200),
            );
          } catch {
            setStatus('An unreadable update was received. Reload to recover.');
            source?.close();
          }
        });
      } catch {
        if (!disposed) setStatus('Activity could not be loaded. Reload to try again.');
      }
    }
    void start();
    return () => {
      disposed = true;
      source?.close();
    };
  }, []);
  return (
    <section>
      <p className="text-sm text-[var(--color-muted)]" role="status">
        {status}
      </p>
      {items.length === 0 && <p className="my-8">No capture activity to display.</p>}
      <ol className="mt-6">
        {[...items].reverse().map((item) => (
          <li key={item.id} className="border-b border-[var(--color-border)] py-4">
            {item.companySlug ? (
              <Link className="font-semibold underline" href={`/company/${item.companySlug}`}>
                {item.companyName}
              </Link>
            ) : (
              item.companyName
            )}{' '}
            captured{' '}
            <Link className="underline" href={`/territory/${item.territorySlug}`}>
              {item.territoryName}
            </Link>
            <time className="ml-3 text-sm text-[var(--color-muted)]" dateTime={item.capturedAt}>
              {new Date(item.capturedAt).toLocaleString()}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
