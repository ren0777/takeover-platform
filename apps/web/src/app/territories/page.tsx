import type { Metadata } from 'next';
import type { TerritoryCategory, TerritorySummary } from '@takeover/shared';
import { CategoryFilter } from '@/components/territory/category-filter';
import { TerritoryMosaic } from '@/components/territory/territory-mosaic';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import { describeReadFailure } from '@/lib/data/failure';
import { getTerritories, getTerritoryCategories } from '@/lib/data/territories';
import { publicPageMetadata } from '@/lib/metadata';

export const metadata: Metadata = publicPageMetadata({
  title: 'Territories',
  description: 'Every internet territory on TakeOver, and which company controls it.',
  path: '/territories',
});

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TerritoriesPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const raw = query.category;
  const activeSlug = typeof raw === 'string' && raw.length > 0 ? raw : null;

  let territories: TerritorySummary[];
  let categories: TerritoryCategory[];
  try {
    [territories, categories] = await Promise.all([getTerritories(), getTerritoryCategories()]);
  } catch (error: unknown) {
    // No fixture fallback and no empty board: an unreadable board says so.
    const failure = describeReadFailure(error, 'the territory board');
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <PageHeader title="Territories" />
        <div className="mt-6">
          <ErrorState
            title={failure.title}
            description={<p>{failure.description}</p>}
            {...(failure.requestId === undefined ? {} : { requestId: failure.requestId })}
          />
        </div>
      </div>
    );
  }

  const visible =
    activeSlug === null
      ? territories
      : territories.filter((territory) => territory.category.slug === activeSlug);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Territories"
        description="One company holds each territory. Tile size reflects its weight, not its price — and position carries no meaning."
      />

      <div className="mt-6">
        <CategoryFilter categories={categories} activeSlug={activeSlug} />
      </div>

      <p className="mt-4 text-sm text-[var(--color-muted)]">
        {visible.length} {visible.length === 1 ? 'territory' : 'territories'}
      </p>

      <div className="mt-4">
        <TerritoryMosaic territories={visible} />
      </div>
    </div>
  );
}
