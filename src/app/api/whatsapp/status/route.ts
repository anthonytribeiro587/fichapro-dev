import { NextResponse } from 'next/server';
import { buildWahaHeaders, getWahaConfig } from '@/lib/waha';

export async function GET() {
  try {
    const { baseUrl, apiKey, session } = getWahaConfig();

    if (!baseUrl || !apiKey) {
      return NextResponse.json({
        ok: false,
        configured: false,
        session,
        error: 'WAHA não configurado nas variáveis do ambiente.'
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

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
      baseUrl,
      session,
      status: data?.status || data?.state || data?.me?.pushName || null,
      account: data?.me?.id || data?.me || data?.engine?.me || null,
      details: data
    }, { status: response.ok ? 200 : response.status });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return NextResponse.json({
      ok: false,
      configured: true,
      error: isAbort ? 'Tempo limite ao consultar o WAHA.' : 'Erro ao consultar status do WAHA.'
    }, { status: isAbort ? 504 : 500 });
  }
}
