-- FichaPro v33 - fornecedor do produto
-- Rode no SQL Editor do Supabase antes de cadastrar/editar produtos com fornecedor.

alter table public.produtos
  add column if not exists fornecedor text;

create index if not exists produtos_user_fornecedor_idx
  on public.produtos (user_id, fornecedor)
  where fornecedor is not null;

comment on column public.produtos.fornecedor is 'Fornecedor/marca principal do produto. Usado com lista de sugestões no cadastro para evitar nomes duplicados.';
