-- FichaPRO v57 — limpeza de grupos e canais antigos do WhatsApp
-- Execute somente no Supabase DEV.
--
-- O webhook novo já ignora grupos, status, broadcasts e newsletters antes de
-- criar conversa ou tarefa. Esta migration limpa registros antigos criados
-- antes desse bloqueio. Telefones individuais seguem o padrão E.164 e têm no
-- máximo 15 dígitos; IDs de grupo do WhatsApp normalmente ultrapassam isso.

begin;

create temporary table if not exists fichapro_conversas_nao_individuais
on commit drop
as
select id
from public.conversas_whatsapp
where
  length(regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) > 15
  or lower(coalesce(metadata->>'remote_jid', '')) like '%@g.us'
  or lower(coalesce(metadata->>'remote_jid', '')) = 'status@broadcast'
  or lower(coalesce(metadata->>'remote_jid', '')) like '%@broadcast'
  or lower(coalesce(metadata->>'remote_jid', '')) like '%@newsletter';

update public.tarefas_operacionais
set
  status = 'cancelada',
  concluida_em = null,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'cancelada_automaticamente', true,
    'motivo_cancelamento', 'conversa_nao_individual'
  )
where tipo = 'responder'
  and metadata->>'conversa_id' in (
    select id::text from fichapro_conversas_nao_individuais
  )
  and status in ('pendente', 'em_andamento');

update public.conversas_whatsapp
set
  status = 'arquivada',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'ignorada_automaticamente', true,
    'motivo_ignorado', 'grupo_status_broadcast_ou_canal'
  )
where id in (select id from fichapro_conversas_nao_individuais);

commit;

-- Validação opcional:
-- select status, nome_contato, telefone, metadata
-- from public.conversas_whatsapp
-- where metadata->>'ignorada_automaticamente' = 'true';
