import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

/**
 * India-time calendar days as plain timestamp ranges. `(created_at AT TIME ZONE 'Asia/Kolkata')::date = …` has to
 * convert every row and cannot use an index; these compare the column itself, so (property_id, created_at) indexes
 * are used. Days are 'YYYY-MM-DD' strings or SQL date expressions.
 */
export function istDayStart(day: string | SQL): SQL {
  return sql`((${day})::date::timestamp AT TIME ZONE 'Asia/Kolkata')`;
}

/** `column` falls on India-time days `from` to `to`, both included. */
export function onIstDays(column: AnyColumn | SQL, from: string | SQL, to: string | SQL = from): SQL {
  return sql`${column} >= ${istDayStart(from)} AND ${column} < (((${to})::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`;
}
