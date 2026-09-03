import type { FastifyInstance } from 'fastify';
import { takeoverRoutes, type TakeoverRoutesOptions } from '../modules/takeover/routes.js';
import { cookiesPlugin } from './cookies.js';

export async function takeoverPlugin(
  app: FastifyInstance,
  options: TakeoverRoutesOptions,
): Promise<void> {
  await cookiesPlugin(app);
  await takeoverRoutes(app, options);
}
