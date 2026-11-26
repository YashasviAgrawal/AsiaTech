import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Which hotel the current request works for, so the database can enforce it (row-level security, see
 * drizzle/0007_row_level_security.sql). The pool stamps `app.property_id` on every connection it hands out:
 *
 * - a staff request (pages, server actions, staff API routes) gets its hotel once its context is known, and
 *   Postgres then hides and refuses rows of every other hotel, even if a query forgets its property filter;
 * - work with no hotel scope (background worker, webhooks, public booking engine, seed, the platform console)
 *   runs with an empty stamp and sees all rows, as before.
 */
export interface TenantScope {
  propertyId: string | null;
  /** Platform console: looks across hotels on purpose. */
  platform: boolean;
}

// One instance per process, kept on globalThis so dev hot reloads and the cached pool agree on it.
const holder = globalThis as unknown as { __tenantStorage?: AsyncLocalStorage<TenantScope> };
const storage = (holder.__tenantStorage ??= new AsyncLocalStorage<TenantScope>());

/**
 * Start a scope for the rest of this request. Call it synchronously at the start of the context lookup
 * (before any await), so the caller's code after `await getContext()` runs inside it; fill in the hotel later.
 */
export function openTenantScope(): TenantScope {
  const scope: TenantScope = { propertyId: null, platform: false };
  storage.enterWith(scope);
  return scope;
}

export function currentScope(): TenantScope | undefined {
  return storage.getStore();
}

/** The hotel the database should limit this request to, or null for "no limit". */
export function currentTenant(): string | null {
  const scope = storage.getStore();
  return scope && !scope.platform ? scope.propertyId : null;
}

/** Run work for one hotel outside a request (tests, scripts). */
export function runInTenant<T>(propertyId: string | null, fn: () => Promise<T>): Promise<T> {
  return storage.run({ propertyId, platform: false }, fn);
}
