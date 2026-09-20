import { CompetitionPage } from '@/components/competition/competition-page';
import { publicPageMetadata } from '@/lib/metadata';
export const dynamic = 'force-dynamic';
export const metadata = publicPageMetadata({
  title: 'leaderboard',
  description: 'TakeOver competition, committed captures and frozen season standings.',
  path: '/leaderboard',
});
export default function Page() {
  return <CompetitionPage mode="leaderboard" />;
}
