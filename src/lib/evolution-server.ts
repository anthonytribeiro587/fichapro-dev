import { buildEvolutionHeaders, getEvolutionConfig, normalizeBrazilianWhatsappNumber } from './whatsapp-provider';

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
    const message = data?.message || data?.error || `Evolution respondeu com status ${response.status}.`;
    throw new Error(`EVOLUTION_ERROR:${message}`);
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

export async function setEvolutionWebhook(webhookUrl: string) {
  const { instance } = getEvolutionConfig();
  if (!instance) throw new Error('EVOLUTION_NOT_CONFIGURED');
  return evolutionRequest<Record<string, unknown>>(`/webhook/set/${encodeURIComponent(instance)}`, {
    method: 'POST',
    body: JSON.stringify({
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhookBase64: false,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CONNECTION_UPDATE']
    })
  });
}

export async function sendEvolutionText(phone: string, message: string) {
  const { instance } = getEvolutionConfig();
  if (!instance) throw new Error('EVOLUTION_NOT_CONFIGURED');
  const number = normalizeBrazilianWhatsappNumber(phone);
  if (!number) throw new Error('INVALID_PHONE');

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

export function evolutionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Erro desconhecido na Evolution API.';
  if (error.message === 'EVOLUTION_NOT_CONFIGURED') return 'Evolution API não configurada na Vercel DEV.';
  if (error.message === 'INVALID_PHONE') return 'Telefone inválido para envio no WhatsApp.';
  if (error.message.startsWith('EVOLUTION_ERROR:')) return error.message.replace('EVOLUTION_ERROR:', '');
  return error.message;
}
