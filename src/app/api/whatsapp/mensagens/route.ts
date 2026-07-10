import { NextResponse } from 'next/server';
import { sendEvolutionText } from '@/lib/evolution-server';
import { isAuthError, requireAuthenticatedUser } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const maxDuration = 45;

type SendBody = {
  empresa_id?: string;
  conversa_id?: string;
  mensagem?: string;
};

function extractMessageId(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const response = value as Record<string, any>;
  return String(
    response.key?.id
    || response.message?.key?.id
    || response.data?.key?.id
    || response.id
    || ''
  ) || null;
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => null) as SendBody | null;
    const empresaId = body?.empresa_id?.trim();
    const conversaId = body?.conversa_id?.trim();
    const mensagem = body?.mensagem?.trim();

    if (!empresaId || !conversaId || !mensagem) {
      return NextResponse.json({ ok: false, error: 'Informe empresa, conversa e mensagem.' }, { status: 400 });
    }

    if (mensagem.length > 4000) {
      return NextResponse.json({ ok: false, error: 'A mensagem deve ter no máximo 4.000 caracteres.' }, { status: 400 });
    }

    const { data: empresa } = await supabase
      .from('empresas')
      .select('id')
      .eq('id', empresaId)
      .single();

    if (!empresa) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada para este acesso.' }, { status: 403 });
    }

    const { data: conversa, error: conversaError } = await supabase
      .from('conversas_whatsapp')
      .select('id,empresa_id,cliente_id,telefone,nome_contato')
      .eq('id', conversaId)
      .eq('empresa_id', empresaId)
      .single();

    if (conversaError || !conversa) {
      return NextResponse.json({ ok: false, error: 'Conversa não encontrada.' }, { status: 404 });
    }

    const response = await sendEvolutionText(conversa.telefone, mensagem);
    const externalId = extractMessageId(response) || `local-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const { data: savedMessage, error: messageError } = await supabase
      .from('mensagens_whatsapp')
      .upsert({
        empresa_id: empresaId,
        conversa_id: conversaId,
        cliente_id: conversa.cliente_id || null,
        id_externo: externalId,
        direcao: 'saida',
        tipo: 'texto',
        conteudo: mensagem,
        status: 'enviada',
        enviada_por: 'equipe',
        metadata: { origem: 'caixa_de_entrada', user_id: user.id },
        enviada_em: now
      }, { onConflict: 'empresa_id,id_externo' })
      .select('id,conteudo,direcao,status,enviada_em')
      .single();

    if (messageError) {
      return NextResponse.json({ ok: false, error: `Mensagem enviada, mas não registrada: ${messageError.message}` }, { status: 500 });
    }

    await Promise.all([
      supabase
        .from('conversas_whatsapp')
        .update({ status: 'aguardando_cliente', ultima_mensagem_em: now, atendente_user_id: user.id })
        .eq('id', conversaId)
        .eq('empresa_id', empresaId),
      supabase
        .from('tarefas_operacionais')
        .update({ status: 'concluida', concluida_em: now })
        .eq('empresa_id', empresaId)
        .eq('tipo', 'responder')
        .in('status', ['pendente', 'em_andamento'])
        .contains('metadata', { conversa_id: conversaId })
    ]);

    return NextResponse.json({ ok: true, message: savedMessage, provider: response });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ ok: false, error: 'Sessão inválida.' }, { status: 401 });
    }
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.'
    }, { status: 502 });
  }
}
