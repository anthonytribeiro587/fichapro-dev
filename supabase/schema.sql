-- FichaPro CRM - Supabase SQL
-- Execute este arquivo no SQL Editor do Supabase antes de rodar o app.

create extension if not exists pgcrypto;

-- Atualização automática de updated_at
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

-- CLIENTES
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  endereco text,
  bairro text,
  cidade text,
  aniversario date,
  letra_fichario varchar(1),
  categoria text not null default 'Regular' check (categoria in ('Regular', 'VIP', 'Potencial', 'Inativa')),
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clientes_user_idx on public.clientes(user_id);
create index if not exists clientes_nome_idx on public.clientes using gin (to_tsvector('portuguese', coalesce(nome, '')));
create index if not exists clientes_letra_idx on public.clientes(user_id, letra_fichario);
create index if not exists clientes_status_idx on public.clientes(user_id, status);

drop trigger if exists set_clientes_updated_at on public.clientes;
create trigger set_clientes_updated_at
before update on public.clientes
for each row execute function public.set_updated_at();

-- PRODUTOS
create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  categoria text,
  preco numeric(12, 2) not null default 0 check (preco >= 0),
  estoque integer not null default 0 check (estoque >= 0),
  controla_estoque boolean not null default true,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists produtos_user_idx on public.produtos(user_id);
create index if not exists produtos_status_idx on public.produtos(user_id, status);

drop trigger if exists set_produtos_updated_at on public.produtos;
create trigger set_produtos_updated_at
before update on public.produtos
for each row execute function public.set_updated_at();

-- VENDAS
create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  produto_id uuid references public.produtos(id) on delete set null,
  produto_nome text not null,
  quantidade integer not null default 1 check (quantidade > 0),
  valor_total numeric(12, 2) not null default 0 check (valor_total >= 0),
  forma_pagamento text not null default 'Parcelado',
  numero_parcelas integer not null default 1 check (numero_parcelas > 0),
  data_venda date not null default current_date,
  primeiro_vencimento date not null default current_date,
  observacoes text,
  status text not null default 'aberta' check (status in ('aberta', 'quitada', 'cancelada', 'estornada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendas_user_idx on public.vendas(user_id);
create index if not exists vendas_cliente_idx on public.vendas(user_id, cliente_id);
create index if not exists vendas_data_idx on public.vendas(user_id, data_venda desc);

drop trigger if exists set_vendas_updated_at on public.vendas;
create trigger set_vendas_updated_at
before update on public.vendas
for each row execute function public.set_updated_at();


-- ITENS DA VENDA / SACOLA DO PEDIDO
-- Esta tabela permite registrar vários produtos dentro de uma mesma venda.
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

-- PARCELAS
create table if not exists public.parcelas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  venda_id uuid not null references public.vendas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  numero integer not null check (numero > 0),
  vencimento date not null,
  valor numeric(12, 2) not null default 0 check (valor >= 0),
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'cancelado')),
  data_pagamento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venda_id, numero)
);

create index if not exists parcelas_user_idx on public.parcelas(user_id);
create index if not exists parcelas_cliente_idx on public.parcelas(user_id, cliente_id);
create index if not exists parcelas_vencimento_idx on public.parcelas(user_id, vencimento);
create index if not exists parcelas_status_idx on public.parcelas(user_id, status);

drop trigger if exists set_parcelas_updated_at on public.parcelas;
create trigger set_parcelas_updated_at
before update on public.parcelas
for each row execute function public.set_updated_at();

