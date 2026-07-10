import { POST as processEvolutionWebhook } from '../../route';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ empresaId: string; secret: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { empresaId, secret } = await context.params;
  const url = new URL(request.url);
  url.searchParams.set('empresa_id', empresaId);
  url.searchParams.set('secret', secret);

  const body = await request.text();
  const forwarded = new Request(url.toString(), {
    method: 'POST',
    headers: request.headers,
    body
  });

  return processEvolutionWebhook(forwarded);
}
