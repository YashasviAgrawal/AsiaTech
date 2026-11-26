import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { isSealed, sealSecrets } from '../server/secrets';
import { db, pool as appPool } from './index';
import { syncSystemRoles } from './system-roles';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  // Data step: seal OTA credentials saved before encryption existed (needs the app key, so it cannot be plain SQL).
  const { rows } = await pool.query<{ id: string; credentials: Record<string, string> }>(`SELECT id, credentials FROM channels WHERE credentials <> '{}'::jsonb AND NOT credentials ? '__enc'`);
  for (const row of rows) {
    if (isSealed(row.credentials)) continue;
    await pool.query('UPDATE channels SET credentials = $1 WHERE id = $2', [JSON.stringify(sealSecrets(row.credentials)), row.id]);
  }
  await pool.end();
  // Built-in roles follow the code (a fresh install gets them here; upgrades get new permissions).
  const roles = await syncSystemRoles(db);
  await appPool.end();
  console.log(`✔ Migrations applied · ${roles.size} built-in roles${rows.length ? ` · sealed ${rows.length} OTA credential set(s)` : ''}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
