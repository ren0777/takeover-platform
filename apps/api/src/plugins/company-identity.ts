import type { FastifyInstance } from 'fastify';
import { companyIdentityRoutes, type CompanyIdentityRoutesOptions } from '../modules/company-identity/routes.js';
import { cookiesPlugin } from './cookies.js';

export async function companyIdentityPlugin(
  app: FastifyInstance,
  options: CompanyIdentityRoutesOptions,
): Promise<void> {
  await cookiesPlugin(app);
  await companyIdentityRoutes(app, options);
}
