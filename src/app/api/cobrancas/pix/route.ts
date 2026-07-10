import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  createPixOrder,
  extractPixData,
  isMercadoPagoTestAccount,
  mercadoPagoErrorMessage,
  testMercadoPagoConnection
} from '@/lib/mercadopago';
import { isAuthError, requireAuthenticatedUser } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const maxDuration = 45;

type CreatePixBody = {
  empresa_id?: string;
  cliente_id?: string;
  parcela_id?: string | null;
  assinatura_id?: string | null;
  valor?: number;
  vencimento?: string | null;
  descricao?: string;
  payer_email?: string;
  chave_idempotencia?: string;
};

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => null) as CreatePixBody | null;

    const empresaId = body?.empresa_id?.trim();
    const clienteId = body?.cliente_id?.trim();
    const amount = Number(body?.valor || 0);

    if (!empresaId || !clienteId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: 'Informe empresa, cliente e um valor válido.' }, { status: 400 });
    }

    const [{ data: empresa }, { data: cliente, error: clienteError }] = await Promise.all([
      supabase.from('empresas').select('id,nome').eq('id', empresaId).single(),
      supabase.from('clientes').select('id,nome,email,empresa_id').eq('id', clienteId).eq('empresa_id', empresaId).single()
    ]);

    if (!empresa || clienteError || !cliente) {
      return NextResponse.json({ ok: false, error: 'Empresa ou cliente não encontrado para este acesso.' }, { status: 403 });
    }

    const payerEmail = body?.payer_email?.trim().toLowerCase() || cliente.email?.trim().toLowerCase();
    if (!payerEmail || !payerEmail.includes('@')) {
      return NextResponse.json({ ok: false, error: 'Cadastre um e-mail válido para o cliente antes de gerar o Pix.' }, { status: 400 });
    }

    const account = await testMercadoPagoConnection();
    const testMode = isMercadoPagoTestAccount(account);
    const idempotencyKey = body?.chave_idempotencia?.trim() || randomUUID();

    const { data: existing } = await supabase
      .from('cobrancas_integradas')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('chave_idempotencia', idempotencyKey)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, reused: true, test_mode: testMode, cobranca: existing });
    }

    const reference = `fichapro-${empresaId.slice(0, 8)}-${randomUUID()}`;
    const order = await createPixOrder({
      amount,
      externalReference: reference,
      payerEmail,
      idempotencyKey,
      testMode
    });
    const pix = extractPixData(order);

    const { data: cobranca, error: insertError } = await supabase
      .from('cobrancas_integradas')
      .insert({
        user_id: user.id,
        empresa_id: empresaId,
        cliente_id: clienteId,
        parcela_id: body?.parcela_id || null,
        assinatura_id: body?.assinatura_id || null,
        provedor: 'mercadopago',
        id_externo: pix.orderId,
        chave_idempotencia: idempotencyKey,
        status: 'pendente',
        valor: amount,
        vencimento: body?.vencimento || null,
        pix_copia_cola: pix.qrCode,
        qr_code_base64: pix.qrCodeBase64,
        link_pagamento: pix.ticketUrl,
        metadata: {
          descricao: body?.descricao?.trim() || 'Cobrança FichaPRO',
          external_reference: reference,
          payment_id: pix.paymentId,
          status_original: pix.status,
          status_detail: pix.statusDetail,
          payer_email: payerEmail,
          ambiente_teste: testMode,
          conta_mercado_pago: account.nickname || account.email || null
        }
      })
      .select('*')
      .single();

    if (insertError) {
      return NextResponse.json({
        ok: false,
        error: 'O Pix foi criado no Mercado Pago, mas não foi possível registrar a cobrança no FichaPRO.',
        details: insertError.message,
        order_id: pix.orderId
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      reused: false,
      test_mode: testMode,
      cobranca,
      message: testMode
        ? 'Order de teste criada. O Mercado Pago simulará a aprovação automaticamente.'
        : 'Pix criado com segurança e vinculado ao cliente.'
    });
  } catch (error) {
    if (isAuthError(error)) return NextResponse.json({ ok: false, error: 'Sessão inválida.' }, { status: 401 });
    return NextResponse.json({ ok: false, error: mercadoPagoErrorMessage(error) }, { status: 502 });
  }
}
