import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const target = new URL('../.env', import.meta.url);
if (existsSync(target)) {
  console.error('.env already exists; refusing to overwrite secrets.');
  process.exit(1);
}
const secret = () => randomBytes(32).toString('hex');
const values = {
  ENVIRONMENT: 'development',
  POSTGRES_PASSWORD: secret(),
  APP_DB_PASSWORD: secret(),
  AUTH_PEPPER: secret(),
  PROXY_SHARED_SECRET: secret(),
  DATABASE_URL: '',
  API_INTERNAL_URL: 'http://127.0.0.1:8080',
  API_PUBLIC_ORIGIN: 'http://localhost:3000',
  APP_ORIGIN: 'http://localhost:3000',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  NEXT_PUBLIC_INDEXING: 'false',
  RUN_MIGRATIONS: 'true',
};
values.DATABASE_URL = `postgresql://matjari_app:${values.APP_DB_PASSWORD}@127.0.0.1:5432/matjari`;
writeFileSync(target, Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
console.log('Created .env with independent random development secrets. Do not commit it.');
