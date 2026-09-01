import {
  companyPublicSummarySchema,
  companyTerritoriesSchema,
  paginationQuerySchema,
  territoryCategorySchema,
  territoryDetailSchema,
  territoryListQuerySchema,
  type ApiSuccess,
} from '@takeover/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { TerritoryService } from './service.js';

export type TerritoryRoutesOptions = {
  service: TerritoryService;
};

type PaginatedMeta = {
  requestId: string;
  limit: number;
  nextCursor?: string;
};

const publicSlugParamSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();

function buildPageMeta(
  requestId: string,
  limit: number,
  nextCursor: string | undefined,
): PaginatedMeta {
  const meta: PaginatedMeta = { requestId, limit };
  if (nextCursor !== undefined) meta.nextCursor = nextCursor;
  return meta;
}

export async function territoryRoutes(
  app: FastifyInstance,
  options: TerritoryRoutesOptions,
): Promise<void> {
  // GET /api/territory-categories — unpaginated, standard success envelope.
  app.get('/api/territory-categories', async (request) => {
    const categories = await options.service.listCategories();
    territoryCategorySchema.array().parse(categories);
    const response: ApiSuccess<typeof categories> = {
      data: categories,
      meta: { requestId: request.id },
    };
    return response;
  });

  // GET /api/territories — paginated, honors territoryListQuerySchema.
  app.get('/api/territories', async (request) => {
    const query = territoryListQuerySchema.parse(request.query);
    const result = await options.service.listTerritories({
      ...(query.category !== undefined ? { category: query.category } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      limit: query.limit,
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
    const response: ApiSuccess<typeof result.items> = {
      data: result.items,
      meta: buildPageMeta(request.id, result.limit, result.nextCursor),
    };
    return response;
  });

  // GET /api/territories/:slug — single territory detail with 5-row history preview.
  app.get<{ Params: { slug: string } }>('/api/territories/:slug', async (request) => {
    const { slug } = publicSlugParamSchema.parse(request.params);
    const detail = await options.service.getTerritory(slug);
    territoryDetailSchema.parse(detail);
    const response: ApiSuccess<typeof detail> = {
      data: detail,
      meta: { requestId: request.id },
    };
    return response;
  });

  // GET /api/territories/:slug/history — paginated full history.
  app.get<{ Params: { slug: string } }>('/api/territories/:slug/history', async (request) => {
    const { slug } = publicSlugParamSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const result = await options.service.listTerritoryHistory(slug, {
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      limit: query.limit,
    });
    const response: ApiSuccess<typeof result.items> = {
      data: result.items,
      meta: buildPageMeta(request.id, result.limit, result.nextCursor),
    };
    return response;
  });

  // GET /api/companies/:slug — privacy-safe public company projection.
  app.get<{ Params: { slug: string } }>('/api/companies/:slug', async (request) => {
    const { slug } = publicSlugParamSchema.parse(request.params);
    const company = await options.service.getCompany(slug);
    companyPublicSummarySchema.parse(company);
    const response: ApiSuccess<typeof company> = {
      data: company,
      meta: { requestId: request.id },
    };
    return response;
  });

  // GET /api/companies/:slug/territories — paginated territories owned by a company.
  app.get<{ Params: { slug: string } }>('/api/companies/:slug/territories', async (request) => {
    const { slug } = publicSlugParamSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const result = await options.service.listCompanyTerritories(slug, {
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      limit: query.limit,
    });
    const payload = {
      company: result.company,
      currentTerritoryCount: result.currentTerritoryCount,
      territories: result.territories,
    };
    companyTerritoriesSchema.parse(payload);
    const response: ApiSuccess<typeof payload> = {
      data: payload,
      meta: buildPageMeta(request.id, result.limit, result.nextCursor),
    };
    return response;
  });
}
