import { z } from 'zod';
import { ipFrom, limitRequest } from '@/server/rate-limit';
import { authenticateAgent, completeJob } from '@/server/services/printing';

const body = z.object({ ok: z.boolean(), error: z.string().max(500).nullable().optional() });

/** The print agent reports whether a job printed. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = limitRequest(request, 'print-agent-report', 600, 60_000);
  if (limited) return limited;
  const agent = await authenticateAgent(request.headers.get('authorization'), ipFrom((name) => request.headers.get(name)));
  if (!agent) return Response.json({ error: 'Unknown or revoked print agent key.' }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Bad job id' }, { status: 400 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Send { ok, error }' }, { status: 400 });
  const found = await completeJob(agent, id, parsed.data);
  return found ? Response.json({ ok: true }) : Response.json({ error: 'Job not found' }, { status: 404 });
}
