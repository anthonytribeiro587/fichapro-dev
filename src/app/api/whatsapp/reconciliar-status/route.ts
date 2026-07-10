import { NextResponse } from 'next/server';
import { applyEvolutionReceipts } from '@/lib/evolution-receipts';
import { createAdminServerClient, isAuthError, requireAuthenticatedUser } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAuthenticatedUser(request);
    const url = new URL(request.url);
    const empresaId = url.searchParams.get('empresa_id')?.trim();

    if (!empresaId) {
      return NextResponse.json({ ok: false, error: 'Informe a empresa.' }, { status: 400 });
    }

    const { data: company } = await supabase
      .from('empresas')
      .select('id')
      .eq('id', empresaId)
      .maybeSingle();

    if (!company) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada para este acesso.' }, { status: 403 });
    }

    const admin = createAdminServerClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error } = await admin
      .from('eventos_webhook')
      .select('id,payload,tipo,created_at')
      .eq('empresa_id', empresaId)
      .eq('provedor', 'evolution')
      .in('tipo', ['MESSAGES_UPDATE', 'MESSAGE_UPDATE', 'SEND_MESSAGE', 'MESSAGES_UPSERT'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let candidates = 0;
    let updated = 0;

    for (const event of events || []) {
      const result = await applyEvolutionReceipts(empresaId, event.payload);
      candidates += result.candidates;
      updated += result.updated;
    }

    return NextResponse.json({
      ok: true,
      events: events?.length || 0,
      candidates,
      updated
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ ok: false, error: 'Sessão inválida.' }, { status: 401 });
    }

    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível reconciliar os status.'
    }, { status: 500 });
  }
}
