import { NextResponse } from 'next/server';
import { getMercadoPagoOrder, normalizeMercadoPagoStatus, validateMercadoPagoWebhookSignature } from '@/lib/mercadopago';
import { createAdminServerClient } from '@/lib/server-auth';
import { sendEvolutionText } from '@/lib/evolution-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type MercadoPagoWebhookBody = {
  id?: string | number;
  action?: string;
  type?: string;
  date_created?: string;
  data?: { id?: string };
};

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({})) as MercadoPagoWebhookBody;
  const dataId = url.searchParams.get('data.id') || body.data?.id || null;

  const validSignature = validateMercadoPagoWebhookSignature({
    xSignature: request.headers.get('x-signature'),
    xRequestId: request.headers.get('x-request-id'),
    dataId
  });

  if (!validSignature) {
    return NextResponse.json({ ok: false, error: 'Assinatura do webhook inválida.' }, { status: 401 });
  }
  if (!dataId) return NextResponse.json({ ok: false, error: 'Evento sem data.id.' }, { status: 400 });

  try {
    const admin = createAdminServerClient();
    const eventId = String(body.id || `${body.type || 'order'}:${dataId}:${body.action || 'update'}`);

    const { data: duplicated } = await admin
      .from('eventos_webhook')
      .select('id,status')
      .eq('provedor', 'mercadopago')
      .eq('evento_externo_id', eventId)
      .maybeSingle();

    if (duplicated?.status === 'processado') {
      return NextResponse.json({ ok: true, duplicated: true });
    }

    const { data: eventRow } = await admin
      .from('eventos_webhook')
      .upsert({
        provedor: 'mercadopago',
        evento_externo_id: eventId,
        tipo: body.action || body.type || 'order',
        status: 'recebido',
        payload: body
      }, { onConflict: 'provedor,evento_externo_id' })
      .select('id')
      .single();

    const order = await getMercadoPagoOrder(dataId);
    const normalizedStatus = normalizeMercadoPagoStatus(order);

    const { data: charge } = await admin
      .from('cobrancas_integradas')
      .select('*, clientes(id,nome,telefone), assinaturas(id,nome,proximo_vencimento)')
      .eq('provedor', 'mercadopago')
      .eq('id_externo', dataId)
      .maybeSingle();

    if (!charge) {
      if (eventRow?.id) {
        await admin.from('eventos_webhook').update({
          status: 'ignorado',
          erro: 'Cobrança não localizada pelo order id.',
          processado_em: new Date().toISOString()
        }).eq('id', eventRow.id);
      }
      return NextResponse.json({ ok: true, ignored: true });
    }

    await admin.from('cobrancas_integradas').update({
      status: normalizedStatus,
      pago_em: normalizedStatus === 'pago' ? new Date().toISOString() : null,
      metadata: {
        ...(charge.metadata || {}),
        webhook_action: body.action || null,
        order_status: order.status || null,
        order_status_detail: order.status_detail || null,
        ultima_sincronizacao: new Date().toISOString()
      }
    }).eq('id', charge.id);

    let taskCreated = false;
    if (normalizedStatus === 'pago') {
      if (charge.parcela_id) {
        await admin.from('parcelas').update({
          status: 'pago',
          data_pagamento: new Date().toISOString().slice(0, 10)
        }).eq('id', charge.parcela_id).eq('empresa_id', charge.empresa_id);
      }

      const isRecurring = Boolean(charge.assinatura_id);
      const taskType = isRecurring ? 'renovar' : 'separar_pedido';
      const taskTitle = isRecurring
        ? `Renovar serviço de ${charge.clientes?.nome || 'cliente'}`
        : `Preparar entrega para ${charge.clientes?.nome || 'cliente'}`;

      const { error: taskError } = await admin.from('tarefas_operacionais').upsert({
        user_id: charge.user_id,
        empresa_id: charge.empresa_id,
        cliente_id: charge.cliente_id,
        parcela_id: charge.parcela_id || null,
        assinatura_id: charge.assinatura_id || null,
        cobranca_id: charge.id,
        tipo: taskType,
        titulo: taskTitle,
        descricao: `Pagamento de R$ ${Number(charge.valor).toFixed(2).replace('.', ',')} confirmado automaticamente pelo Mercado Pago.`,
        status: 'pendente',
        prioridade: 'alta',
        origem: 'mercadopago',
        data_limite: new Date().toISOString().slice(0, 10),
        metadata: { order_id: dataId, pagamento_confirmado: true }
      }, { onConflict: 'cobranca_id,tipo' });
      taskCreated = !taskError;

      const adminPhone = process.env.WHATSAPP_ADMIN_NUMBER;
      if (adminPhone) {
        const action = isRecurring ? 'renovar o serviço no painel' : 'preparar a entrega';
        await sendEvolutionText(
          adminPhone,
          `✅ Pagamento confirmado\n\nCliente: ${charge.clientes?.nome || 'Não identificado'}\nValor: R$ ${Number(charge.valor).toFixed(2).replace('.', ',')}\nAção necessária: ${action}.\n\nA tarefa já foi criada no FichaPRO.`
        ).catch(() => null);
      }
    }

    const executionOrigin = normalizedStatus === 'pago' ? 'pagamento_confirmado' : 'pagamento_atualizado';
    const { data: existingExecution } = await admin
      .from('automacao_execucoes')
      .select('id')
      .eq('empresa_id', charge.empresa_id)
      .eq('evento_origem', executionOrigin)
      .eq('referencia_externa', eventId)
      .maybeSingle();

    if (!existingExecution) {
      await admin.from('automacao_execucoes').insert({
        empresa_id: charge.empresa_id,
        evento_origem: executionOrigin,
        referencia_externa: eventId,
        status: 'concluida',
        entrada: {
          order_id: dataId,
          cobranca_id: charge.id,
          cliente_id: charge.cliente_id,
          status_recebido: normalizedStatus
        },
        saida: {
          parcela_baixada: Boolean(charge.parcela_id && normalizedStatus === 'pago'),
          tarefa_criada: taskCreated,
          notificacao_admin_solicitada: Boolean(process.env.WHATSAPP_ADMIN_NUMBER && normalizedStatus === 'pago')
        },
        tentativas: 1,
        iniciou_em: new Date().toISOString(),
        concluiu_em: new Date().toISOString()
      });
    }

    if (eventRow?.id) {
      await admin.from('eventos_webhook').update({
        empresa_id: charge.empresa_id,
        status: 'processado',
        processado_em: new Date().toISOString()
      }).eq('id', eventRow.id);
    }

    return NextResponse.json({ ok: true, status: normalizedStatus, taskCreated });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Erro interno no webhook.'
    }, { status: 500 });
  }
}
