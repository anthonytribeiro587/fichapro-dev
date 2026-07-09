-- v31 — base SaaS tenant/equipe para FichaPro
-- Objetivo: permitir que uma consultora tenha funcionárias acessando o mesmo espaço de dados.
-- IMPORTANTE: o app atual já tem RLS por user_id. Isso isola cada login, mas não é tenant compartilhado.
-- Esta migração adiciona empresa_id e políticas compatíveis com equipe, mantendo fallback por user_id.

create extension if not exists pgcrypto;

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null default 'Minha loja',
  plano text not null default 'profissional',
  status text not null default 'ativo' check (status in ('ativo', 'suspenso', 'cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.empresa_membros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  nome text,
  perfil text not null default 'atendimento' check (perfil in ('dona','gerente','atendimento','financeiro')),
  status text not null default 'convite_pendente' check (status in ('ativo','convite_pendente','inativo')),
  convidado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, email)
);

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

drop trigger if exists set_empresas_updated_at on public.empresas;
create trigger set_empresas_updated_at before update on public.empresas for each row execute function public.set_updated_at();

drop trigger if exists set_empresa_membros_updated_at on public.empresa_membros;
create trigger set_empresa_membros_updated_at before update on public.empresa_membros for each row execute function public.set_updated_at();

create or replace function public.current_empresa_id()
returns uuid
language sql
stable
security definer
as $$
  select em.empresa_id
  from public.empresa_membros em
  where em.user_id = auth.uid()
    and em.status = 'ativo'
  order by em.created_at asc
  limit 1
$$;

alter table public.clientes add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
alter table public.produtos add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
alter table public.vendas add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
alter table public.venda_itens add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
alter table public.parcelas add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
alter table public.historico_cliente add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;

create index if not exists empresas_owner_idx on public.empresas(owner_user_id);
create index if not exists empresa_membros_empresa_idx on public.empresa_membros(empresa_id);
create index if not exists empresa_membros_user_idx on public.empresa_membros(user_id);
create index if not exists clientes_empresa_idx on public.clientes(empresa_id);
create index if not exists produtos_empresa_idx on public.produtos(empresa_id);
create index if not exists vendas_empresa_idx on public.vendas(empresa_id);
create index if not exists venda_itens_empresa_idx on public.venda_itens(empresa_id);
create index if not exists parcelas_empresa_idx on public.parcelas(empresa_id);
create index if not exists historico_cliente_empresa_idx on public.historico_cliente(empresa_id);

alter table public.empresas enable row level security;
alter table public.empresa_membros enable row level security;

drop policy if exists empresas_select_member on public.empresas;
drop policy if exists empresas_insert_owner on public.empresas;
drop policy if exists empresas_update_owner on public.empresas;
drop policy if exists empresa_membros_select_company on public.empresa_membros;
drop policy if exists empresa_membros_insert_owner on public.empresa_membros;
drop policy if exists empresa_membros_update_owner on public.empresa_membros;

create policy empresas_select_member on public.empresas
for select using (
  owner_user_id = auth.uid()
  or exists (select 1 from public.empresa_membros em where em.empresa_id = id and em.user_id = auth.uid() and em.status = 'ativo')
);
create policy empresas_insert_owner on public.empresas
for insert with check (owner_user_id = auth.uid());
create policy empresas_update_owner on public.empresas
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy empresa_membros_select_company on public.empresa_membros
for select using (
  user_id = auth.uid()
  or exists (select 1 from public.empresas e where e.id = empresa_id and e.owner_user_id = auth.uid())
);
create policy empresa_membros_insert_owner on public.empresa_membros
for insert with check (exists (select 1 from public.empresas e where e.id = empresa_id and e.owner_user_id = auth.uid()));
create policy empresa_membros_update_owner on public.empresa_membros
for update using (exists (select 1 from public.empresas e where e.id = empresa_id and e.owner_user_id = auth.uid()))
with check (exists (select 1 from public.empresas e where e.id = empresa_id and e.owner_user_id = auth.uid()));

-- Ao aplicar na produção, crie uma empresa para cada consultora existente e preencha empresa_id nos dados atuais.
-- Exemplo manual para o usuário logado no SQL Editor não usa auth.uid(). Faça pelo UUID do usuário em auth.users.