-- HISTÓRICO DO CLIENTE
create table if not exists public.historico_cliente (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null default 'observacao',
  titulo text not null,
  descricao text,
  data_evento date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists historico_user_idx on public.historico_cliente(user_id);
create index if not exists historico_cliente_idx on public.historico_cliente(user_id, cliente_id, data_evento desc);

-- RLS
alter table public.clientes enable row level security;
alter table public.produtos enable row level security;
alter table public.vendas enable row level security;
alter table public.venda_itens enable row level security;
alter table public.parcelas enable row level security;
alter table public.historico_cliente enable row level security;

-- Remove políticas antigas para permitir reexecutar este arquivo sem erro
drop policy if exists "clientes_select_own" on public.clientes;
drop policy if exists "clientes_insert_own" on public.clientes;
drop policy if exists "clientes_update_own" on public.clientes;
drop policy if exists "clientes_delete_own" on public.clientes;

drop policy if exists "produtos_select_own" on public.produtos;
drop policy if exists "produtos_insert_own" on public.produtos;
drop policy if exists "produtos_update_own" on public.produtos;
drop policy if exists "produtos_delete_own" on public.produtos;

drop policy if exists "vendas_select_own" on public.vendas;
drop policy if exists "vendas_insert_own" on public.vendas;
drop policy if exists "vendas_update_own" on public.vendas;
drop policy if exists "vendas_delete_own" on public.vendas;

drop policy if exists "venda_itens_select_own" on public.venda_itens;
drop policy if exists "venda_itens_insert_own" on public.venda_itens;
drop policy if exists "venda_itens_update_own" on public.venda_itens;
drop policy if exists "venda_itens_delete_own" on public.venda_itens;

drop policy if exists "parcelas_select_own" on public.parcelas;
drop policy if exists "parcelas_insert_own" on public.parcelas;
drop policy if exists "parcelas_update_own" on public.parcelas;
drop policy if exists "parcelas_delete_own" on public.parcelas;

drop policy if exists "historico_select_own" on public.historico_cliente;
drop policy if exists "historico_insert_own" on public.historico_cliente;
drop policy if exists "historico_update_own" on public.historico_cliente;
drop policy if exists "historico_delete_own" on public.historico_cliente;

-- Políticas: cada usuário acessa apenas seus dados
create policy "clientes_select_own" on public.clientes
for select using (user_id = auth.uid());
create policy "clientes_insert_own" on public.clientes
for insert with check (user_id = auth.uid());
create policy "clientes_update_own" on public.clientes
for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clientes_delete_own" on public.clientes
for delete using (user_id = auth.uid());

create policy "produtos_select_own" on public.produtos
for select using (user_id = auth.uid());
create policy "produtos_insert_own" on public.produtos
for insert with check (user_id = auth.uid());
create policy "produtos_update_own" on public.produtos
for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "produtos_delete_own" on public.produtos
for delete using (user_id = auth.uid());

create policy "vendas_select_own" on public.vendas
for select using (user_id = auth.uid());
create policy "vendas_insert_own" on public.vendas
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
  and (produto_id is null or exists (select 1 from public.produtos p where p.id = produto_id and p.user_id = auth.uid()))
);
create policy "vendas_update_own" on public.vendas
for update using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
  and (produto_id is null or exists (select 1 from public.produtos p where p.id = produto_id and p.user_id = auth.uid()))
);
create policy "vendas_delete_own" on public.vendas
for delete using (user_id = auth.uid());


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

create policy "parcelas_select_own" on public.parcelas
for select using (user_id = auth.uid());
create policy "parcelas_insert_own" on public.parcelas
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.vendas v where v.id = venda_id and v.user_id = auth.uid())
  and exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
);
create policy "parcelas_update_own" on public.parcelas
for update using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and exists (select 1 from public.vendas v where v.id = venda_id and v.user_id = auth.uid())
  and exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
);
create policy "parcelas_delete_own" on public.parcelas
for delete using (user_id = auth.uid());

create policy "historico_select_own" on public.historico_cliente
for select using (user_id = auth.uid());
create policy "historico_insert_own" on public.historico_cliente
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
);
create policy "historico_update_own" on public.historico_cliente
for update using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid())
);
create policy "historico_delete_own" on public.historico_cliente
for delete using (user_id = auth.uid());

-- Opcional: consulta rápida para validar estrutura
-- select table_name from information_schema.tables where table_schema = 'public' and table_name in ('clientes', 'produtos', 'vendas', 'venda_itens', 'parcelas', 'historico_cliente');
