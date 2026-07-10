import { NextResponse } from 'next/server';
import { isAuthError, requireAuthenticatedUser } from '@/lib/server-auth';
import { mercadoPagoErrorMessage, testMercadoPagoConnection } from '@/lib/mercadopago';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser(request);
    const account = await testMercadoPagoConnection();
    return NextResponse.json({
      ok: true,
      configured: true,
      provider: 'mercadopago',
      account: {
        id: account.id || null,
        nickname: account.nickname || null,
        email: account.email || null,
        siteId: account.site_id || null
      }
    });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ ok: false, error: 'Sessão inválida.' }, { status: 401 });
    const message = mercadoPagoErrorMessage(error);
    return NextResponse.json({
      ok: false,
      configured: !message.includes('ACCESS_TOKEN'),
      provider: 'mercadopago',
      error: message
    }, { status: message.includes('ACCESS_TOKEN') ? 503 : 502 });
  }
}
