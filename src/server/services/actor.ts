import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { properties, type PropertySettings } from '@/db/schema';
import type { AppContext } from '../context';

/**
 * Who is doing something, and for which property. Services take an Actor instead of the request context so
 * the same code runs from server actions, OTA webhooks, the booking engine, the worker and the seed script.
 */
export interface Actor {
  propertyId: string;
  userId: string | null;
  businessDate: string;
  settings: PropertySettings;
  shortCode: string;
}

export function actorFromContext(ctx: AppContext): Actor {
  return {
    propertyId: ctx.propertyId,
    userId: ctx.userId,
    businessDate: ctx.property.businessDate,
    settings: ctx.property.settings,
    shortCode: ctx.property.shortCode,
  };
}

export async function systemActor(propertyId: string): Promise<Actor> {
  const [property] = await db.select().from(properties).where(eq(properties.id, propertyId));
  if (!property) throw new Error(`Property ${propertyId} not found`);
  return { propertyId, userId: null, businessDate: property.businessDate, settings: property.settings, shortCode: property.shortCode };
}
