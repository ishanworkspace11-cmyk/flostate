import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('postgresql://dormammu:dormammu_secret@localhost:5432/dormammu_db?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env;

try {
  validatedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Environment configuration error:');
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
  } else {
    console.error('❌ Unexpected error during environment validation:', error);
  }
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
  // Fallback for tests if needed
  validatedEnv = envSchema.parse({
    NODE_ENV: 'test',
    PORT: 4000,
    FRONTEND_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: 'postgresql://dormammu:dormammu_secret@localhost:5432/dormammu_db?schema=public',
    REDIS_URL: 'redis://localhost:6379',
  });
}

export const env = validatedEnv;
