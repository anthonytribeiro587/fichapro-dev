-- Fotos de produtos compartilhadas por empresa/equipe
-- Rode este arquivo no SQL Editor do Supabase antes de usar fotos em produção.

alter table public.produtos
  add column if not exists foto_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'produto-fotos',
  'produto-fotos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Produto fotos leitura publica" on storage.objects;
create policy "Produto fotos leitura publica"
on storage.objects for select
using (bucket_id = 'produto-fotos');

drop policy if exists "Produto fotos upload autenticado" on storage.objects;
create policy "Produto fotos upload autenticado"
on storage.objects for insert
to authenticated
with check (bucket_id = 'produto-fotos');

drop policy if exists "Produto fotos update autenticado" on storage.objects;
create policy "Produto fotos update autenticado"
on storage.objects for update
to authenticated
using (bucket_id = 'produto-fotos')
with check (bucket_id = 'produto-fotos');

drop policy if exists "Produto fotos delete autenticado" on storage.objects;
create policy "Produto fotos delete autenticado"
on storage.objects for delete
to authenticated
using (bucket_id = 'produto-fotos');
