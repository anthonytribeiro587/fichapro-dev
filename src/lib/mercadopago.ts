import { createHmac, timingSafeEqual } from 'node:crypto';

const API_BASE = (process.env.MERCADO_PAGO_API_URL || 'https://api.mercadopago.com').replace(/\/$/, '');

export type MercadoPagoAccount = {
  id?: number;
  nickname?: string;
  email?: string;
  site_id?: string;
};

export type MercadoPagoOrder = {
  id: string;
  external_reference?: string;
  status?: string;
  status_detail?: string;
  total_amount?: string;
  transactions?: {
    payments?: Array<{
      id?: string;
      status?: string;
      status_detail?: string;
      amount?: string;
      payment_method?: {
        id?: string;
        type?: string;
        ticket_url?: string;
        qr_code?: string;
        qr_code_base64?: string;
      };
    }>;
  };
};

export function getMercadoPagoConfig() {
  return {
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
    webhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET,
    apiBase: API_BASE
  };
}

function flattenProviderMessages(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenProviderMessages);
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return [
      ...flattenProviderMessages(object.message),
      ...flattenProviderMessages(object.error),
      ...flattenProviderMessages(object.description),
      ...flattenProviderMessages(object.code),
      ...flattenProviderMessages(object.cause),
      ...flattenProviderMessages(object.causes),
      ...flattenProviderMessages(object.errors),
      ...flattenProviderMessages(object.details)
    ];
  }
  return [];
}

function mercadoPagoApiMessage(data: unknown, status: number) {
  const messages = [...new Set(flattenProviderMessages(data).filter(Boolean))];
  return messages.length
    ? `Mercado Pago (${status}): ${messages.join(' | ')}`
    : `Mercado Pago respondeu com status ${status}.`;
}

export async function mercadoPagoRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { accessToken } = getMercadoPagoConfig();
  if (!accessToken) throw new Error('MERCADO_PAGO_NOT_CONFIGURED');

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {})
    },
    cache: 'no-store'
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`MERCADO_PAGO_ERROR:${mercadoPagoApiMessage(data, response.status)}`);
  }
  return data as T;
}

export async function testMercadoPagoConnection() {
  return mercadoPagoRequest<MercadoPagoAccount>('/users/me');
}

export function isMercadoPagoTestAccount(account: MercadoPagoAccount | null | undefined) {
  const nickname = String(account?.nickname || '').toUpperCase();
  const email = String(account?.email || '').toLowerCase();
  return nickname.startsWith('TESTUSER') || email.endsWith('@testuser.com');
}

export async function createPixOrder(input: {
  amount: number;
  externalReference: string;
  payerEmail: string;
  idempotencyKey: string;
  expirationTime?: string;
  testMode?: boolean;
}) {
  const payer = input.testMode
    ? { email: 'test_user_br@testuser.com', first_name: 'APRO' }
    : { email: input.payerEmail };

  const payment: Record<string, unknown> = {
    amount: input.amount.toFixed(2),
    payment_method: { id: 'pix', type: 'bank_transfer' }
  };

  if (!input.testMode) payment.expiration_time = input.expirationTime || 'P1D';

  const body = {
    type: 'online',
    total_amount: input.amount.toFixed(2),
    external_reference: input.externalReference,
    processing_mode: 'automatic',
    transactions: { payments: [payment] },
    payer
  };

  return mercadoPagoRequest<MercadoPagoOrder>('/v1/orders', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify(body)
  });
}

export async function getMercadoPagoOrder(orderId: string) {
  return mercadoPagoRequest<MercadoPagoOrder>(`/v1/orders/${encodeURIComponent(orderId)}`);
}

export function extractPixData(order: MercadoPagoOrder) {
  const payment = order.transactions?.payments?.[0];
  return {
    orderId: order.id,
    paymentId: payment?.id || null,
    status: payment?.status || order.status || 'unknown',
    statusDetail: payment?.status_detail || order.status_detail || null,
    ticketUrl: payment?.payment_method?.ticket_url || null,
    qrCode: payment?.payment_method?.qr_code || null,
    qrCodeBase64: payment?.payment_method?.qr_code_base64 || null
  };
}

export function normalizeMercadoPagoStatus(order: MercadoPagoOrder) {
  const raw = String(order.transactions?.payments?.[0]?.status || order.status || '').toLowerCase();
  if (['approved', 'processed', 'paid'].includes(raw)) return 'pago';
  if (['cancelled', 'canceled'].includes(raw)) return 'cancelado';
  if (['expired'].includes(raw)) return 'expirado';
  if (['rejected', 'failed'].includes(raw)) return 'falhou';
  return 'pendente';
}

export function validateMercadoPagoWebhookSignature(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}) {
  const { webhookSecret } = getMercadoPagoConfig();
  if (!webhookSecret) return false;
  if (!input.xSignature || !input.xRequestId || !input.dataId) return false;

  const values = Object.fromEntries(
    input.xSignature.split(',').map((part) => {
      const [key, value] = part.trim().split('=');
      return [key, value];
    })
  );
  const ts = values.ts;
  const signature = values.v1;
  if (!ts || !signature) return false;

  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.xRequestId};ts:${ts};`;
  const expected = createHmac('sha256', webhookSecret).update(manifest).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signature, 'utf8');
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function mercadoPagoErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Erro desconhecido ao comunicar com o Mercado Pago.';
  if (error.message === 'MERCADO_PAGO_NOT_CONFIGURED') return 'MERCADO_PAGO_ACCESS_TOKEN não configurado na Vercel DEV.';
  if (error.message.startsWith('MERCADO_PAGO_ERROR:')) return error.message.replace('MERCADO_PAGO_ERROR:', '');
  return error.message;
}
