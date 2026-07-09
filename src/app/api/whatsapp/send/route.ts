import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
import { buildWahaHeaders, getWahaConfig, normalizeBrazilianWhatsappChatId } from '@/lib/waha';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { phone?: string; message?: string; session?: string } | null;

    const phone = body?.phone?.trim();
    const message = body?.message?.trim();
    const requestedSession = body?.session?.trim();

    if (!phone || !message) {
      return NextResponse.json(
        { ok: false, error: 'Informe telefone e mensagem.' },
        { status: 400 }
      );
    }

    const chatId = normalizeBrazilianWhatsappChatId(phone);
    if (!chatId) {
      return NextResponse.json(
        { ok: false, error: 'Telefone inválido. Use DDD + número, ex.: 51999999999.' },
        { status: 400 }
      );
    }

    const { baseUrl, apiKey, session } = getWahaConfig();

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { ok: false, error: 'WAHA não configurado. Cadastre WAHA_BASE_URL, WAHA_API_KEY e WAHA_SESSION na Vercel DEV.' },
        { status: 500 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch(`${baseUrl}/api/sendText`, {
      method: 'POST',
      headers: buildWahaHeaders(apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        session: requestedSession || session,
        chatId,
        text: message,
        linkPreview: false,
        linkPreviewHighQuality: false
      })
    }).finally(() => clearTimeout(timeout));

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'WAHA recusou o envio.',
          status: response.status,
          details: data
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Mensagem enviada pelo WAHA.',
      chatId,
      session: requestedSession || session,
      data
    });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return NextResponse.json(
      {
        ok: false,
        error: isAbort ? 'O WAHA demorou mais de 55 segundos para responder. Confira se a mensagem chegou no WhatsApp; se não chegou, reinicie a sessão no dashboard do WAHA e tente novamente.' : 'Erro interno ao enviar WhatsApp.'
      },
      { status: isAbort ? 504 : 500 }
    );
  }
}
