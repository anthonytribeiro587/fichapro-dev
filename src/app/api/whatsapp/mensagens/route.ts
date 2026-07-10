import { NextResponse } from 'next/server';
import {
  fetchEvolutionProfilePicture,
  sendEvolutionAudio,
  sendEvolutionMedia,
  sendEvolutionText
} from '@/lib/evolution-server';
import { createAdminServerClient, isAuthError, requireAuthenticatedUser } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const maxDuration = 45;

type SendBody = {
  empresa_id?: string;
  conversa_id?: string;
  mensagem?: string;
  arquivo_path?: string;
  arquivo_nome?: string;
  arquivo_mime?: string;
  arquivo_tipo?: 'imagem' | 'audio' | 'video' | 'documento';
};

function extractMessageId(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const response = value as Record<string, any>;
  return String(
    response.key?.id
    || response.message?.key?.id
    || response.data?.key?.id
    || response.data?.message?.key?.id
    || response.id
    || ''
  ) || null;
}

function evolutionMediaType(type: SendBody['arquivo_tipo']) {
  if (type === 'imagem') return 'image' as const;
  if (type === 'video') return 'video' as const;
  return 'document' as const;
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAuthenticatedUser(request);
    const url = new URL(request.url);
    const empresaId = url.searchParams.get('empresa_id')?.trim();
    const conversaId = url.searchParams.get('conversa_id')?.trim();

    if (!empresaId || !conversaId) {
      return NextResponse.json({ ok: false, error: 'Informe empresa e conversa.' }, { status: 400 });
    }

    const { data: conversa, error: conversaError } = await supabase
      .from('conversas_whatsapp')
      .select('id,empresa_id,telefone,metadata')
      .eq('id', conversaId)
      .eq('empresa_id', empresaId)
      .single();

    if (conversaError || !conversa) {
      return NextResponse.json({ ok: false, error: 'Conversa não encontrada.' }, { status: 404 });
    }

    const existing = typeof conversa.metadata?.profile_picture_url === 'string'
      ? conversa.metadata.profile_picture_url
      : null;

    if (existing) {
      return NextResponse.json({ ok: true, profile_picture_url: existing, cached: true });
    }

    const profile = await fetchEvolutionProfilePicture(conversa.telefone);
    if (!profile.url) {
      return NextResponse.json({ ok: true, profile_picture_url: null, unavailable: true });
    }

    await supabase
      .from('conversas_whatsapp')
      .update({
        metadata: {
          ...(conversa.metadata || {}),
          profile_picture_url: profile.url,
          profile_picture_updated_at: new Date().toISOString()
        }
      })
      .eq('id', conversaId)
      .eq('empresa_id', empresaId);

    return NextResponse.json({ ok: true, profile_picture_url: profile.url, cached: false });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ ok: false, error: 'Sessão inválida.' }, { status: 401 });
    }
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível consultar a foto do contato.'
    }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => null) as SendBody | null;
    const empresaId = body?.empresa_id?.trim();
    const conversaId = body?.conversa_id?.trim();
    const mensagem = body?.mensagem?.trim() || '';
    const arquivoPath = body?.arquivo_path?.trim() || '';
    const arquivoNome = body?.arquivo_nome?.trim() || 'arquivo';
    const arquivoMime = body?.arquivo_mime?.trim() || 'application/octet-stream';
    const arquivoTipo = body?.arquivo_tipo;

    if (!empresaId || !conversaId || (!mensagem && !arquivoPath)) {
      return NextResponse.json({ ok: false, error: 'Informe empresa, conversa e uma mensagem ou arquivo.' }, { status: 400 });
    }

    if (mensagem.length > 4000) {
      return NextResponse.json({ ok: false, error: 'A mensagem deve ter no máximo 4.000 caracteres.' }, { status: 400 });
    }

    if (arquivoPath && (!arquivoTipo || !['imagem', 'audio', 'video', 'documento'].includes(arquivoTipo))) {
      return NextResponse.json({ ok: false, error: 'Tipo de arquivo inválido.' }, { status: 400 });
    }

    if (arquivoPath && !arquivoPath.startsWith(`${empresaId}/${conversaId}/`)) {
      return NextResponse.json({ ok: false, error: 'O arquivo não pertence a esta conversa.' }, { status: 403 });
    }

    const { data: empresa } = await supabase
      .from('empresas')
      .select('id')
      .eq('id', empresaId)
      .single();

    if (!empresa) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada para este acesso.' }, { status: 403 });
    }

    const { data: conversa, error: conversaError } = await supabase
      .from('conversas_whatsapp')
      .select('id,empresa_id,cliente_id,telefone,nome_contato')
      .eq('id', conversaId)
      .eq('empresa_id', empresaId)
      .single();

    if (conversaError || !conversa) {
      return NextResponse.json({ ok: false, error: 'Conversa não encontrada.' }, { status: 404 });
    }

    let response: Record<string, unknown>;
    if (arquivoPath) {
      const admin = createAdminServerClient();
      const { data: signed, error: signedError } = await admin.storage
        .from('whatsapp-media')
        .createSignedUrl(arquivoPath, 60 * 60);

      if (signedError || !signed?.signedUrl) {
        return NextResponse.json({ ok: false, error: `Não foi possível preparar o anexo: ${signedError?.message || 'URL indisponível'}` }, { status: 500 });
      }

      response = arquivoTipo === 'audio'
        ? await sendEvolutionAudio(conversa.telefone, signed.signedUrl)
        : await sendEvolutionMedia(conversa.telefone, {
            mediaType: evolutionMediaType(arquivoTipo),
            mimeType: arquivoMime,
            mediaUrl: signed.signedUrl,
            fileName: arquivoNome,
            caption: mensagem
          });
    } else {
      response = await sendEvolutionText(conversa.telefone, mensagem);
    }

    const externalId = extractMessageId(response) || `local-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const messageType = arquivoTipo || 'texto';
    const metadata = arquivoPath
      ? {
          origem: 'caixa_de_entrada',
          user_id: user.id,
          arquivo_path: arquivoPath,
          arquivo_nome: arquivoNome,
          arquivo_mime: arquivoMime,
          provider_message_id: externalId
        }
      : {
          origem: 'caixa_de_entrada',
          user_id: user.id,
          provider_message_id: externalId
        };

    const { data: savedMessage, error: messageError } = await supabase
      .from('mensagens_whatsapp')
      .upsert({
        empresa_id: empresaId,
        conversa_id: conversaId,
        cliente_id: conversa.cliente_id || null,
        id_externo: externalId,
        direcao: 'saida',
        tipo: messageType,
        conteudo: mensagem || (arquivoTipo ? `[${arquivoTipo}]` : null),
        status: 'enviada',
        enviada_por: 'equipe',
        metadata,
        enviada_em: now
      }, { onConflict: 'empresa_id,id_externo' })
      .select('id,empresa_id,conversa_id,cliente_id,id_externo,conteudo,direcao,status,enviada_por,enviada_em,created_at,metadata,tipo')
      .single();

    if (messageError) {
      return NextResponse.json({ ok: false, error: `Mensagem enviada, mas não registrada: ${messageError.message}` }, { status: 500 });
    }

    await Promise.all([
      supabase
        .from('conversas_whatsapp')
        .update({ status: 'aguardando_cliente', ultima_mensagem_em: now, atendente_user_id: user.id })
        .eq('id', conversaId)
        .eq('empresa_id', empresaId),
      supabase
        .from('tarefas_operacionais')
        .update({ status: 'concluida', concluida_em: now })
        .eq('empresa_id', empresaId)
        .eq('tipo', 'responder')
        .in('status', ['pendente', 'em_andamento'])
        .contains('metadata', { conversa_id: conversaId })
    ]);

    return NextResponse.json({ ok: true, message: savedMessage, provider: response });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ ok: false, error: 'Sessão inválida.' }, { status: 401 });
    }
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.'
    }, { status: 502 });
  }
}
