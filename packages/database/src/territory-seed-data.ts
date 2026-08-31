import type { TerritorySeedDefinition } from './territory-seed.js';

type TerritoryRow = [
  slug: string,
  name: string,
  description: string,
  categoryNumber: number,
  displayWeight: number,
  iconKey: string,
  accentColor: string,
];

const territoryRows: TerritoryRow[] = [
  ['ai-coding', 'AI Coding', 'AI-assisted software creation, review, and developer workflows.', 1, 100, 'code-2', '#A78BFA'],
  ['ai-image-generation', 'AI Image Generation', 'Generative tools for creating and editing visual imagery.', 1, 90, 'image', '#A78BFA'],
  ['ai-video', 'AI Video', 'AI-native video generation, editing, and production.', 1, 85, 'video', '#A78BFA'],
  ['ai-search', 'AI Search', 'Search and answer experiences powered by artificial intelligence.', 1, 80, 'search', '#A78BFA'],
  ['ai-agents', 'AI Agents', 'Autonomous and assisted agents that execute multi-step work.', 1, 95, 'bot', '#A78BFA'],
  ['ides', 'IDEs', 'Environments for writing, navigating, and debugging software.', 2, 75, 'panels-top-left', '#22D3EE'],
  ['api-tools', 'API Tools', 'Products for designing, testing, documenting, and operating APIs.', 2, 65, 'plug', '#22D3EE'],
  ['testing', 'Testing', 'Tools for automated software quality and test execution.', 2, 55, 'flask-conical', '#22D3EE'],
  ['ci-cd', 'CI/CD', 'Continuous integration, delivery, and deployment tooling.', 2, 60, 'workflow', '#22D3EE'],
  ['ui-design', 'UI Design', 'Tools for designing interfaces and reusable visual systems.', 3, 70, 'pen-tool', '#F472B6'],
  ['prototyping', 'Prototyping', 'Products for turning concepts into interactive product prototypes.', 3, 55, 'frame', '#F472B6'],
  ['creative-tools', 'Creative Tools', 'Software for digital illustration, media, and creative production.', 3, 60, 'palette', '#F472B6'],
  ['notes', 'Notes', 'Products for capturing, organizing, and retrieving knowledge.', 4, 55, 'notebook', '#FBBF24'],
  ['project-management', 'Project Management', 'Tools for planning, coordinating, and tracking team delivery.', 4, 70, 'kanban', '#FBBF24'],
  ['automation', 'Automation', 'Products that connect systems and automate repeatable work.', 4, 75, 'zap', '#FBBF24'],
  ['hosting', 'Hosting', 'Platforms for deploying and serving applications and websites.', 5, 75, 'server', '#60A5FA'],
  ['databases', 'Databases', 'Systems for durable application data storage and retrieval.', 5, 80, 'database', '#60A5FA'],
  ['observability', 'Observability', 'Tools for understanding system health, behavior, and failures.', 5, 60, 'activity', '#60A5FA'],
  ['cloud-infrastructure', 'Cloud Infrastructure', 'Programmable compute, networking, and foundational cloud services.', 5, 85, 'cloud', '#60A5FA'],
  ['seo', 'SEO', 'Products for improving visibility in organic search.', 6, 65, 'search-check', '#FB7185'],
  ['email-marketing', 'Email Marketing', 'Tools for audience email campaigns, lifecycle messaging, and measurement.', 6, 55, 'mail', '#FB7185'],
  ['social-media', 'Social Media', 'Products for publishing, managing, and measuring social channels.', 6, 70, 'megaphone', '#FB7185'],
  ['payments', 'Payments', 'Infrastructure and products for accepting and moving money online.', 7, 80, 'credit-card', '#34D399'],
  ['e-commerce', 'E-commerce', 'Platforms for building and operating online storefronts.', 7, 75, 'shopping-cart', '#34D399'],
  ['analytics', 'Analytics', 'Products for measuring behavior, performance, and outcomes.', 8, 70, 'chart-no-axes-combined', '#818CF8'],
  ['data-infrastructure', 'Data Infrastructure', 'Systems for collecting, transforming, and serving data at scale.', 8, 65, 'warehouse', '#818CF8'],
  ['data-visualization', 'Data Visualization', 'Tools that turn complex data into understandable visual stories.', 8, 55, 'chart-scatter', '#818CF8'],
];

export const approvedTerritorySeed: TerritorySeedDefinition = {
  categories: [
    { id: '20000000-0000-4000-8000-000000000001', slug: 'ai', name: 'AI', displayOrder: 10, description: 'Products building with or delivering artificial intelligence.' },
    { id: '20000000-0000-4000-8000-000000000002', slug: 'developer-tools', name: 'Developer Tools', displayOrder: 20, description: 'Tools used to build, test, ship, and maintain software.' },
    { id: '20000000-0000-4000-8000-000000000003', slug: 'design', name: 'Design', displayOrder: 30, description: 'Products for interface, product, and creative design work.' },
    { id: '20000000-0000-4000-8000-000000000004', slug: 'productivity', name: 'Productivity', displayOrder: 40, description: 'Tools that organize work and help teams move faster.' },
    { id: '20000000-0000-4000-8000-000000000005', slug: 'infrastructure', name: 'Infrastructure', displayOrder: 50, description: 'Platforms that run, store, and observe production systems.' },
    { id: '20000000-0000-4000-8000-000000000006', slug: 'marketing', name: 'Marketing', displayOrder: 60, description: 'Products for discovery, audience growth, and communication.' },
    { id: '20000000-0000-4000-8000-000000000007', slug: 'commerce', name: 'Commerce', displayOrder: 70, description: 'Products that enable online transactions and storefronts.' },
    { id: '20000000-0000-4000-8000-000000000008', slug: 'data', name: 'Data', displayOrder: 80, description: 'Products for measuring, moving, and understanding data.' },
  ],
  territories: territoryRows.map(([slug, name, description, categoryNumber, displayWeight, iconKey, accentColor], index) => ({
    id: `21000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    slug,
    name,
    description,
    categoryId: `20000000-0000-4000-8000-${String(categoryNumber).padStart(12, '0')}`,
    displayWeight,
    availabilityStatus: 'ACTIVE' as const,
    visualMetadata: { iconKey, accentColor },
  })),
};
