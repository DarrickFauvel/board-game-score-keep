import 'dotenv/config';

function required(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: required('JWT_SECRET'),
  tursoUrl: required('TURSO_URL'),
  tursoAuthToken: process.env.TURSO_AUTH_TOKEN || undefined,
  baseUrl: process.env.BASE_URL ?? 'http://localhost:3000',
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
};
