import { NextResponse } from 'next/server';
import { getMercadoPagoOrder, mercadoPagoErrorMessage, normalizeMercadoPagoStatus } from '@/lib/mercadopago';
import { isAuthError, requireAuthenticatedUser } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const maxDuration = 45;

type SyncBody = { cobranca_id?: string };

export async function POST(request: Request) {
  try {
    const { supabase } = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => null) as SyncBody | null;
    const cobrancaId = body?.cobranca_id?.trim();

    if (!cobrancaId) {
      return NextResponse.json({ ok: false, error: 'Informe a cobrança que deve ser sincronizada.' }, { status: 400 });
    }

    const { data: charge, error: chargeError } = await supabase
      .from('cobrancas_integradas')
      .select('*, clientes(id,nome,telefone), assinaturas(id,nome,proximo_vencimento)')
      .eq('id', cobrancaId)
      .single();

    if (chargeError || !charge) {
      return NextResponse.json({ ok: false, error: 'Cobrança não encontrada para este acesso.' }, { status: 404 });
    }

    if (!charge.id_externo) {
      return NextResponse.json({ ok: false, error: 'Esta cobrança não possui Order ID do Mercado Pago.' }, { status: 400 });
    }

    const order = await getMercadoPagoOrder(String(charge.id_externo));
    const normalizedStatus = normalizeMercadoPagoStatus(order);
    const now = new Date();

    const { error: updateError } = await supabase
      .from('cobrancas_integradas')
      .update({
        status: normalizedStatus,
        pago_em: normalizedStatus === 'pago' ? (charge.pago_em || now.toISOString()) : null,
        metadata: {
          ...(charge.metadata || {}),
          sincronizacao_manual: true,
          order_status: order.status || null,
          order_status_detail: order.status_detail || null,
          ultima_sincronizacao: now.toISOString()
        }
      })
      .eq('id', charge.id)
      .eq('empresa_id', charge.empresa_id);

    if (updateError) {
      return NextResponse.json({ ok: false, error: `O Mercado Pago respondeu, mas o FichaPRO não conseguiu atualizar a cobrança: ${updateError.message}` }, { status: 500 });
    }

    let taskCreated = false;
    if (normalizedStatus === 'pago') {
      if (charge.parcela_id) {
        await supabase.from('parcelas').update({
          status: 'pago',
          data_pagamento: now.toISOString().slice(0, 10)
        }).eq('id', charge.parcela_id).eq('empresa_id', charge.empresa_id);
      }

      const isRecurring = Boolean(charge.assinatura_id);
      const taskType = isRecurring ? 'renovar' : 'separar_pedido';
      const taskTitle = isRecurring
        ? `Renovar serviço de ${charge.clientes?.nome || 'cliente'}`
        : `Preparar entrega para ${charge.clientes?.nome || 'cliente'}`;

      const { error: taskError } = await supabase.from('tarefas_operacionais').upsert({
        user_id: charge.user_id,
        empresa_id: charge.empresa_id,
        cliente_id: charge.cliente_id,
        parcela_id: charge.parcela_id || null,
        assinatura_id: charge.assinatura_id || null,
        cobranca_id: charge.id,
        tipo: taskType,
        titulo: taskTitle,
        descricao: `Pagamento de R$ ${Number(charge.valor).toFixed(2).replace('.', ',')} confirmado após sincronização com o Mercado Pago.`,
        status: 'pendente',
        prioridade: 'alta',
        origem: 'mercadopago',
        data_limite: now.toISOString().slice(0, 10),
        metadata: { order_id: charge.id_externo, pagamento_confirmado: true, sincronizacao_manual: true }
      }, { onConflict: 'cobranca_id,tipo' });

      if (taskError) {
        return NextResponse.json({
          ok: false,
          error: `Pagamento confirmado, mas a próxima ação não foi criada: ${taskError.message}`,
          status: normalizedStatus
        }, { status: 500 });
      }
      taskCreated = true;
    }

    await supabase.from('automacao_execucoes').insert({
      empresa_id: charge.empresa_id,
      evento_origem: normalizedStatus === 'pago' ? 'pagamento_confirmado' : 'pagamento_sincronizado',
      referencia_externa: `sync:${charge.id}:${Date.now()}`,
      status: 'concluida',
      entrada: { cobranca_id: charge.id, order_id: charge.id_externo },
      saida: { status: normalizedStatus, tarefa_criada: taskCreated },
      tentativas: 1,
      iniciou_em: now.toISOString(),
      concluiu_em: now.toISOString()
    });

    return NextResponse.json({
      ok: true,
      status: normalizedStatus,
      taskCreated,
      message: normalizedStatus === 'pago'
        ? 'Pagamento confirmado e próxima ação criada.'
        : `Status atualizado para ${normalizedStatus}.`
    });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ ok: false, error: 'Sessão inválida.' }, { status: 401 });
    return NextResponse.json({ ok: false, error: mercadoPagoErrorMessage(error) }, { status: 502 });
  }
}
