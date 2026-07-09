-- FichaPro CRM v5 - Migração para venda com vários itens
-- Execute este arquivo no SQL Editor do Supabase se você já rodou o schema.sql das versões anteriores.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  venda_id uuid not null references public.vendas(id) on delete cascade,
  produto_id uuid references public.produtos(id) on delete set null,
  produto_nome text not null,
  quantidade integer not null default 1 check (quantidade > 0),
  valor_unitario numeric(12, 2) not null default 0 check (valor_unitario >= 0),
  valor_total numeric(12, 2) not null default 0 check (valor_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venda_itens_user_idx on public.venda_itens(user_id);
create index if not exists venda_itens_venda_idx on public.venda_itens(user_id, venda_id);
create index if not exists venda_itens_produto_idx on public.venda_itens(user_id, produto_id);

drop trigger if exists set_venda_itens_updated_at on public.venda_itens;
create trigger set_venda_itens_updated_at
before update on public.venda_itens
for each row execute function public.set_updated_at();

alter table public.venda_itens enable row level security;

drop policy if exists "venda_itens_select_own" on public.venda_itens;
drop policy if exists "venda_itens_insert_own" on public.venda_itens;
drop policy if exists "venda_itens_update_own" on public.venda_itens;
drop policy if exists "venda_itens_delete_own" on public.venda_itens;

create policy "venda_itens_select_own" on public.venda_itens
for select using (user_id = auth.uid());

create policy "venda_itens_insert_own" on public.venda_itens
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.vendas v where v.id = venda_id and v.user_id = auth.uid())
  and (produto_id is null or exists (select 1 from public.produtos p where p.id = produto_id and p.user_id = auth.uid()))
);

create policy "venda_itens_update_own" on public.venda_itens
for update using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and exists (select 1 from public.vendas v where v.id = venda_id and v.user_id = auth.uid())
  and (produto_id is null or exists (select 1 from public.produtos p where p.id = produto_id and p.user_id = auth.uid()))
);

create policy "venda_itens_delete_own" on public.venda_itens
for delete using (user_id = auth.uid());

-- Opcional: transformar vendas antigas em item único, caso existam vendas anteriores à v5.
insert into public.venda_itens (user_id, venda_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total)
select
  v.user_id,
  v.id,
  v.produto_id,
  v.produto_nome,
  greatest(v.quantidade, 1),
  case when greatest(v.quantidade, 1) > 0 then round((v.valor_total / greatest(v.quantidade, 1))::numeric, 2) else v.valor_total end,
  v.valor_total
from public.vendas v
where not exists (
  select 1 from public.venda_itens vi where vi.venda_id = v.id
);
