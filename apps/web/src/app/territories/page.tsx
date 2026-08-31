import type { Metadata } from 'next';
import { CategoryFilter } from '@/components/territory/category-filter';
import { TerritoryMosaic } from '@/components/territory/territory-mosaic';
import { PageHeader } from '@/components/ui/page-header';
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

  const [territories, categories] = await Promise.all([getTerritories(), getTerritoryCategories()]);

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
