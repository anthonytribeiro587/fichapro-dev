export type WahaSendPayload = {
  phone: string;
  message: string;
  session?: string;
};

export function getWahaConfig() {
  return {
    baseUrl: process.env.WAHA_BASE_URL?.replace(/\/$/, ''),
    apiKey: process.env.WAHA_API_KEY,
    session: process.env.WAHA_SESSION || 'fichapro'
  };
}

export function normalizeBrazilianWhatsappChatId(phone: string) {
  const digits = String(phone || '').replace(/\D/g, '');

  if (!digits) return null;

  // Já veio com DDI. Ex.: 5551999999999
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return `${digits}@c.us`;
  }

  // Veio como DDD + número. Ex.: 51999999999
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}@c.us`;
  }

  // Fallback para testes internacionais ou números já normalizados sem @c.us.
  if (digits.length >= 8 && digits.length <= 15) {
    return `${digits}@c.us`;
  }

  return null;
}

export function buildWahaHeaders(apiKey?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    headers['X-Api-Key'] = apiKey;
  }

  return headers;
}
