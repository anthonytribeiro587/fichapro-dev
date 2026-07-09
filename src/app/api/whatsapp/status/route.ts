import { NextResponse } from 'next/server';
import { buildWahaHeaders, getWahaConfig } from '@/lib/waha';
import {
  buildEvolutionHeaders,
  getEvolutionConfig,
  getWhatsappProvider
} from '@/lib/whatsapp-provider';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function getEvolutionStatus() {
  const { baseUrl, apiKey, instance } = getEvolutionConfig();

  if (!baseUrl || !apiKey || !instance) {
    return NextResponse.json({
      ok: false,
      configured: false,
      provider: 'evolution',
      instance,
      error: 'Evolution API não configurada nas variáveis do ambiente.'
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const response = await fetch(`${baseUrl}/instance/connectionState/${instance}`, {
    method: 'GET',
    headers: buildEvolutionHeaders(apiKey),
    signal: controller.signal,
    cache: 'no-store'
  }).finally(() => clearTimeout(timeout));

  const data = await response.json().catch(() => null);
  const state = data?.instance?.state || data?.state || data?.status || data?.connectionStatus || null;
  const normalizedState = String(state || '').toLowerCase();
  const connected = ['open', 'connected', 'connect', 'online'].includes(normalizedState);

  return NextResponse.json({
    ok: response.ok && connected,
    configured: true,
    provider: 'evolution',
    baseUrl,
    instance,
    status: state,
    connected,
    details: data
  }, { status: response.ok ? 200 : response.status });
}

async function getWahaStatus() {
  const { baseUrl, apiKey, session } = getWahaConfig();

  if (!baseUrl || !apiKey) {
    return NextResponse.json({
      ok: false,
      configured: false,
      provider: 'waha',
      session,
      error: 'WAHA não configurado nas variáveis do ambiente.'
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  const response = await fetch(`${baseUrl}/api/sessions/${session}`, {
    method: 'GET',
    headers: buildWahaHeaders(apiKey),
    signal: controller.signal,
    cache: 'no-store'
  }).finally(() => clearTimeout(timeout));

  const data = await response.json().catch(() => null);

  return NextResponse.json({
    ok: response.ok,
    configured: true,
    provider: 'waha',
    baseUrl,
    session,
    status: data?.status || data?.state || data?.me?.pushName || null,
    account: data?.me?.id || data?.me || data?.engine?.me || null,
    details: data
  }, { status: response.ok ? 200 : response.status });
}

export async function GET() {
  try {
    const provider = getWhatsappProvider();

    if (provider === 'waha') {
      return await getWahaStatus();
    }

    return await getEvolutionStatus();
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return NextResponse.json({
      ok: false,
      configured: true,
      error: isAbort ? 'Tempo limite ao consultar a integração de WhatsApp.' : 'Erro ao consultar status da integração de WhatsApp.'
    }, { status: isAbort ? 504 : 500 });
  }
}
