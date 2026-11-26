import { ipFrom, limitRequest } from '@/server/rate-limit';
import { authenticateAgent, claimJobs } from '@/server/services/printing';

export const dynamic = 'force-dynamic';

const unauthorised = () => Response.json({ error: 'Unknown or revoked print agent key. Create a new key in Restaurant → Printers.' }, { status: 401 });

/**
 * The print agent asks for work here. Long poll: the request waits up to `wait` seconds (max 25) for a job,
 * so KOTs reach the kitchen within a second without the agent hammering the server.
 */
export async function GET(request: Request) {
  const limited = await limitRequest(request, 'print-agent', 240, 60_000);
  if (limited) return limited;
  const ip = ipFrom((name) => request.headers.get(name));
  const agent = await authenticateAgent(request.headers.get('authorization'), ip);
  if (!agent) return unauthorised();
  const wait = Math.max(0, Math.min(Number(new URL(request.url).searchParams.get('wait')) || 0, 25));
  const until = Date.now() + wait * 1000;
  for (;;) {
    const jobs = await claimJobs(agent);
    if (jobs.length || Date.now() >= until || request.signal.aborted) return Response.json({ jobs });
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
