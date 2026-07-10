import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { sendEvolutionText } from '@/lib/evolution-server';
import { normalizeBrazilianWhatsappNumber } from '@/lib/whatsapp-provider';
import { createAdminServerClient } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

type UnknownRecord = Record<string, any>;
type EvolutionPayload = {
  event?: string;
  instance?: string;
  data?: UnknownRecord;
  sender?: string;
  date_time?: string;
};

function secretMatches(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function messageText(data: UnknownRecord) {
  const message = data.message || data.messages?.[0]?.message || {};
  return message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || message.documentMessage?.caption
    || message.buttonsResponseMessage?.selectedDisplayText
    || message.listResponseMessage?.title
    || '';
}

function messageType(data: UnknownRecord) {
  const message = data.message || data.messages?.[0]?.message || {};
  if (message.imageMessage) return 'imagem';
  if (message.audioMessage) return 'audio';
  if (message.videoMessage) return 'video';
  if (message.documentMessage) return 'documento';
  return 'texto';
}

function extractMessageData(payload: EvolutionPayload) {
  const data = payload.data || {};
  const raw = data.messages?.[0] || data;
  const key = raw.key || data.key || {};
  const remoteJid = String(key.remoteJid || raw.remoteJid || data.remoteJid || payload.sender || '');
  const phone = remoteJid.split('@')[0].replace(/\D/g, '');
  return {
    id: String(key.id || raw.id || data.id || ''),
    phone,
    fromMe: Boolean(key.fromMe ?? raw.fromMe ?? data.fromMe),
    name: String(raw.pushName || data.pushName || data.name || ''),
    text: messageText(raw),
    type: messageType(raw)
  };
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const empresaId = url.searchParams.get('empresa_id');
  const receivedSecret = url.searchParams.get('secret') || request.headers.get('x-webhook-secret');

  if (!empresaId || !secretMatches(receivedSecret, process.env.WHATSAPP_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false, error: 'Webhook não autorizado.' }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({})) as EvolutionPayload;
  const normalizedEvent = String(payload.event || 'UNKNOWN').toUpperCase().replace(/[.-]/g, '_');

  try {
    const admin = createAdminServerClient();
    const message = extractMessageData(payload);
    const externalEventId = message.id || `${normalizedEvent}:${payload.date_time || Date.now()}:${message.phone || 'unknown'}`;

    const { data: duplicated } = await admin
      .from('eventos_webhook')
      .select('id,status')
      .eq('provedor', 'evolution')
      .eq('evento_externo_id', externalEventId)
      .maybeSingle();

    if (duplicated?.status === 'processado') return NextResponse.json({ ok: true, duplicated: true });

    const { data: eventRow } = await admin.from('eventos_webhook').upsert({
      empresa_id: empresaId,
      provedor: 'evolution',
      evento_externo_id: externalEventId,
      tipo: normalizedEvent,
      status: 'recebido',
      payload
    }, { onConflict: 'provedor,evento_externo_id' }).select('id').single();

    if (!['MESSAGES_UPSERT', 'SEND_MESSAGE'].includes(normalizedEvent) || !message.phone) {
      if (eventRow?.id) {
        await admin.from('eventos_webhook').update({ status: 'processado', processado_em: new Date().toISOString() }).eq('id', eventRow.id);
      }
      return NextResponse.json({ ok: true, ignored: true, event: normalizedEvent });
    }

    const normalizedPhone = normalizeBrazilianWhatsappNumber(message.phone) || message.phone;
    const { data: clients } = await admin.from('clientes').select('id,nome,telefone').eq('empresa_id', empresaId);
    const client = (clients || []).find((item) => {
      const clientPhone = normalizeBrazilianWhatsappNumber(item.telefone || '');
      return clientPhone === normalizedPhone || clientPhone?.endsWith(normalizedPhone.slice(-10));
    });

    const { data: conversation, error: conversationError } = await admin
      .from('conversas_whatsapp')
      .upsert({
        empresa_id: empresaId,
        cliente_id: client?.id || null,
        telefone: normalizedPhone,
        nome_contato: client?.nome || message.name || null,
        status: message.fromMe ? 'aguardando_cliente' : 'aguardando_equipe',
        ultima_mensagem_em: new Date().toISOString(),
        metadata: { instance: payload.instance || null }
      }, { onConflict: 'empresa_id,telefone' })
      .select('id')
      .single();

    if (conversationError || !conversation) {
      throw new Error(conversationError?.message || 'Não foi possível registrar a conversa.');
    }

    await admin.from('mensagens_whatsapp').upsert({
      empresa_id: empresaId,
      conversa_id: conversation.id,
      cliente_id: client?.id || null,
      id_externo: message.id || externalEventId,
      direcao: message.fromMe ? 'saida' : 'entrada',
      tipo: message.type,
      conteudo: message.text || (message.type === 'texto' ? null : `[${message.type}]`),
      status: message.fromMe ? 'enviada' : 'recebida',
      enviada_por: message.fromMe ? 'equipe' : 'cliente',
      metadata: { event: normalizedEvent },
      enviada_em: new Date().toISOString()
    }, { onConflict: 'empresa_id,id_externo' });

    let taskCreated = false;
    if (!message.fromMe) {
      const { data: existingTask } = await admin
        .from('tarefas_operacionais')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'responder')
        .in('status', ['pendente', 'em_andamento'])
        .contains('metadata', { conversa_id: conversation.id })
        .maybeSingle();

      if (!existingTask) {
        const { data: owner } = await admin
          .from('empresa_membros')
          .select('user_id')
          .eq('empresa_id', empresaId)
          .eq('status', 'ativo')
          .not('user_id', 'is', null)
          .order('created_at')
          .limit(1)
          .maybeSingle();

        if (owner?.user_id) {
          const { error: taskError } = await admin.from('tarefas_operacionais').insert({
            user_id: owner.user_id,
            empresa_id: empresaId,
            cliente_id: client?.id || null,
            tipo: 'responder',
            titulo: `Responder ${client?.nome || message.name || normalizedPhone}`,
            descricao: message.text ? `Mensagem recebida: “${message.text.slice(0, 220)}”` : `Nova mensagem do tipo ${message.type}.`,
            status: 'pendente',
            prioridade: 'normal',
            origem: 'evolution',
            data_limite: new Date().toISOString().slice(0, 10),
            metadata: { conversa_id: conversation.id, mensagem_id: message.id || null }
          });
          taskCreated = !taskError;
        }
      }

      if (process.env.WHATSAPP_AUTO_ACK_ENABLED === 'true') {
        await sendEvolutionText(normalizedPhone, 'Recebi sua mensagem 😊 Já estou verificando e retorno em seguida.').catch(() => null);
      }
    }

    const executionOrigin = message.fromMe ? 'mensagem_enviada' : 'mensagem_recebida';
    const { data: existingExecution } = await admin
      .from('automacao_execucoes')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('evento_origem', executionOrigin)
      .eq('referencia_externa', externalEventId)
      .maybeSingle();

    if (!existingExecution) {
      await admin.from('automacao_execucoes').insert({
        empresa_id: empresaId,
        evento_origem: executionOrigin,
        referencia_externa: externalEventId,
        status: 'concluida',
        entrada: {
          telefone: normalizedPhone,
          cliente_id: client?.id || null,
          tipo_mensagem: message.type,
          evento: normalizedEvent
        },
        saida: {
          conversa_id: conversation.id,
          cliente_localizado: Boolean(client),
          tarefa_criada: taskCreated
        },
        tentativas: 1,
        iniciou_em: new Date().toISOString(),
        concluiu_em: new Date().toISOString()
      });
    }

    await admin.from('integracoes_empresa').upsert({
      empresa_id: empresaId,
      provedor: 'evolution',
      status: 'ativa',
      ultimo_teste_em: new Date().toISOString(),
      ultimo_erro: null,
      configuracao_publica: { ultima_instancia: payload.instance || null, ultimo_evento: normalizedEvent }
    }, { onConflict: 'empresa_id,provedor' });

    if (eventRow?.id) {
      await admin.from('eventos_webhook').update({ status: 'processado', processado_em: new Date().toISOString() }).eq('id', eventRow.id);
    }

    return NextResponse.json({ ok: true, event: normalizedEvent, clientFound: Boolean(client), taskCreated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Erro interno no webhook Evolution.' }, { status: 500 });
  }
}
