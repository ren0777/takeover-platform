/**
 * DEVELOPMENT-ONLY FIXTURE DATA — NOT PRODUCTION DATA.
 *
 * Phase 2 publishes the territory contracts but not yet the public read APIs,
 * so these records stand in until `GET /api/territories` exists. They are
 * reached only through `src/lib/data/*`; never import this from a component.
 *
 * Every record is parsed through the real `@takeover/shared` schemas at module
 * load. Those schemas are `.strict()`, so any drift between these fixtures and
 * the authoritative contract fails immediately and loudly rather than silently
 * shipping a shape the live API would reject.
 *
 * Delete this file once the public territory endpoints exist.
 */
import {
  companyPublicSummarySchema,
  territoryCategorySchema,
  territoryDetailSchema,
  territoryHistoryEntrySchema,
  territorySummarySchema,
  type CompanyPublicSummary,
  type TerritoryCategory,
  type TerritoryDetail,
  type TerritoryHistoryEntry,
  type TerritorySummary,
} from '@takeover/shared';

function id(seed: string): string {
  // Deterministic uuid-shaped identifiers so fixtures are stable across runs.
  // The seed is hashed rather than used directly, because arbitrary text is not
  // valid hex and would fail the contract's uuid validation.
  let hash = 0x811c9dc5;
  let hex = '';
  for (let index = 0; hex.length < 32; index += 1) {
    hash ^= seed.charCodeAt(index % seed.length) + index;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hex += hash.toString(16).padStart(8, '0');
  }
  const digits = hex.slice(0, 32);
  return [
    digits.slice(0, 8),
    digits.slice(8, 12),
    `4${digits.slice(13, 16)}`,
    `8${digits.slice(17, 20)}`,
    digits.slice(20, 32),
  ].join('-');
}

const CATEGORIES: TerritoryCategory[] = [
  { id: id('cat0aic0de'), slug: 'ai', name: 'AI', description: 'Models, agents, and generation.' },
  { id: id('cat0devt00ls'), slug: 'developer-tools', name: 'Developer tools' },
  { id: id('cat0design0'), slug: 'design', name: 'Design' },
  { id: id('cat0infra00'), slug: 'infrastructure', name: 'Infrastructure' },
  { id: id('cat0data000'), slug: 'data', name: 'Data' },
].map((category) => territoryCategorySchema.parse(category));

function category(slug: string): TerritoryCategory {
  const found = CATEGORIES.find((entry) => entry.slug === slug);
  if (found === undefined) throw new Error(`Unknown fixture category: ${slug}`);
  return found;
}

const COMPANIES: Record<string, CompanyPublicSummary> = Object.fromEntries(
  (
    [
      ['northwind', 'Northwind Labs', 'active', ['contact_verified']],
      ['stratacore', 'Stratacore', 'active', ['contact_verified', 'domain_verified']],
      ['pixelforge', 'Pixelforge', 'active', ['contact_verified']],
      ['halcyon', 'Halcyon Systems', 'suspended', ['contact_verified']],
      ['meridian', 'Meridian Data', 'active', []],
    ] as const
  ).map(([slug, name, status, levels]) => [
    slug,
    companyPublicSummarySchema.parse({
      id: id(`co${slug}`),
      slug,
      name,
      websiteUrl: `https://${slug}.example.com`,
      logoUrl: `https://${slug}.example.com/logo.png`,
      status,
      verificationLevels: levels,
    }),
  ]),
);

function owner(slug: string): CompanyPublicSummary {
  const found = COMPANIES[slug];
  if (found === undefined) throw new Error(`Unknown fixture company: ${slug}`);
  return found;
}

type TerritorySeed = {
  slug: string;
  name: string;
  description: string;
  categorySlug: string;
  displayWeight: number;
  status: 'unclaimed' | 'claimed' | 'disabled';
  ownerSlug?: string;
  previousOwnerSlug?: string;
  capturedAt?: string;
  source?: 'initial_seed' | 'paid_capture';
  accentColor?: string;
};

