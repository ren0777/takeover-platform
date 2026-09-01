import type { FastifyInstance } from 'fastify';
import type { TerritoryService } from '../modules/territories/service.js';
import { territoryRoutes } from '../modules/territories/routes.js';

export type TerritoryPluginOptions = {
  service: TerritoryService;
};

export async function territoriesPlugin(
  app: FastifyInstance,
  options: TerritoryPluginOptions,
): Promise<void> {
  await territoryRoutes(app, { service: options.service });
}
