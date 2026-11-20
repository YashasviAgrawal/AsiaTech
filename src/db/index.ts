import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * A single pool per server process. In dev, Next.js hot-reloads modules, so the pool is cached on globalThis
 * to avoid opening a new set of connections on every edit.
 */
const globalForDb = globalThis as unknown as { __hotelPool?: Pool };

const pool =
  globalForDb.__hotelPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://hotel:hotel@localhost:5432/hotel_os',
    max: 10,
  });

if (process.env.NODE_ENV !== 'production') globalForDb.__hotelPool = pool;

export const db = drizzle(pool, { schema });

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as `db`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export { schema, pool };
