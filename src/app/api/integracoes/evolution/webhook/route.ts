import { NextResponse } from 'next/server';
import { evolutionErrorMessage, getEvolutionConnectionState, getEvolutionWebhook, setEvolutionWebhook } from '@/lib/evolution-server';
import { isAuthError, requireAuthenticatedUser } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const maxDuration = 45;

const requiredEvents = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CONNECTION_UPDATE'];

function publicAppUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (configured) return configured;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return new URL(request.url).origin;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeWebhookConfiguration(value: unknown) {
  const root = asRecord(value);
  const nested = asRecord(root?.webhook);
  const source = nested || root;
  if (!source) return { enabled: false, url: '', events: [] as string[] };

  const rawEvents = source.events;
  const events = Array.isArray(rawEvents)
    ? rawEvents.map((event) => String(event).toUpperCase().replace(/[.-]/g, '_'))
    : [];

  return {
    enabled: source.enabled !== false,
    url: String(source.url || source.webhookUrl || source.webhook_url || ''),
    events
  };
}

function normalizeUrl(value: string) {
  return value.trim().replace(/\/$/, '');
}

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser(request);
    const [connection, webhook] = await Promise.all([
      getEvolutionConnectionState(),
      getEvolutionWebhook().catch(() => null)
    ]);
    return NextResponse.json({
      ok: true,
      connection,
      webhook,
      normalizedWebhook: normalizeWebhookConfiguration(webhook)
    });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ ok: false, error: 'Sessão inválida.' }, { status: 401 });
    return NextResponse.json({ ok: false, error: evolutionErrorMessage(error) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => null) as { empresa_id?: string } | null;
    const empresaId = body?.empresa_id?.trim();
    if (!empresaId) return NextResponse.json({ ok: false, error: 'Informe a empresa.' }, { status: 400 });

    const { data: empresa } = await supabase.from('empresas').select('id').eq('id', empresaId).single();
    if (!empresa) return NextResponse.json({ ok: false, error: 'Empresa não encontrada para este acesso.' }, { status: 403 });

    const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (!secret) {
      return NextResponse.json({ ok: false, error: 'WHATSAPP_WEBHOOK_SECRET não configurado na Vercel DEV.' }, { status: 503 });
    }

    // Alguns builds da Evolution aceitam a configuração com query string, mas
    // não preservam os parâmetros quando entregam os eventos. Empresa e segredo
    // passam a fazer parte do caminho para tornar a entrega determinística.
    const encodedSecret = encodeURIComponent(secret);
    const webhookUrl = `${publicAppUrl(request)}/api/webhooks/evolution/${encodeURIComponent(empresaId)}/${encodedSecret}`;
    const safeUrl = webhookUrl.replace(encodedSecret, '***');

    const response = await setEvolutionWebhook(webhookUrl);
    const confirmation = await getEvolutionWebhook();
    const saved = normalizeWebhookConfiguration(confirmation);
    const urlConfirmed = normalizeUrl(saved.url) === normalizeUrl(webhookUrl);
    const eventsConfirmed = requiredEvents.every((event) => saved.events.includes(event));
    const confirmed = saved.enabled && urlConfirmed && eventsConfirmed;

    if (!confirmed) {
      const problems = [
        !saved.enabled ? 'webhook não está habilitado' : null,
        !urlConfirmed ? `URL salva diferente da esperada (${saved.url || 'URL vazia'})` : null,
        !eventsConfirmed ? `eventos salvos incompletos (${saved.events.join(', ') || 'nenhum'})` : null
      ].filter(Boolean).join('; ');

      await supabase.from('integracoes_empresa').upsert({
        empresa_id: empresaId,
        provedor: 'evolution',
        status: 'erro',
        configuracao_publica: {
          webhook_url: safeUrl,
          webhook_url_confirmada: saved.url ? saved.url.replace(secret, '***') : null,
          eventos: requiredEvents,
          eventos_confirmados: saved.events,
          configurado_em: new Date().toISOString(),
          confirmado: false
        },
        ultimo_teste_em: new Date().toISOString(),
        ultimo_erro: problems
      }, { onConflict: 'empresa_id,provedor' });

      return NextResponse.json({
        ok: false,
        error: `A Evolution respondeu, mas não confirmou a configuração correta: ${problems}`,
        webhookUrl: safeUrl,
        confirmation
      }, { status: 502 });
    }

    const { error: integrationError } = await supabase.from('integracoes_empresa').upsert({
      empresa_id: empresaId,
      provedor: 'evolution',
      status: 'ativa',
      configuracao_publica: {
        webhook_url: safeUrl,
        webhook_url_confirmada: saved.url.replace(secret, '***'),
        eventos: requiredEvents,
        eventos_confirmados: saved.events,
        configurado_em: new Date().toISOString(),
        confirmado: true
      },
      ultimo_teste_em: new Date().toISOString(),
      ultimo_erro: null
    }, { onConflict: 'empresa_id,provedor' });

    if (integrationError) {
      return NextResponse.json({
        ok: false,
        error: `A Evolution confirmou o webhook, mas o FichaPRO não conseguiu registrar a configuração: ${integrationError.message}`
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      webhookUrl: safeUrl,
      response,
      confirmation,
      normalized: saved,
      message: 'Webhook configurado e confirmado com URL e eventos corretos.'
    });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ ok: false, error: 'Sessão inválida.' }, { status: 401 });
    return NextResponse.json({ ok: false, error: evolutionErrorMessage(error) }, { status: 502 });
  }
}
