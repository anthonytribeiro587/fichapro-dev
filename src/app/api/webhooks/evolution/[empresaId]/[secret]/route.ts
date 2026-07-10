import { timingSafeEqual } from 'node:crypto';
import { POST as processEvolutionWebhook } from '../../route';
import { applyEvolutionReceipts } from '@/lib/evolution-receipts';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ empresaId: string; secret: string }>;
};

function secretMatches(received: string, expected: string | undefined) {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeEvent(value: unknown) {
  return String(value || 'UNKNOWN').toUpperCase().replace(/[.-]/g, '_');
}

export async function POST(request: Request, context: RouteContext) {
  const { empresaId, secret } = await context.params;
  const body = await request.text();

  if (secretMatches(secret, process.env.WHATSAPP_WEBHOOK_SECRET)) {
    try {
      const payload = JSON.parse(body) as Record<string, unknown>;
      const event = normalizeEvent(payload.event);

      if (['MESSAGES_UPDATE', 'MESSAGE_UPDATE', 'SEND_MESSAGE', 'MESSAGES_UPSERT'].includes(event)) {
        await applyEvolutionReceipts(empresaId, payload);
      }
    } catch {
      // O processador principal registra o payload e mantém o diagnóstico.
    }
  }

  const url = new URL(request.url);
  url.searchParams.set('empresa_id', empresaId);
  url.searchParams.set('secret', secret);

  const forwarded = new Request(url.toString(), {
    method: 'POST',
    headers: request.headers,
    body
  });

  return processEvolutionWebhook(forwarded);
}
