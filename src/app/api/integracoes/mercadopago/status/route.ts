import { NextResponse } from 'next/server';
import { isAuthError, requireAuthenticatedUser } from '@/lib/server-auth';
import { mercadoPagoErrorMessage, testMercadoPagoConnection } from '@/lib/mercadopago';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireAuthenticatedUser(request);
    const { data: companies } = await supabase
      .from('empresas')
      .select('id')
      .order('created_at')
      .limit(1);
    const companyId = companies?.[0]?.id as string | undefined;

    const account = await testMercadoPagoConnection();

    if (companyId) {
      await supabase.from('integracoes_empresa').upsert({
        user_id: user.id,
        empresa_id: companyId,
        provedor: 'mercadopago',
        status: 'ativa',
        configuracao_publica: {
          account_id: account.id || null,
          nickname: account.nickname || null,
          site_id: account.site_id || null
        },
        ultimo_teste_em: new Date().toISOString(),
        ultimo_erro: null
      }, { onConflict: 'empresa_id,provedor' });
    }

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
