import { z } from 'zod';

const apiEnvironmentSchema = z.object({
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z.url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type ApiConfig = {
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl?: string;
};

export function parseApiConfig(source: NodeJS.ProcessEnv): ApiConfig {
  const result = apiEnvironmentSchema.safeParse(source);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new Error(`Invalid API configuration: ${fields}`);
  }

  const config: ApiConfig = {
    host: result.data.API_HOST,
    logLevel: result.data.LOG_LEVEL,
    nodeEnv: result.data.NODE_ENV,
    port: result.data.API_PORT,
  };

  if (result.data.DATABASE_URL !== undefined) {
    config.databaseUrl = result.data.DATABASE_URL;
  }

  return config;
}
