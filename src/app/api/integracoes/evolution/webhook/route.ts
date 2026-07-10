import { NextResponse } from 'next/server';
import { evolutionErrorMessage, getEvolutionConnectionState, getEvolutionWebhook, setEvolutionWebhook } from '@/lib/evolution-server';
import { isAuthError, requireAuthenticatedUser } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const maxDuration = 45;

function publicAppUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (configured) return configured;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser(request);
    const [connection, webhook] = await Promise.all([
      getEvolutionConnectionState(),
      getEvolutionWebhook().catch(() => null)
    ]);
    return NextResponse.json({ ok: true, connection, webhook });
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

    const webhookUrl = `${publicAppUrl(request)}/api/webhooks/evolution?empresa_id=${encodeURIComponent(empresaId)}&secret=${encodeURIComponent(secret)}`;
    const response = await setEvolutionWebhook(webhookUrl);

    await supabase.from('integracoes_empresa').upsert({
      empresa_id: empresaId,
      provedor: 'evolution',
      status: 'ativa',
      configuracao_publica: {
        webhook_url: webhookUrl.replace(secret, '***'),
        eventos: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CONNECTION_UPDATE'],
        configurado_em: new Date().toISOString()
      },
      ultimo_teste_em: new Date().toISOString(),
      ultimo_erro: null
    }, { onConflict: 'empresa_id,provedor' });

    return NextResponse.json({ ok: true, webhookUrl: webhookUrl.replace(secret, '***'), response });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ ok: false, error: 'Sessão inválida.' }, { status: 401 });
    return NextResponse.json({ ok: false, error: evolutionErrorMessage(error) }, { status: 502 });
  }
}
