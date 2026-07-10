import { buildEvolutionHeaders, getEvolutionConfig, normalizeBrazilianWhatsappNumber } from './whatsapp-provider';

class EvolutionRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'EvolutionRequestError';
    this.status = status;
  }
}

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
    webhook_base64: false,
    events: webhookEvents
  };

  const camelPayload = {
    enabled: true,
    url: webhookUrl,
    webhookByEvents: false,
    webhookBase64: false,
    events: webhookEvents
  };

  // Evolution v2 installations differ slightly by patch/version. The first
  // payload follows the current official documentation. The remaining forms
  // preserve compatibility with older v2 builds.
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
