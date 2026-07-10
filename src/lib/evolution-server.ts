import { buildEvolutionHeaders, getEvolutionConfig, normalizeBrazilianWhatsappNumber } from './whatsapp-provider';

class EvolutionRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'EvolutionRequestError';
    this.status = status;
  }
}

type EvolutionMediaInput = {
  mediaType: 'image' | 'video' | 'document';
  mimeType: string;
  mediaUrl: string;
  fileName: string;
  caption?: string;
};

function collectMessages(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(collectMessages);
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return [
      ...collectMessages(object.message),
      ...collectMessages(object.error),
      ...collectMessages(object.description),
      ...collectMessages(object.details),
      ...collectMessages(object.response)
    ];
  }
  return [];
}

function findStringByKeys(value: unknown, keys: string[], depth = 0): string | null {
  if (!value || depth > 6) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKeys(item, keys, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;

  const object = value as Record<string, unknown>;
  const normalized = new Set(keys.map((key) => key.toLowerCase()));
  for (const [key, item] of Object.entries(object)) {
    if (normalized.has(key.toLowerCase()) && typeof item === 'string' && item.trim()) return item.trim();
  }
  for (const item of Object.values(object)) {
    const found = findStringByKeys(item, keys, depth + 1);
    if (found) return found;
  }
  return null;
}

async function evolutionRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, apiKey } = getEvolutionConfig();
  if (!baseUrl || !apiKey) throw new Error('EVOLUTION_NOT_CONFIGURED');

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...buildEvolutionHeaders(apiKey), ...(init.headers || {}) },
    cache: 'no-store'
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const messages = [...new Set(collectMessages(data).filter(Boolean))];
    const message = messages.length
      ? messages.join(' | ')
      : `Evolution respondeu com status ${response.status}.`;
    throw new EvolutionRequestError(response.status, message);
  }
  return data as T;
}

export async function getEvolutionConnectionState() {
  const { instance } = getEvolutionConfig();
  if (!instance) throw new Error('EVOLUTION_NOT_CONFIGURED');
  return evolutionRequest<Record<string, unknown>>(`/instance/connectionState/${encodeURIComponent(instance)}`);
}

export async function getEvolutionWebhook() {
  const { instance } = getEvolutionConfig();
  if (!instance) throw new Error('EVOLUTION_NOT_CONFIGURED');
  return evolutionRequest<Record<string, unknown>>(`/webhook/find/${encodeURIComponent(instance)}`);
}

const webhookEvents = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CONNECTION_UPDATE'];

