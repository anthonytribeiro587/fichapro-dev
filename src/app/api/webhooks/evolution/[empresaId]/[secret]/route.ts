import { timingSafeEqual } from 'node:crypto';
import { POST as processEvolutionWebhook } from '../../route';
import { normalizeBrazilianWhatsappNumber } from '@/lib/whatsapp-provider';
import { createAdminServerClient } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ empresaId: string; secret: string }>;
};

type UnknownRecord = Record<string, any>;

function secretMatches(received: string, expected: string | undefined) {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeEvent(value: unknown) {
  return String(value || 'UNKNOWN').toUpperCase().replace(/[.-]/g, '_');
}

function statusRank(status: string) {
  if (status === 'lida') return 4;
  if (status === 'entregue') return 3;
  if (status === 'enviada') return 2;
  if (status === 'falhou') return 1;
  return 0;
}

function normalizeStatus(value: unknown) {
  const raw = String(value ?? '').toUpperCase();
  const numeric = Number(value);
  if (raw.includes('PLAYED') || raw.includes('READ') || raw === '4' || numeric >= 4) return 'lida';
  if (raw.includes('DELIVERY') || raw.includes('DELIVERED') || raw === '3' || numeric === 3) return 'entregue';
  if (raw.includes('SERVER_ACK') || raw.includes('SENT') || raw === '2' || numeric === 2) return 'enviada';
  if (raw.includes('ERROR') || raw.includes('FAILED') || raw === '0' || numeric === 0) return 'falhou';
  return null;
}

function findStatus(value: unknown, depth = 0): string | null {
  if (!value || depth > 7) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStatus(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  const object = value as UnknownRecord;
  for (const key of ['status', 'messageStatus', 'message_status', 'ack']) {
    if (key in object) {
      const normalized = normalizeStatus(object[key]);
      if (normalized) return normalized;
    }
  }
  for (const item of Object.values(object)) {
    const found = findStatus(item, depth + 1);
    if (found) return found;
  }
  return null;
}

function findMessageId(value: unknown, depth = 0): string | null {
  if (!value || depth > 7) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMessageId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  const object = value as UnknownRecord;
  if (object.key && typeof object.key === 'object' && typeof object.key.id === 'string') {
    return object.key.id;
  }
  for (const key of ['messageId', 'message_id', 'id']) {
    const candidate = object[key];
    if (typeof candidate === 'string' && candidate.length >= 8 && !candidate.includes('@')) return candidate;
  }
  for (const item of Object.values(object)) {
    const found = findMessageId(item, depth + 1);
    if (found) return found;
  }
  return null;
}

function findRemoteJid(value: unknown, depth = 0): string | null {
  if (!value || depth > 7) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRemoteJid(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  const object = value as UnknownRecord;
  for (const key of ['remoteJid', 'remote_jid', 'sender']) {
    const candidate = object[key];
    if (typeof candidate === 'string' && candidate.includes('@')) return candidate;
  }
  for (const item of Object.values(object)) {
    const found = findRemoteJid(item, depth + 1);
    if (found) return found;
  }
  return null;
}

async function updateMessageReceipt(empresaId: string, payload: UnknownRecord) {
  const nextStatus = findStatus(payload);
  if (!nextStatus) return;

  const admin = createAdminServerClient();
  const messageId = findMessageId(payload);
  const remoteJid = findRemoteJid(payload);
  let target: { id: string; status: string } | null = null;

  if (messageId) {
    const { data } = await admin
      .from('mensagens_whatsapp')
      .select('id,status')
      .eq('empresa_id', empresaId)
      .eq('id_externo', messageId)
      .eq('direcao', 'saida')
      .maybeSingle();
    target = data || null;
  }

  if (!target && remoteJid) {
    const phone = normalizeBrazilianWhatsappNumber(remoteJid.split('@')[0]) || remoteJid.split('@')[0].replace(/\D/g, '');
    const { data: conversation } = await admin
      .from('conversas_whatsapp')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('telefone', phone)
      .maybeSingle();

    if (conversation?.id) {
      const { data: latest } = await admin
        .from('mensagens_whatsapp')
        .select('id,status')
        .eq('empresa_id', empresaId)
        .eq('conversa_id', conversation.id)
        .eq('direcao', 'saida')
        .order('enviada_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      target = latest || null;
    }
  }

  if (!target || statusRank(nextStatus) <= statusRank(target.status || '')) return;

  await admin
    .from('mensagens_whatsapp')
    .update({ status: nextStatus })
    .eq('id', target.id)
    .eq('empresa_id', empresaId);
}

export async function POST(request: Request, context: RouteContext) {
  const { empresaId, secret } = await context.params;
  const body = await request.text();

  if (secretMatches(secret, process.env.WHATSAPP_WEBHOOK_SECRET)) {
    try {
      const payload = JSON.parse(body) as UnknownRecord;
      const event = normalizeEvent(payload.event);
      if (event === 'MESSAGES_UPDATE' || event === 'MESSAGE_UPDATE') {
        await updateMessageReceipt(empresaId, payload);
      }
    } catch {
      // O processador principal mantém o diagnóstico do payload inválido.
    }
  }

  const url = new URL(request.url);
  url.searchParams.set('empresa_id', empresaId);
  url.searchParams.set('secret', secret);

  const forwarded = new Request(url.toString(), {
    method: 'POST',
    headers: request.headers,
    body
  });

  return processEvolutionWebhook(forwarded);
}
