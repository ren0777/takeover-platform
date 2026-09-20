import { CompetitionPage } from '@/components/competition/competition-page';
import { publicPageMetadata } from '@/lib/metadata';
export const dynamic = 'force-dynamic';
export const metadata = publicPageMetadata({
  title: 'hall-of-fame',
  description: 'TakeOver competition, committed captures and frozen season standings.',
  path: '/hall-of-fame',
});
export default function Page() {
  return <CompetitionPage mode="hall-of-fame" />;
}
