import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import * as schema from './schema';
import { currentTenant } from './tenant';

type TaggedClient = PoolClient & { __tenant?: string };
type ConnectCallback = (err: Error | undefined, client: PoolClient | undefined, done: (release?: unknown) => void) => void;

/**
 * The pool stamps `app.property_id` (the request's hotel, or empty) on each connection as it is handed out,
 * which is what the row-level security policies read. A connection remembers its stamp, so the extra
 * statement only runs when the hotel changes (usually never, for a single hotel).
 */
class TenantPool extends Pool {
  connect(): Promise<PoolClient>;
  connect(callback: ConnectCallback): void;
  connect(callback?: ConnectCallback): Promise<PoolClient> | void {
    // Read the scope now, in the caller's async context (pg may hand the connection over later).
    const tenant = currentTenant() ?? '';
    const ready = super.connect().then(async (client: TaggedClient) => {
      if (client.__tenant !== tenant) {
        try {
          await client.query("SELECT set_config('app.property_id', $1, false)", [tenant]);
        } catch (error) {
          client.release(error as Error);
          throw error;
        }
        client.__tenant = tenant;
      }
      return client as PoolClient;
    });
    if (!callback) return ready;
    ready.then(
      (client) => callback(undefined, client, (release) => client.release(release as Error | boolean | undefined)),
      (error: Error) => callback(error, undefined, () => undefined),
    );
  }
}

/**
 * A single pool per server process. In dev, Next.js hot-reloads modules, so the pool is cached on globalThis
 * to avoid opening a new set of connections on every edit.
 */
const globalForDb = globalThis as unknown as { __hotelTenantPool?: Pool };

const pool =
  globalForDb.__hotelTenantPool ??
  new TenantPool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://hotel:hotel@localhost:5432/hotel_os',
    max: 10,
  });

if (process.env.NODE_ENV !== 'production') globalForDb.__hotelTenantPool = pool;

export const db = drizzle(pool, { schema });

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as `db`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export { schema, pool };
