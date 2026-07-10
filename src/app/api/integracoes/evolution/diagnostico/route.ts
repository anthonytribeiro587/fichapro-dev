import { NextResponse } from 'next/server';
import { isAuthError, requireAuthenticatedUser } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const maxDuration = 45;

type RequestBody = { empresa_id?: string };

async function validateCompany(request: Request, empresaId: string) {
  const auth = await requireAuthenticatedUser(request);
  const { data: empresa } = await auth.supabase
    .from('empresas')
    .select('id,nome')
    .eq('id', empresaId)
    .single();

  if (!empresa) throw new Error('COMPANY_NOT_FOUND');
  return { ...auth, empresa };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const empresaId = url.searchParams.get('empresa_id')?.trim();
    if (!empresaId) return NextResponse.json({ ok: false, error: 'Informe a empresa.' }, { status: 400 });

    const { supabase, empresa } = await validateCompany(request, empresaId);
    const [integrationResult, eventsResult, messagesResult, tasksResult, conversationsResult] = await Promise.all([
      supabase
        .from('integracoes_empresa')
        .select('status,ultimo_teste_em,ultimo_erro,configuracao_publica')
        .eq('empresa_id', empresaId)
        .eq('provedor', 'evolution')
        .maybeSingle(),
      supabase
        .from('eventos_webhook')
        .select('id,tipo,status,erro,created_at,processado_em')
        .eq('empresa_id', empresaId)
        .eq('provedor', 'evolution')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('mensagens_whatsapp')
        .select('id,conversa_id,cliente_id,direcao,tipo,conteudo,enviada_em,created_at')
        .eq('empresa_id', empresaId)
        .eq('direcao', 'entrada')
        .order('enviada_em', { ascending: false })
        .limit(8),
      supabase
        .from('tarefas_operacionais')
        .select('id,titulo,status,descricao,created_at,metadata')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'responder')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('conversas_whatsapp')
        .select('id,cliente_id,telefone,nome_contato,status,ultima_mensagem_em')
        .eq('empresa_id', empresaId)
        .order('ultima_mensagem_em', { ascending: false })
        .limit(8)
    ]);

    const queryErrors = [
      integrationResult.error,
      eventsResult.error,
      messagesResult.error,
      tasksResult.error,
      conversationsResult.error
    ].filter(Boolean).map((item) => item?.message);

    return NextResponse.json({
      ok: queryErrors.length === 0,
      empresa,
      integration: integrationResult.data || null,
      events: eventsResult.data || [],
      incomingMessages: messagesResult.data || [],
      responseTasks: tasksResult.data || [],
      conversations: conversationsResult.data || [],
      queryErrors
    });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ ok: false, error: 'Sessão inválida.' }, { status: 401 });
    if (error instanceof Error && error.message === 'COMPANY_NOT_FOUND') {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada para este acesso.' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Não foi possível gerar o diagnóstico.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as RequestBody | null;
    const empresaId = body?.empresa_id?.trim();
    if (!empresaId) return NextResponse.json({ ok: false, error: 'Informe a empresa.' }, { status: 400 });

    const { user, supabase } = await validateCompany(request, empresaId);
    const { data: lastMessage, error: messageError } = await supabase
      .from('mensagens_whatsapp')
      .select('id,conversa_id,cliente_id,tipo,conteudo,enviada_em,conversas_whatsapp(id,telefone,nome_contato),clientes(id,nome)')
      .eq('empresa_id', empresaId)
      .eq('direcao', 'entrada')
      .order('enviada_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (messageError) {
      return NextResponse.json({ ok: false, error: `Não foi possível consultar a última mensagem: ${messageError.message}` }, { status: 500 });
    }
    if (!lastMessage) {
      return NextResponse.json({ ok: false, error: 'Nenhuma mensagem recebida foi encontrada. O webhook ainda não entregou uma entrada ao FichaPRO.' }, { status: 404 });
    }

    const { data: existingTask } = await supabase
      .from('tarefas_operacionais')
      .select('id,titulo,status')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'responder')
      .in('status', ['pendente', 'em_andamento'])
      .contains('metadata', { conversa_id: lastMessage.conversa_id })
      .maybeSingle();

    if (existingTask) {
      return NextResponse.json({ ok: true, reused: true, task: existingTask, message: 'A última conversa já possui uma tarefa de resposta aberta.' });
    }

    const relationClient = lastMessage.clientes as unknown as { nome?: string } | null;
    const relationConversation = lastMessage.conversas_whatsapp as unknown as { telefone?: string; nome_contato?: string } | null;
    const contactName = relationClient?.nome || relationConversation?.nome_contato || relationConversation?.telefone || 'cliente';
    const description = lastMessage.conteudo
      ? `Mensagem recebida: “${String(lastMessage.conteudo).slice(0, 220)}”`
      : `Nova mensagem do tipo ${lastMessage.tipo || 'desconhecido'}.`;

    const { data: task, error: taskError } = await supabase
      .from('tarefas_operacionais')
      .insert({
        user_id: user.id,
        responsavel_user_id: user.id,
        empresa_id: empresaId,
        cliente_id: lastMessage.cliente_id || null,
        tipo: 'responder',
        titulo: `Responder ${contactName}`,
        descricao: description,
        status: 'pendente',
        prioridade: 'normal',
        origem: 'evolution_reprocessada',
        data_limite: new Date().toISOString().slice(0, 10),
        metadata: {
          conversa_id: lastMessage.conversa_id,
          mensagem_id: lastMessage.id,
          reprocessada_manualmente: true
        }
      })
      .select('id,titulo,status')
      .single();

    if (taskError) {
      const migrationHint = taskError.message.toLowerCase().includes('check constraint') || taskError.message.toLowerCase().includes('tipo')
        ? ' Execute a migration v56 no Supabase DEV.'
        : '';
      return NextResponse.json({ ok: false, error: `A mensagem existe, mas a tarefa não pôde ser criada: ${taskError.message}.${migrationHint}` }, { status: 500 });
    }

    await supabase
      .from('integracoes_empresa')
      .update({ ultimo_erro: null, ultimo_teste_em: new Date().toISOString() })
      .eq('empresa_id', empresaId)
      .eq('provedor', 'evolution');

    return NextResponse.json({ ok: true, reused: false, task, message: 'Tarefa criada a partir da última mensagem recebida.' });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ ok: false, error: 'Sessão inválida.' }, { status: 401 });
    if (error instanceof Error && error.message === 'COMPANY_NOT_FOUND') {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada para este acesso.' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Não foi possível reprocessar a mensagem.' }, { status: 500 });
  }
}
