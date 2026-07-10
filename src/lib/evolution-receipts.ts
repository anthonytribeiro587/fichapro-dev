import { createAdminServerClient } from '@/lib/server-auth';
import { normalizeBrazilianWhatsappNumber } from '@/lib/whatsapp-provider';

type UnknownRecord = Record<string, any>;

export type EvolutionReceiptCandidate = {
  messageId: string | null;
  remoteJid: string | null;
  status: 'enviada' | 'entregue' | 'lida' | 'falhou';
  rawStatus: string;
};

function statusRank(status: string) {
  if (status === 'lida') return 4;
  if (status === 'entregue') return 3;
  if (status === 'enviada') return 2;
  if (status === 'falhou') return 1;
  return 0;
}

function normalizeStatus(value: unknown): EvolutionReceiptCandidate['status'] | null {
  const raw = String(value ?? '').trim().toUpperCase();
  const numeric = Number(value);

  if (
    raw.includes('PLAYED')
    || raw.includes('READ_SELF')
    || raw === 'READ'
    || raw.includes('ACK_READ')
    || numeric === 4
    || numeric === 5
  ) return 'lida';

  if (
    raw.includes('DELIVERY_ACK')
    || raw.includes('DELIVERED')
    || raw.includes('ACK_DEVICE')
    || raw.includes('ACK_DELIVERED')
    || numeric === 3
  ) return 'entregue';

  if (
    raw.includes('SERVER_ACK')
    || raw === 'SENT'
    || raw === 'PENDING'
    || raw.includes('ACK_SERVER')
    || numeric === 1
    || numeric === 2
  ) return 'enviada';

  if (raw.includes('ERROR') || raw.includes('FAILED') || numeric === 0) return 'falhou';
  return null;
}

function directMessageId(object: UnknownRecord) {
  const keyCandidates = [
    object.key?.id,
    object.message?.key?.id,
    object.update?.key?.id,
    object.data?.key?.id
  ];

  for (const candidate of keyCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  for (const key of ['messageId', 'message_id', 'wamid']) {
    const candidate = object[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  if (
    typeof object.id === 'string'
    && object.id.trim()
    && ('status' in object || 'ack' in object || 'messageStatus' in object || 'update' in object)
    && !object.id.includes('@')
  ) {
    return object.id.trim();
  }

  return null;
}

function directRemoteJid(object: UnknownRecord) {
  const candidates = [
    object.key?.remoteJid,
    object.message?.key?.remoteJid,
    object.update?.key?.remoteJid,
    object.data?.key?.remoteJid,
    object.remoteJid,
    object.remote_jid,
    object.sender
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.includes('@')) return candidate;
  }
  return null;
}

function directStatus(object: UnknownRecord) {
  const candidates = [
    object.update?.status,
    object.update?.messageStatus,
    object.status,
    object.messageStatus,
    object.message_status,
    object.ack
  ];

  for (const candidate of candidates) {
    const normalized = normalizeStatus(candidate);
    if (normalized) return { normalized, raw: String(candidate) };
  }
  return null;
}

export function extractEvolutionReceiptCandidates(payload: unknown) {
  const candidates: EvolutionReceiptCandidate[] = [];

  function visit(
    value: unknown,
    inherited: { messageId: string | null; remoteJid: string | null },
    depth: number
  ) {
    if (!value || depth > 10) return;

    if (Array.isArray(value)) {
      for (const item of value) visit(item, inherited, depth + 1);
      return;
    }

    if (typeof value !== 'object') return;
    const object = value as UnknownRecord;
    const messageId = directMessageId(object) || inherited.messageId;
    const remoteJid = directRemoteJid(object) || inherited.remoteJid;
    const status = directStatus(object);

    if (status && (messageId || remoteJid)) {
      candidates.push({
        messageId,
        remoteJid,
        status: status.normalized,
        rawStatus: status.raw
      });
    }

    const next = { messageId, remoteJid };
    for (const nested of Object.values(object)) visit(nested, next, depth + 1);
  }

  visit(payload, { messageId: null, remoteJid: null }, 0);

  const unique = new Map<string, EvolutionReceiptCandidate>();
  for (const item of candidates) {
    const key = `${item.messageId || ''}:${item.remoteJid || ''}:${item.status}`;
    unique.set(key, item);
  }
  return [...unique.values()];
}

function phoneFromJid(remoteJid: string | null) {
  if (!remoteJid) return null;
  const raw = remoteJid.split('@')[0].replace(/\D/g, '');
  return normalizeBrazilianWhatsappNumber(raw) || raw || null;
}

export async function applyEvolutionReceipts(empresaId: string, payload: unknown) {
  const admin = createAdminServerClient();
  const candidates = extractEvolutionReceiptCandidates(payload);
  let updated = 0;

  for (const candidate of candidates) {
    let target: {
      id: string;
      status: string;
      metadata?: Record<string, unknown> | null;
      conversa_id: string;
      id_externo?: string | null;
    } | null = null;

    if (candidate.messageId) {
      const { data: exact } = await admin
        .from('mensagens_whatsapp')
        .select('id,status,metadata,conversa_id,id_externo')
        .eq('empresa_id', empresaId)
        .eq('direcao', 'saida')
        .eq('id_externo', candidate.messageId)
        .maybeSingle();
      target = exact || null;

      if (!target) {
        const { data: byMetadata } = await admin
          .from('mensagens_whatsapp')
          .select('id,status,metadata,conversa_id,id_externo')
          .eq('empresa_id', empresaId)
          .eq('direcao', 'saida')
          .contains('metadata', { provider_message_id: candidate.messageId })
          .order('enviada_em', { ascending: false })
          .limit(1)
          .maybeSingle();
        target = byMetadata || null;
      }
    }

    if (!target && candidate.remoteJid) {
      const phone = phoneFromJid(candidate.remoteJid);
      if (phone) {
        const { data: conversations } = await admin
          .from('conversas_whatsapp')
          .select('id,telefone')
          .eq('empresa_id', empresaId)
          .limit(100);

        const conversation = (conversations || []).find((item) => {
          const normalized = normalizeBrazilianWhatsappNumber(item.telefone || '') || String(item.telefone || '').replace(/\D/g, '');
          return normalized === phone || normalized.endsWith(phone.slice(-10)) || phone.endsWith(normalized.slice(-10));
        });

        if (conversation?.id) {
          const { data: latest } = await admin
            .from('mensagens_whatsapp')
            .select('id,status,metadata,conversa_id,id_externo')
            .eq('empresa_id', empresaId)
            .eq('conversa_id', conversation.id)
            .eq('direcao', 'saida')
            .order('enviada_em', { ascending: false })
            .limit(1)
            .maybeSingle();
          target = latest || null;
        }
      }
    }

    if (!target || statusRank(candidate.status) <= statusRank(target.status || '')) continue;

    const metadata = {
      ...(target.metadata || {}),
      provider_receipt_status: candidate.rawStatus,
      provider_receipt_at: new Date().toISOString(),
      ...(candidate.messageId ? { provider_message_id: candidate.messageId } : {})
    };

    const { error } = await admin
      .from('mensagens_whatsapp')
      .update({ status: candidate.status, metadata })
      .eq('empresa_id', empresaId)
      .eq('id', target.id);

    if (!error) updated += 1;
  }

  return { candidates: candidates.length, updated };
}