export async function setEvolutionWebhook(webhookUrl: string) {
  const { instance } = getEvolutionConfig();
  if (!instance) throw new Error('EVOLUTION_NOT_CONFIGURED');

  const officialPayload = {
    enabled: true,
    url: webhookUrl,
    webhook_by_events: false,
    webhook_base64: true,
    events: webhookEvents
  };

  const camelPayload = {
    enabled: true,
    url: webhookUrl,
    webhookByEvents: false,
    webhookBase64: true,
    events: webhookEvents
  };

  const attempts: Array<Record<string, unknown>> = [
    officialPayload,
    { webhook: officialPayload },
    { webhook: camelPayload },
    camelPayload
  ];

  const rejected: string[] = [];
  for (const payload of attempts) {
    try {
      return await evolutionRequest<Record<string, unknown>>(`/webhook/set/${encodeURIComponent(instance)}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (!(error instanceof EvolutionRequestError) || ![400, 404, 422].includes(error.status)) throw error;
      rejected.push(`${error.status}: ${error.message}`);
    }
  }

  throw new Error(`EVOLUTION_WEBHOOK_REJECTED:${[...new Set(rejected)].join(' || ')}`);
}

export async function fetchEvolutionProfilePicture(phone: string) {
  const { instance } = getEvolutionConfig();
  if (!instance) throw new Error('EVOLUTION_NOT_CONFIGURED');
  const number = normalizeBrazilianWhatsappNumber(phone);
  if (!number) throw new Error('INVALID_PHONE');

  const attempts = [
    { number },
    { number: `${number}@s.whatsapp.net` }
  ];

  for (const payload of attempts) {
    try {
      const response = await evolutionRequest<Record<string, unknown>>(
        `/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      const url = findStringByKeys(response, [
        'profilePictureUrl',
        'profilePicUrl',
        'pictureUrl',
        'profile_picture_url',
        'url'
      ]);
      return { url, raw: response };
    } catch (error) {
      if (!(error instanceof EvolutionRequestError) || ![400, 404, 422].includes(error.status)) throw error;
    }
  }

  return { url: null, raw: null };
}

export async function sendEvolutionText(phone: string, message: string) {
  const { instance } = getEvolutionConfig();
  if (!instance) throw new Error('EVOLUTION_NOT_CONFIGURED');
  const number = normalizeBrazilianWhatsappNumber(phone);
  if (!number) throw new Error('INVALID_PHONE');

  try {
    return await evolutionRequest<Record<string, unknown>>(`/message/sendText/${encodeURIComponent(instance)}`, {
      method: 'POST',
      body: JSON.stringify({ number, text: message, delay: 700, linkPreview: false })
    });
  } catch (error) {
    if (!(error instanceof EvolutionRequestError) || ![400, 422].includes(error.status)) throw error;
    return evolutionRequest<Record<string, unknown>>(`/message/sendText/${encodeURIComponent(instance)}`, {
      method: 'POST',
      body: JSON.stringify({
        number,
        textMessage: { text: message },
        delay: 700,
        linkPreview: false
      })
    });
  }
}

export async function sendEvolutionMedia(phone: string, input: EvolutionMediaInput) {
  const { instance } = getEvolutionConfig();
  if (!instance) throw new Error('EVOLUTION_NOT_CONFIGURED');
  const number = normalizeBrazilianWhatsappNumber(phone);
  if (!number) throw new Error('INVALID_PHONE');

  const payload = {
    number,
    mediatype: input.mediaType,
    mimetype: input.mimeType,
    caption: input.caption || '',
    media: input.mediaUrl,
    fileName: input.fileName,
    delay: 700
  };

  try {
    return await evolutionRequest<Record<string, unknown>>(`/message/sendMedia/${encodeURIComponent(instance)}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (!(error instanceof EvolutionRequestError) || ![400, 404, 422].includes(error.status)) throw error;
    return evolutionRequest<Record<string, unknown>>(`/message/sendMedia/${encodeURIComponent(instance)}`, {
      method: 'POST',
      body: JSON.stringify({ number, mediaMessage: payload, delay: 700 })
    });
  }
}

export async function sendEvolutionAudio(phone: string, mediaUrl: string) {
  const { instance } = getEvolutionConfig();
  if (!instance) throw new Error('EVOLUTION_NOT_CONFIGURED');
  const number = normalizeBrazilianWhatsappNumber(phone);
  if (!number) throw new Error('INVALID_PHONE');

  try {
    return await evolutionRequest<Record<string, unknown>>(`/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`, {
      method: 'POST',
      body: JSON.stringify({ number, audio: mediaUrl, delay: 700, encoding: true })
    });
  } catch (error) {
    if (!(error instanceof EvolutionRequestError) || ![400, 404, 422].includes(error.status)) throw error;
    return evolutionRequest<Record<string, unknown>>(`/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`, {
      method: 'POST',
      body: JSON.stringify({ number, audioMessage: { audio: mediaUrl }, delay: 700 })
    });
  }
}

export function evolutionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Erro desconhecido na Evolution API.';
  if (error.message === 'EVOLUTION_NOT_CONFIGURED') return 'Evolution API não configurada na Vercel DEV.';
  if (error.message === 'INVALID_PHONE') return 'Telefone inválido para envio no WhatsApp.';
  if (error.message.startsWith('EVOLUTION_WEBHOOK_REJECTED:')) {
    return `A Evolution recusou a configuração do webhook: ${error.message.replace('EVOLUTION_WEBHOOK_REJECTED:', '')}`;
  }
  if (error instanceof EvolutionRequestError) return error.message;
  return error.message;
}
