-- FichaPro - Movimentações reais de estoque
-- Rode este arquivo no SQL Editor do Supabase antes de usar o histórico de movimentações.

create table if not exists public.estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  venda_id uuid references public.vendas(id) on delete set null,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste', 'venda', 'estorno')),
  quantidade integer not null default 0 check (quantidade >= 0),
  estoque_anterior integer,
  estoque_novo integer,
  descricao text,
  data_movimento timestamp with time zone not null default now()
);

create index if not exists estoque_movimentacoes_user_idx on public.estoque_movimentacoes(user_id);
create index if not exists estoque_movimentacoes_produto_idx on public.estoque_movimentacoes(produto_id);
create index if not exists estoque_movimentacoes_venda_idx on public.estoque_movimentacoes(venda_id);
create index if not exists estoque_movimentacoes_data_idx on public.estoque_movimentacoes(data_movimento desc);

alter table public.estoque_movimentacoes enable row level security;
alter table public.estoque_movimentacoes force row level security;

drop policy if exists "Usuário vê suas movimentações de estoque" on public.estoque_movimentacoes;
drop policy if exists "Usuário cria suas movimentações de estoque" on public.estoque_movimentacoes;
drop policy if exists "Usuário altera suas movimentações de estoque" on public.estoque_movimentacoes;
drop policy if exists "Usuário exclui suas movimentações de estoque" on public.estoque_movimentacoes;

create policy "Usuário vê suas movimentações de estoque"
on public.estoque_movimentacoes
for select
using (user_id = auth.uid());

create policy "Usuário cria suas movimentações de estoque"
on public.estoque_movimentacoes
for insert
with check (user_id = auth.uid());

create policy "Usuário altera suas movimentações de estoque"
on public.estoque_movimentacoes
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Usuário exclui suas movimentações de estoque"
on public.estoque_movimentacoes
for delete
using (user_id = auth.uid());
