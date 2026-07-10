-- FichaPRO v58 — mídias privadas do WhatsApp e limpeza reforçada de grupos
-- Execute somente no Supabase DEV, após a v57.

insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-media', 'whatsapp-media', false, 20971520)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create or replace function public.fichapro_storage_empresa_id(object_name text)
returns uuid
language plpgsql
stable
as $$
declare
  value text;
begin
  value := split_part(object_name, '/', 1);
  return value::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists whatsapp_media_select_empresa on storage.objects;
drop policy if exists whatsapp_media_insert_empresa on storage.objects;
drop policy if exists whatsapp_media_update_empresa on storage.objects;
drop policy if exists whatsapp_media_delete_empresa on storage.objects;

create policy whatsapp_media_select_empresa
on storage.objects for select
to authenticated
using (
  bucket_id = 'whatsapp-media'
  and public.fichapro_storage_empresa_id(name) is not null
  and public.fichapro_tem_acesso_empresa(public.fichapro_storage_empresa_id(name))
);

create policy whatsapp_media_insert_empresa
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'whatsapp-media'
  and public.fichapro_storage_empresa_id(name) is not null
  and public.fichapro_tem_acesso_empresa(public.fichapro_storage_empresa_id(name))
);

create policy whatsapp_media_update_empresa
on storage.objects for update
to authenticated
using (
  bucket_id = 'whatsapp-media'
  and public.fichapro_tem_acesso_empresa(public.fichapro_storage_empresa_id(name))
)
with check (
  bucket_id = 'whatsapp-media'
  and public.fichapro_tem_acesso_empresa(public.fichapro_storage_empresa_id(name))
);

create policy whatsapp_media_delete_empresa
on storage.objects for delete
to authenticated
using (
  bucket_id = 'whatsapp-media'
  and public.fichapro_tem_acesso_empresa(public.fichapro_storage_empresa_id(name))
);

-- Cancela tarefas antigas criadas por grupos que entraram antes do bloqueio.
update public.tarefas_operacionais
set status = 'cancelada',
    concluida_em = coalesce(concluida_em, now()),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancelada_por', 'limpeza_grupo_v58')
where tipo = 'responder'
  and status in ('pendente', 'em_andamento')
  and metadata->>'conversa_id' in (
    select id::text
    from public.conversas_whatsapp
    where lower(coalesce(metadata->>'remote_jid', '')) like '%@g.us'
       or regexp_replace(coalesce(telefone, ''), '\D', '', 'g') like '120363%'
  );

update public.conversas_whatsapp
set status = 'arquivada',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('ignorada_por', 'grupo_v58')
where lower(coalesce(metadata->>'remote_jid', '')) like '%@g.us'
   or regexp_replace(coalesce(telefone, ''), '\D', '', 'g') like '120363%';

-- Corrige o nome do próprio atendente gravado por eventos SEND_MESSAGE antigos.
update public.conversas_whatsapp
set nome_contato = null
where cliente_id is null
  and lower(trim(coalesce(nome_contato, ''))) in ('você', 'voce', 'you');
