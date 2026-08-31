import { disconnectDatabase, getDatabaseClient } from './client.js';
import { approvedTerritorySeed } from './territory-seed-data.js';
import { applyTerritorySeed } from './territory-seed.js';

async function main(): Promise<void> {
  const result = await applyTerritorySeed(getDatabaseClient(), approvedTerritorySeed);
  console.log(
    `Seeded ${result.categoriesCreatedOrUpdated} categories and ${result.territoriesCreatedOrUpdated} territories.`,
  );
}

try {
  await main();
} finally {
  await disconnectDatabase();
}
