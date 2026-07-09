import { NextResponse } from 'next/server';
import { buildWahaHeaders, getWahaConfig, normalizeBrazilianWhatsappChatId } from '@/lib/waha';
import {
  buildEvolutionHeaders,
  getEvolutionConfig,
  getWhatsappProvider,
  normalizeBrazilianWhatsappNumber
} from '@/lib/whatsapp-provider';

export const runtime = 'nodejs';
export const maxDuration = 60;

type WhatsappSendBody = {
  phone?: string;
  message?: string;
  session?: string;
  instance?: string;
};

async function sendWithEvolution(phone: string, message: string, requestedInstance?: string) {
  const number = normalizeBrazilianWhatsappNumber(phone);
  if (!number) {
    return NextResponse.json(
      { ok: false, error: 'Telefone inválido. Use DDD + número, ex.: 51999999999.' },
      { status: 400 }
    );
  }

  const { baseUrl, apiKey, instance } = getEvolutionConfig();
  const instanceName = requestedInstance || instance;

  if (!baseUrl || !apiKey || !instanceName) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Evolution API não configurada. Cadastre WHATSAPP_PROVIDER=evolution, EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE na Vercel DEV.'
      },
      { status: 500 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  const response = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: buildEvolutionHeaders(apiKey),
    signal: controller.signal,
    body: JSON.stringify({
      number,
      textMessage: {
        text: message
      },
      delay: 1000,
      linkPreview: false
    })
  }).finally(() => clearTimeout(timeout));

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        provider: 'evolution',
        error: 'Evolution API recusou o envio.',
        status: response.status,
        details: data
      },
      { status: response.status }
    );
  }

  return NextResponse.json({
    ok: true,
    provider: 'evolution',
    message: 'Mensagem enviada pela Evolution API.',
    number,
    instance: instanceName,
    data
  });
}

async function sendWithWaha(phone: string, message: string, requestedSession?: string) {
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
        provider: 'waha',
        error: 'WAHA recusou o envio.',
        status: response.status,
        details: data
      },
      { status: response.status }
    );
  }

  return NextResponse.json({
    ok: true,
    provider: 'waha',
    message: 'Mensagem enviada pelo WAHA.',
    chatId,
    session: requestedSession || session,
    data
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as WhatsappSendBody | null;

    const phone = body?.phone?.trim();
    const message = body?.message?.trim();

    if (!phone || !message) {
      return NextResponse.json(
        { ok: false, error: 'Informe telefone e mensagem.' },
        { status: 400 }
      );
    }

    const provider = getWhatsappProvider();

    if (provider === 'waha') {
      return await sendWithWaha(phone, message, body?.session?.trim());
    }

    return await sendWithEvolution(phone, message, body?.instance?.trim());
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return NextResponse.json(
      {
        ok: false,
        error: isAbort
          ? 'A integração demorou para responder. Confira se a mensagem chegou no WhatsApp; se não chegou, tente novamente.'
          : 'Erro interno ao enviar WhatsApp.'
      },
      { status: isAbort ? 504 : 500 }
    );
  }
}
