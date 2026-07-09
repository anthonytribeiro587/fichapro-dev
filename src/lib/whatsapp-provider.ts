export type WhatsappProvider = 'evolution' | 'waha';

export function getWhatsappProvider(): WhatsappProvider {
  return (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase() === 'waha' ? 'waha' : 'evolution';
}

export function normalizeBrazilianWhatsappNumber(phone: string) {
  const digits = String(phone || '').replace(/\D/g, '');

  if (!digits) return null;

  // Já veio com DDI. Ex.: 5551999999999
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return digits;
  }

  // Veio como DDD + número. Ex.: 51999999999
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  // Fallback para testes internacionais.
  if (digits.length >= 8 && digits.length <= 15) {
    return digits;
  }

  return null;
}

export function getEvolutionConfig() {
  return {
    baseUrl: process.env.EVOLUTION_API_URL?.replace(/\/$/, ''),
    apiKey: process.env.EVOLUTION_API_KEY,
    instance: process.env.EVOLUTION_INSTANCE || 'nextlead'
  };
}

export function buildEvolutionHeaders(apiKey?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    headers.apikey = apiKey;
  }

  return headers;
}