const SEEDS: TerritorySeed[] = [
  {
    slug: 'ai-coding',
    name: 'AI Coding',
    description: 'Assistants and agents that write, review, and refactor software.',
    categorySlug: 'ai',
    displayWeight: 98,
    status: 'claimed',
    ownerSlug: 'northwind',
    previousOwnerSlug: 'stratacore',
    capturedAt: '2026-08-24T09:15:00.000Z',
    source: 'paid_capture',
    accentColor: '#7C5CFF',
  },
  {
    slug: 'ai-video',
    name: 'AI Video',
    description: 'Generating, editing, and directing moving images with models.',
    categorySlug: 'ai',
    displayWeight: 88,
    status: 'claimed',
    ownerSlug: 'stratacore',
    capturedAt: '2026-08-27T18:40:00.000Z',
    source: 'paid_capture',
  },
  {
    slug: 'ai-image-generation',
    name: 'AI Image Generation',
    description: 'Text to image, editing, and generative visual tooling.',
    categorySlug: 'ai',
    displayWeight: 72,
    status: 'unclaimed',
  },
  {
    slug: 'design',
    name: 'Design',
    description: 'Interface design, prototyping, and design systems.',
    categorySlug: 'design',
    displayWeight: 84,
    status: 'claimed',
    ownerSlug: 'pixelforge',
    capturedAt: '2026-07-30T11:05:00.000Z',
    source: 'initial_seed',
    accentColor: '#E9B949',
  },
  {
    slug: 'developer-tools',
    name: 'Developer Tools',
    description: 'Editors, terminals, and the daily surface of building software.',
    categorySlug: 'developer-tools',
    displayWeight: 66,
    status: 'claimed',
    ownerSlug: 'halcyon',
    capturedAt: '2026-08-11T07:20:00.000Z',
    source: 'paid_capture',
  },
  {
    slug: 'hosting',
    name: 'Hosting',
    description: 'Where applications actually run.',
    categorySlug: 'infrastructure',
    displayWeight: 61,
    status: 'claimed',
    ownerSlug: 'meridian',
    capturedAt: '2026-08-19T22:00:00.000Z',
    source: 'initial_seed',
  },
  {
    slug: 'observability',
    name: 'Observability',
    description: 'Traces, metrics, and knowing what production is doing.',
    categorySlug: 'infrastructure',
    displayWeight: 54,
    status: 'unclaimed',
  },
  {
    slug: 'databases',
    name: 'Databases',
    description: 'Durable state and the systems that guard it.',
    categorySlug: 'data',
    displayWeight: 47,
    status: 'claimed',
    ownerSlug: 'meridian',
    capturedAt: '2026-06-02T13:30:00.000Z',
    source: 'initial_seed',
  },
  {
    slug: 'analytics',
    name: 'Analytics',
    description: 'Measuring what people do and deciding what it means.',
    categorySlug: 'data',
    displayWeight: 40,
    status: 'unclaimed',
  },
  {
    slug: 'automation',
    name: 'Automation',
    description: 'Wiring systems together so work happens without a human.',
    categorySlug: 'developer-tools',
    displayWeight: 33,
    status: 'claimed',
    ownerSlug: 'northwind',
    capturedAt: '2026-08-29T16:45:00.000Z',
    source: 'paid_capture',
  },
  {
    slug: 'design-tokens',
    name: 'Design Tokens',
    description: 'The shared vocabulary between design and code.',
    categorySlug: 'design',
    displayWeight: 22,
    status: 'unclaimed',
  },
  {
    slug: 'edge-compute',
    name: 'Edge Compute',
    description: 'Running code close to the person asking for it.',
    categorySlug: 'infrastructure',
    displayWeight: 18,
    status: 'disabled',
  },
];

function buildSummary(seed: TerritorySeed): TerritorySummary {
  const ownership =
    seed.ownerSlug === undefined
      ? undefined
      : {
          id: id(`own${seed.slug}`),
          owner: owner(seed.ownerSlug),
          ...(seed.previousOwnerSlug === undefined
            ? {}
            : { previousOwner: owner(seed.previousOwnerSlug) }),
          capturedAt: seed.capturedAt ?? '2026-08-01T00:00:00.000Z',
          territoryVersion: String(seed.displayWeight * 7 + 3),
          source: seed.source ?? 'initial_seed',
        };

  return territorySummarySchema.parse({
    id: id(`ter${seed.slug}`),
    slug: seed.slug,
    name: seed.name,
    description: seed.description,
    category: category(seed.categorySlug),
    displayWeight: seed.displayWeight,
    status: seed.status,
    visualMetadata: seed.accentColor === undefined ? {} : { accentColor: seed.accentColor },
    version: String(seed.displayWeight * 7 + 3),
    ...(ownership === undefined ? {} : { currentOwnership: ownership }),
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  });
}

export const TERRITORY_FIXTURES: TerritorySummary[] = SEEDS.map(buildSummary);

export const TERRITORY_CATEGORY_FIXTURES: TerritoryCategory[] = CATEGORIES;

export const COMPANY_FIXTURES: CompanyPublicSummary[] = Object.values(COMPANIES);

/** Ownership history, newest first. Only slugs that exist above are referenced. */
const HISTORY_SEEDS: Record<string, Array<{ ownerSlug: string; from: string; to?: string }>> = {
  'ai-coding': [
    { ownerSlug: 'northwind', from: '2026-08-24T09:15:00.000Z' },
    { ownerSlug: 'stratacore', from: '2026-08-02T10:00:00.000Z', to: '2026-08-24T09:15:00.000Z' },
    { ownerSlug: 'pixelforge', from: '2026-07-18T08:30:00.000Z', to: '2026-08-02T10:00:00.000Z' },
    { ownerSlug: 'halcyon', from: '2026-07-01T12:00:00.000Z', to: '2026-07-18T08:30:00.000Z' },
    { ownerSlug: 'meridian', from: '2026-06-15T09:00:00.000Z', to: '2026-07-01T12:00:00.000Z' },
    { ownerSlug: 'northwind', from: '2026-06-01T00:00:00.000Z', to: '2026-06-15T09:00:00.000Z' },
  ],
};

export function historyFor(slug: string): TerritoryHistoryEntry[] {
  const seeds = HISTORY_SEEDS[slug] ?? [];

  return seeds.map((entry, index) =>
    territoryHistoryEntrySchema.parse({
      id: id(`his${slug}${index}`),
      owner: owner(entry.ownerSlug),
      capturedAt: entry.from,
      ...(entry.to === undefined ? {} : { endedAt: entry.to }),
      territoryVersion: String(100 - index),
      source: index === seeds.length - 1 ? 'initial_seed' : 'paid_capture',
    }),
  );
}

/** Detail adds the server-provided five-entry preview. */
export function detailFor(summary: TerritorySummary): TerritoryDetail {
  return territoryDetailSchema.parse({
    ...summary,
    ownershipHistoryPreview: historyFor(summary.slug).slice(0, 5),
  });
}
