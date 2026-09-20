import Link from 'next/link';
import { leaderboardSchema, seasonsSchema, type CompetitionStanding } from '@takeover/shared';
import { apiRequest } from '@/lib/api/client';
import { PageHeader } from '@/components/ui/page-header';
import { ActivityFeed } from './activity-feed';

function Standings({ rows }: { rows: CompetitionStanding[] }) {
  if (rows.length === 0)
    return <p className="py-8 text-[var(--color-muted)]">No territories are held yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="py-3">Rank</th>
            <th>Company</th>
            <th>Territories</th>
            <th>Categories</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.companyId} className="border-b border-[var(--color-border)]">
              <td className="py-4">{row.rank}</td>
              <td>
                {row.companySlug ? (
                  <Link className="underline" href={`/company/${row.companySlug}`}>
                    {row.companyName}
                  </Link>
                ) : (
                  row.companyName
                )}
              </td>
              <td>{row.territories}</td>
              <td>{row.categories}</td>
              <td className="font-semibold">{row.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function CompetitionPage({
  mode,
}: {
  mode: 'leaderboard' | 'activity' | 'seasons' | 'hall-of-fame';
}) {
  const title = {
    leaderboard: 'Leaderboard',
    activity: 'Live activity',
    seasons: 'Seasons',
    'hall-of-fame': 'Hall of Fame',
  }[mode];
  let content;
  try {
    if (mode === 'activity') content = <ActivityFeed />;
    else if (mode === 'leaderboard') {
      const data = await apiRequest({
        method: 'GET',
        path: '/api/leaderboard',
        schema: leaderboardSchema,
      });
      content = (
        <>
          <p className="mt-6 text-[var(--color-muted)]">
            {data.rules.territoryPoints} points per held territory + {data.rules.categoryPoints} per
            distinct category. Equal scores are ordered by company ID. Scoring {data.rules.version}.
          </p>
          <Standings rows={data.standings} />
        </>
      );
    } else {
      const data = await apiRequest({ method: 'GET', path: '/api/seasons', schema: seasonsSchema });
      content = (
        <>
          {mode === 'seasons' && (
            <section className="my-8 rounded-xl border border-[var(--color-border)] p-6">
              <h2 className="text-xl font-semibold">Season {data.current.number}</h2>
              <p className="mt-2">
                {new Date(data.current.startsAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })} –{' '}
                {new Date(data.current.endsAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}{' '}
                (UTC)
              </p>
              <p className="mt-3 text-[var(--color-muted)]">
                Paid territory ownership continues across seasons. Final rankings are frozen at the
                end boundary.
              </p>
            </section>
          )}
          {data.archives.length === 0 && (
            <p className="py-8 text-[var(--color-muted)]">
              The first season is underway. Completed seasons will appear here.
            </p>
          )}
          {data.archives.map((season) => (
            <section className="my-8" key={season.id}>
              <h2 className="text-xl font-semibold">
                Season {season.number} · ended{' '}
                {new Date(season.endsAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}
              </h2>
              <Standings
                rows={
                  mode === 'hall-of-fame'
                    ? (season.standings ?? []).slice(0, 3)
                    : (season.standings ?? [])
                }
              />
            </section>
          ))}
        </>
      );
    }
  } catch {
    content = (
      <p className="mt-8" role="alert">
        Competition data could not be loaded. Please try again shortly.
      </p>
    );
  }
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader title={title} />
      <nav aria-label="Competition" className="my-6 flex flex-wrap gap-5">
        {(['leaderboard', 'activity', 'seasons', 'hall-of-fame'] as const).map((page) => (
          <Link
            key={page}
            href={`/${page}`}
            aria-current={page === mode ? 'page' : undefined}
            className="capitalize underline"
          >
            {page.replaceAll('-', ' ')}
          </Link>
        ))}
      </nav>
      {content}
    </div>
  );
}
