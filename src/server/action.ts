import 'server-only';
import { ZodError } from 'zod';
import { ActionError, UserError } from './errors';

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export { UserError };

/**
 * Wrap a server action body so expected failures become a friendly `{ ok: false, error }` instead of a crash.
 * Unexpected errors are logged and reported generically.
 */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = issue.path.join('.');
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, error: error.issues[0]?.message ?? 'Please check the form.', fieldErrors };
    }
    if (error instanceof UserError || error instanceof ActionError) {
      return { ok: false, error: error.message };
    }
    // Next.js uses thrown errors for redirect()/notFound(); let those through.
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    console.error('[action] unexpected error', error);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}
