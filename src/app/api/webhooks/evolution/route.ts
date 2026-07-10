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

function rawMessage(payload: EvolutionPayload) {
  const data = payload.data || {};
  return data.messages?.[0] || data;
}

function messageObject(raw: UnknownRecord) {
  return raw.message || raw.messages?.[0]?.message || {};
}

function messageText(raw: UnknownRecord) {
  const message = messageObject(raw);
  return message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || message.documentMessage?.caption
    || message.buttonsResponseMessage?.selectedDisplayText
    || message.listResponseMessage?.title
    || '';
}

function messageType(raw: UnknownRecord) {
  const message = messageObject(raw);
  if (message.imageMessage) return 'imagem';
  if (message.audioMessage) return 'audio';
  if (message.videoMessage) return 'video';
  if (message.documentMessage) return 'documento';
  if (message.stickerMessage) return 'imagem';
  return 'texto';
}

function mediaNode(raw: UnknownRecord) {
  const message = messageObject(raw);
  return message.imageMessage
    || message.audioMessage
    || message.videoMessage
    || message.documentMessage
    || message.stickerMessage
    || null;
}

function findBase64(value: unknown, depth = 0): string | null {
  if (!value || depth > 5) return null;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of ['base64', 'mediaBase64', 'fileBase64']) {
      const candidate = object[key];
      if (typeof candidate === 'string' && candidate.length > 100) return candidate;
    }
    for (const nested of Object.values(object)) {
      const found = findBase64(nested, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function ignoredRemoteJidReason(remoteJid: string) {
  const jid = remoteJid.toLowerCase();
  const digits = jid.split('@')[0].replace(/\D/g, '');
  if (jid.endsWith('@g.us') || digits.startsWith('120363')) return 'grupo';
  if (jid === 'status@broadcast') return 'status';
  if (jid.endsWith('@broadcast')) return 'broadcast';
  if (jid.endsWith('@newsletter')) return 'canal';
  return null;
}

function extractMessageData(payload: EvolutionPayload) {
  const data = payload.data || {};
  const raw = rawMessage(payload);
  const key = raw.key || data.key || {};
  const remoteJid = String(key.remoteJid || raw.remoteJid || data.remoteJid || payload.sender || '');
  const phone = remoteJid.split('@')[0].replace(/\D/g, '');
  return {
    raw,
    key,
    id: String(key.id || raw.id || data.id || ''),
    phone,
    remoteJid,
    ignoredReason: ignoredRemoteJidReason(remoteJid),
    fromMe: Boolean(key.fromMe ?? raw.fromMe ?? data.fromMe),
    name: String(raw.pushName || data.pushName || data.name || ''),
    text: messageText(raw),
    type: messageType(raw)
  };
}

function normalizeMessageStatus(value: unknown) {
  const raw = String(value ?? '').toUpperCase();
  const numeric = Number(value);
  if (raw.includes('PLAYED') || raw.includes('READ') || numeric >= 4) return 'lida';
  if (raw.includes('DELIVERY') || raw.includes('DELIVERED') || numeric === 3) return 'entregue';
  if (raw.includes('SERVER_ACK') || raw.includes('SENT') || numeric === 2) return 'enviada';
  if (raw.includes('ERROR') || raw.includes('FAILED') || numeric === 0) return 'falhou';
  return null;
}

function extensionFromMime(mime: string, type: string) {
  const clean = mime.split(';')[0].toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
    'video/mp4': 'mp4', 'application/pdf': 'pdf'
  };
  return map[clean] || clean.split('/')[1]?.replace(/[^a-z0-9]/g, '') || type;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const empresaId = url.searchParams.get('empresa_id');
  const receivedSecret = url.searchParams.get('secret') || request.headers.get('x-webhook-secret');
  let eventRowId: string | null = null;

  if (!empresaId || !secretMatches(receivedSecret, process.env.WHATSAPP_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false, error: 'Webhook não autorizado.' }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({})) as EvolutionPayload;
  const normalizedEvent = String(payload.event || 'UNKNOWN').toUpperCase().replace(/[.-]/g, '_');

  try {
    const admin = createAdminServerClient();
    const message = extractMessageData(payload);
    const updateStatus = normalizeMessageStatus(
      message.raw.update?.status
      ?? message.raw.status
      ?? payload.data?.update?.status
      ?? payload.data?.status
    );
    const externalEventId = normalizedEvent === 'MESSAGES_UPDATE'
      ? `${message.id || 'unknown'}:${updateStatus || payload.date_time || Date.now()}`
      : message.id || `${normalizedEvent}:${payload.date_time || Date.now()}:${message.remoteJid || 'unknown'}`;

    const { data: duplicated } = await admin
      .from('eventos_webhook')
      .select('id,status')
      .eq('provedor', 'evolution')
      .eq('evento_externo_id', externalEventId)
      .maybeSingle();

    if (duplicated?.status === 'processado') return NextResponse.json({ ok: true, duplicated: true });

    const { data: eventRow, error: eventError } = await admin.from('eventos_webhook').upsert({
      empresa_id: empresaId,
      provedor: 'evolution',
      evento_externo_id: externalEventId,
      tipo: normalizedEvent,
      status: 'recebido',
      payload,
      erro: null
    }, { onConflict: 'provedor,evento_externo_id' }).select('id').single();

    if (eventError) throw new Error(`Não foi possível registrar o evento da Evolution: ${eventError.message}`);
    eventRowId = eventRow?.id || null;

    if (normalizedEvent === 'MESSAGES_UPDATE') {
      if (message.id && updateStatus) {
        await admin.from('mensagens_whatsapp')
          .update({ status: updateStatus })
          .eq('empresa_id', empresaId)
          .eq('id_externo', message.id)
          .eq('direcao', 'saida');
      }
      if (eventRowId) await admin.from('eventos_webhook').update({ status: 'processado', processado_em: new Date().toISOString() }).eq('id', eventRowId);
      return NextResponse.json({ ok: true, event: normalizedEvent, messageStatus: updateStatus });
    }

    if (message.ignoredReason) {
      if (eventRowId) {
        await admin.from('eventos_webhook').update({
          status: 'ignorado',
          erro: `Ignorado automaticamente: ${message.ignoredReason}.`,
          processado_em: new Date().toISOString()
        }).eq('id', eventRowId);
      }
      return NextResponse.json({ ok: true, ignored: true, reason: message.ignoredReason });
    }

    if (!['MESSAGES_UPSERT', 'SEND_MESSAGE'].includes(normalizedEvent) || !message.phone) {
      if (eventRowId) await admin.from('eventos_webhook').update({ status: 'ignorado', processado_em: new Date().toISOString() }).eq('id', eventRowId);
      return NextResponse.json({ ok: true, ignored: true, event: normalizedEvent });
    }

    const normalizedPhone = normalizeBrazilianWhatsappNumber(message.phone) || message.phone;
    const { data: clients } = await admin.from('clientes').select('id,nome,telefone,user_id').eq('empresa_id', empresaId);
    const client = (clients || []).find((item) => {
      const clientPhone = normalizeBrazilianWhatsappNumber(item.telefone || '');
      return clientPhone === normalizedPhone || clientPhone?.endsWith(normalizedPhone.slice(-10));
    });

    const { data: existingConversation } = await admin
      .from('conversas_whatsapp')
      .select('id,nome_contato,cliente_id,metadata')
      .eq('empresa_id', empresaId)
      .eq('telefone', normalizedPhone)
      .maybeSingle();

    const conversationPayload: Record<string, unknown> = {
      empresa_id: empresaId,
      cliente_id: client?.id || existingConversation?.cliente_id || null,
      telefone: normalizedPhone,
      status: message.fromMe ? 'aguardando_cliente' : 'aguardando_equipe',
      ultima_mensagem_em: new Date().toISOString(),
      metadata: { ...(existingConversation?.metadata || {}), instance: payload.instance || null, remote_jid: message.remoteJid }
    };
    if (!message.fromMe) conversationPayload.nome_contato = client?.nome || message.name || existingConversation?.nome_contato || null;

    const conversationQuery = existingConversation
      ? admin.from('conversas_whatsapp').update(conversationPayload).eq('id', existingConversation.id).select('id').single()
      : admin.from('conversas_whatsapp').insert({ ...conversationPayload, nome_contato: client?.nome || (!message.fromMe ? message.name : null) }).select('id').single();
    const { data: conversation, error: conversationError } = await conversationQuery;

    if (conversationError || !conversation) throw new Error(conversationError?.message || 'Não foi possível registrar a conversa.');

    const node = mediaNode(message.raw);
    const base64 = message.type !== 'texto' ? findBase64(payload) : null;
    const mime = String(node?.mimetype || node?.mimeType || 'application/octet-stream');
    const fileName = String(node?.fileName || node?.filename || `${message.type}-${message.id || Date.now()}.${extensionFromMime(mime, message.type)}`);
    const messageMetadata: Record<string, unknown> = { event: normalizedEvent, remote_jid: message.remoteJid };

    if (base64) {
      const cleanBase64 = base64.includes(',') ? base64.split(',').pop() || '' : base64;
      const buffer = Buffer.from(cleanBase64, 'base64');
      if (buffer.length > 0 && buffer.length <= 20 * 1024 * 1024) {
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${empresaId}/${conversation.id}/${message.id || crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await admin.storage.from('whatsapp-media').upload(path, buffer, {
          contentType: mime,
          upsert: true
        });
        if (!uploadError) {
          messageMetadata.arquivo_path = path;
          messageMetadata.arquivo_nome = fileName;
          messageMetadata.arquivo_mime = mime;
          messageMetadata.arquivo_tamanho = buffer.length;
        } else {
          messageMetadata.media_erro = uploadError.message;
        }
      } else if (buffer.length > 20 * 1024 * 1024) {
        messageMetadata.media_erro = 'Arquivo maior que 20 MB.';
      }
    }

    const { data: existingMessage } = message.id
      ? await admin.from('mensagens_whatsapp').select('id,metadata,status').eq('empresa_id', empresaId).eq('id_externo', message.id).maybeSingle()
      : { data: null };

    const row = {
      empresa_id: empresaId,
      conversa_id: conversation.id,
      cliente_id: client?.id || null,
      id_externo: message.id || externalEventId,
      direcao: message.fromMe ? 'saida' : 'entrada',
      tipo: message.type,
      conteudo: message.text || (message.type === 'texto' ? null : `[${message.type}]`),
      status: message.fromMe ? existingMessage?.status || 'enviada' : 'recebida',
      enviada_por: message.fromMe ? 'equipe' : 'cliente',
      metadata: { ...(existingMessage?.metadata || {}), ...messageMetadata },
      enviada_em: new Date().toISOString()
    };

    const { error: messageError } = existingMessage
      ? await admin.from('mensagens_whatsapp').update(row).eq('id', existingMessage.id)
      : await admin.from('mensagens_whatsapp').insert(row);
    if (messageError) throw new Error(`Não foi possível salvar a mensagem: ${messageError.message}`);

    let taskCreated = false;
    let taskAlreadyOpen = false;
    if (!message.fromMe) {
      const { data: existingTask } = await admin
        .from('tarefas_operacionais')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'responder')
        .in('status', ['pendente', 'em_andamento'])
        .contains('metadata', { conversa_id: conversation.id })
        .maybeSingle();
      taskAlreadyOpen = Boolean(existingTask);

      if (!existingTask) {
        const [ownerResult, integrationResult] = await Promise.all([
          admin.from('empresa_membros').select('user_id').eq('empresa_id', empresaId).eq('status', 'ativo').not('user_id', 'is', null).order('created_at').limit(1).maybeSingle(),
          admin.from('integracoes_empresa').select('user_id').eq('empresa_id', empresaId).eq('provedor', 'evolution').maybeSingle()
        ]);
        const taskUserId = ownerResult.data?.user_id || integrationResult.data?.user_id || client?.user_id || null;
        if (!taskUserId) throw new Error('Mensagem recebida, mas nenhum usuário ativo está vinculado à empresa.');

        const { error: taskError } = await admin.from('tarefas_operacionais').insert({
          user_id: taskUserId,
          responsavel_user_id: taskUserId,
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
        if (taskError) throw new Error(`Mensagem recebida, mas a tarefa de resposta não foi criada: ${taskError.message}`);
        taskCreated = true;
      }

      if (process.env.WHATSAPP_AUTO_ACK_ENABLED === 'true') {
        await sendEvolutionText(normalizedPhone, 'Recebi sua mensagem 😊 Já estou verificando e retorno em seguida.').catch(() => null);
      }
    }

    const executionOrigin = message.fromMe ? 'mensagem_enviada' : 'mensagem_recebida';
    const { data: existingExecution } = await admin.from('automacao_execucoes').select('id').eq('empresa_id', empresaId).eq('evento_origem', executionOrigin).eq('referencia_externa', externalEventId).maybeSingle();
    if (!existingExecution) {
      await admin.from('automacao_execucoes').insert({
        empresa_id: empresaId,
        evento_origem: executionOrigin,
        referencia_externa: externalEventId,
        status: 'concluida',
        entrada: { telefone: normalizedPhone, cliente_id: client?.id || null, tipo_mensagem: message.type, evento: normalizedEvent },
        saida: { conversa_id: conversation.id, cliente_localizado: Boolean(client), tarefa_criada: taskCreated, tarefa_ja_aberta: taskAlreadyOpen },
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

    if (eventRowId) await admin.from('eventos_webhook').update({ status: 'processado', erro: null, processado_em: new Date().toISOString() }).eq('id', eventRowId);
    return NextResponse.json({ ok: true, event: normalizedEvent, clientFound: Boolean(client), taskCreated, taskAlreadyOpen });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno no webhook Evolution.';
    try {
      const admin = createAdminServerClient();
      if (eventRowId) await admin.from('eventos_webhook').update({ status: 'erro', erro: message, processado_em: new Date().toISOString() }).eq('id', eventRowId);
      await admin.from('integracoes_empresa').update({ ultimo_erro: message, ultimo_teste_em: new Date().toISOString() }).eq('empresa_id', empresaId).eq('provedor', 'evolution');
    } catch {
      // Mantém o erro original do webhook.
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
