-- v34 — FichaPro SaaS: empresas/tenant/equipe em produção
-- RODE UMA VEZ NO SUPABASE SQL EDITOR.
-- Objetivo: permitir vários usuários na mesma empresa, sem cada login criar uma base separada.
-- Mantém compatibilidade com user_id atual e migra dados existentes para empresa_id.

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

alter table public.clientes add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
alter table public.produtos add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
alter table public.vendas add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
alter table public.venda_itens add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
alter table public.parcelas add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
alter table public.historico_cliente add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;

-- Se a tabela de movimentações já existir, adiciona tenant nela também.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'estoque_movimentacoes') then
    alter table public.estoque_movimentacoes add column if not exists empresa_id uuid references public.empresas(id) on delete cascade;
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
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

-- Funções SECURITY DEFINER para as policies não sofrerem recursão de RLS.
create or replace function public.is_empresa_member(check_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.empresa_membros em
    where em.empresa_id = check_empresa_id
      and em.user_id = auth.uid()
      and em.status = 'ativo'
  );
$$;

create or replace function public.is_empresa_admin(check_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.empresa_membros em
    where em.empresa_id = check_empresa_id
      and em.user_id = auth.uid()
      and em.status = 'ativo'
      and em.perfil in ('dona', 'gerente')
  );
$$;

create or replace function public.current_empresa_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select em.empresa_id
  from public.empresa_membros em
  where em.user_id = auth.uid()
    and em.status = 'ativo'
  order by
    case when em.perfil = 'dona' then 0 else 1 end,
    em.created_at asc
  limit 1;
$$;

-- Vincula automaticamente um convite ao usuário do Auth quando o e-mail já existir.
create or replace function public.link_member_to_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  found_user_id uuid;
begin
  new.email := lower(trim(new.email));

  select u.id into found_user_id
  from auth.users u
  where lower(u.email) = new.email
  limit 1;

  if found_user_id is not null then
    new.user_id := found_user_id;
    if new.status = 'convite_pendente' then
      new.status := 'ativo';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists empresa_membros_link_auth_user on public.empresa_membros;
create trigger empresa_membros_link_auth_user
before insert or update of email on public.empresa_membros
for each row execute function public.link_member_to_auth_user();

-- Quando criar usuário no Auth depois do convite, ativa o vínculo pendente.
create or replace function public.activate_pending_memberships_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.empresa_membros
     set user_id = new.id,
         status = 'ativo',
         updated_at = now()
   where lower(email) = lower(new.email)
     and user_id is null
     and status = 'convite_pendente';

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_link_empresa on auth.users;
create trigger on_auth_user_created_link_empresa
after insert on auth.users
for each row execute function public.activate_pending_memberships_for_new_user();

-- Cria uma empresa para cada usuário atual do Auth que ainda não tem empresa.
insert into public.empresas (owner_user_id, nome, plano, status)
select
  u.id,
  case
    when lower(u.email) = 'mklafke.presentes@gmail.com' then 'MK Presentes'
    else initcap(replace(split_part(coalesce(u.email, 'minha loja'), '@', 1), '.', ' '))
  end as nome,
  'profissional',
  'ativo'
from auth.users u
where not exists (
  select 1
  from public.empresa_membros em
  where em.user_id = u.id
    and em.perfil = 'dona'
    and em.status = 'ativo'
);

-- Garante que todo dono esteja como membro da própria empresa.
insert into public.empresa_membros (empresa_id, user_id, email, nome, perfil, status)
select
  e.id,
  u.id,
  lower(u.email),
  case
    when lower(u.email) = 'mklafke.presentes@gmail.com' then 'MK Presentes'
    else initcap(replace(split_part(coalesce(u.email, 'dona'), '@', 1), '.', ' '))
  end,
  'dona',
  'ativo'
from public.empresas e
join auth.users u on u.id = e.owner_user_id
where not exists (
  select 1
  from public.empresa_membros em
  where em.empresa_id = e.id
    and em.user_id = u.id
);

-- Migra dados existentes: tudo que era por user_id passa para a empresa do usuário.
update public.clientes c
set empresa_id = em.empresa_id
from public.empresa_membros em
where c.empresa_id is null and c.user_id = em.user_id and em.status = 'ativo';

update public.produtos p
set empresa_id = em.empresa_id
from public.empresa_membros em
where p.empresa_id is null and p.user_id = em.user_id and em.status = 'ativo';

update public.vendas v
set empresa_id = em.empresa_id
from public.empresa_membros em
where v.empresa_id is null and v.user_id = em.user_id and em.status = 'ativo';

update public.venda_itens vi
set empresa_id = v.empresa_id
from public.vendas v
where vi.empresa_id is null and vi.venda_id = v.id and v.empresa_id is not null;

update public.parcelas pa
set empresa_id = v.empresa_id
from public.vendas v
where pa.empresa_id is null and pa.venda_id = v.id and v.empresa_id is not null;

update public.historico_cliente h
set empresa_id = c.empresa_id
from public.clientes c
where h.empresa_id is null and h.cliente_id = c.id and c.empresa_id is not null;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'estoque_movimentacoes') then
    update public.estoque_movimentacoes m
    set empresa_id = p.empresa_id
    from public.produtos p
    where m.empresa_id is null and m.produto_id = p.id and p.empresa_id is not null;
  end if;
end $$;

-- Novos registros gravam automaticamente na empresa ativa do usuário logado.
alter table public.clientes alter column empresa_id set default public.current_empresa_id();
alter table public.produtos alter column empresa_id set default public.current_empresa_id();
alter table public.vendas alter column empresa_id set default public.current_empresa_id();
alter table public.venda_itens alter column empresa_id set default public.current_empresa_id();
alter table public.parcelas alter column empresa_id set default public.current_empresa_id();
alter table public.historico_cliente alter column empresa_id set default public.current_empresa_id();

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'estoque_movimentacoes') then
    alter table public.estoque_movimentacoes alter column empresa_id set default public.current_empresa_id();
  end if;
end $$;

create index if not exists empresas_owner_idx on public.empresas(owner_user_id);
create index if not exists empresa_membros_empresa_idx on public.empresa_membros(empresa_id);
create index if not exists empresa_membros_user_idx on public.empresa_membros(user_id);
create index if not exists empresa_membros_email_idx on public.empresa_membros(lower(email));
create index if not exists clientes_empresa_idx on public.clientes(empresa_id);
create index if not exists produtos_empresa_idx on public.produtos(empresa_id);
create index if not exists vendas_empresa_idx on public.vendas(empresa_id);
create index if not exists venda_itens_empresa_idx on public.venda_itens(empresa_id);
create index if not exists parcelas_empresa_idx on public.parcelas(empresa_id);
create index if not exists historico_cliente_empresa_idx on public.historico_cliente(empresa_id);

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'estoque_movimentacoes') then
    create index if not exists estoque_movimentacoes_empresa_idx on public.estoque_movimentacoes(empresa_id);
  end if;
end $$;

-- RLS
alter table public.empresas enable row level security;
alter table public.empresa_membros enable row level security;
alter table public.clientes enable row level security;
alter table public.produtos enable row level security;
alter table public.vendas enable row level security;
alter table public.venda_itens enable row level security;
alter table public.parcelas enable row level security;
alter table public.historico_cliente enable row level security;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'estoque_movimentacoes') then
    alter table public.estoque_movimentacoes enable row level security;
  end if;
end $$;

-- Limpa policies antigas das tabelas principais para evitar conflito user_id x empresa_id.
do $$
declare
  pol record;
  tbl text;
begin
  foreach tbl in array array['empresas','empresa_membros','clientes','produtos','vendas','venda_itens','parcelas','historico_cliente','estoque_movimentacoes'] loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = tbl) then
      for pol in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = tbl
      loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
      end loop;
    end if;
  end loop;
end $$;

-- Empresas: todo membro ativo vê; só dona/gerente edita.
create policy empresas_select_member on public.empresas
for select using (public.is_empresa_member(id));

create policy empresas_insert_self on public.empresas
for insert with check (owner_user_id = auth.uid());

create policy empresas_update_admin on public.empresas
for update using (public.is_empresa_admin(id)) with check (public.is_empresa_admin(id));

-- Membros: membros veem a equipe; dona/gerente gerencia.
create policy empresa_membros_select_member on public.empresa_membros
for select using (public.is_empresa_member(empresa_id));

create policy empresa_membros_insert_admin on public.empresa_membros
for insert with check (public.is_empresa_admin(empresa_id));

create policy empresa_membros_update_admin on public.empresa_membros
for update using (public.is_empresa_admin(empresa_id)) with check (public.is_empresa_admin(empresa_id));

create policy empresa_membros_delete_admin on public.empresa_membros
for delete using (public.is_empresa_admin(empresa_id));

-- Função auxiliar inline para as tabelas de negócio:
-- se empresa_id existir, vale a empresa; fallback user_id mantém registros antigos visíveis.
create policy clientes_tenant_select on public.clientes
for select using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy clientes_tenant_insert on public.clientes
for insert with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy clientes_tenant_update on public.clientes
for update using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()))
with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy clientes_tenant_delete on public.clientes
for delete using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));

create policy produtos_tenant_select on public.produtos
for select using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy produtos_tenant_insert on public.produtos
for insert with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy produtos_tenant_update on public.produtos
for update using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()))
with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy produtos_tenant_delete on public.produtos
for delete using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));

create policy vendas_tenant_select on public.vendas
for select using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy vendas_tenant_insert on public.vendas
for insert with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy vendas_tenant_update on public.vendas
for update using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()))
with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy vendas_tenant_delete on public.vendas
for delete using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));

create policy venda_itens_tenant_select on public.venda_itens
for select using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy venda_itens_tenant_insert on public.venda_itens
for insert with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy venda_itens_tenant_update on public.venda_itens
for update using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()))
with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy venda_itens_tenant_delete on public.venda_itens
for delete using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));

create policy parcelas_tenant_select on public.parcelas
for select using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy parcelas_tenant_insert on public.parcelas
for insert with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy parcelas_tenant_update on public.parcelas
for update using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()))
with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy parcelas_tenant_delete on public.parcelas
for delete using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));

create policy historico_cliente_tenant_select on public.historico_cliente
for select using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy historico_cliente_tenant_insert on public.historico_cliente
for insert with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy historico_cliente_tenant_update on public.historico_cliente
for update using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()))
with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));
create policy historico_cliente_tenant_delete on public.historico_cliente
for delete using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()));

-- Policies condicionais para estoque_movimentacoes.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'estoque_movimentacoes') then
    execute 'create policy estoque_movimentacoes_tenant_select on public.estoque_movimentacoes for select using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()))';
    execute 'create policy estoque_movimentacoes_tenant_insert on public.estoque_movimentacoes for insert with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()))';
    execute 'create policy estoque_movimentacoes_tenant_update on public.estoque_movimentacoes for update using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid())) with check (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()))';
    execute 'create policy estoque_movimentacoes_tenant_delete on public.estoque_movimentacoes for delete using (public.is_empresa_member(empresa_id) or (empresa_id is null and user_id = auth.uid()))';
  end if;
end $$;

-- Diagnóstico final: deve listar empresas, membros e quantos registros ficaram com empresa_id.
select
  e.nome as empresa,
  em.email,
  em.perfil,
  em.status,
  em.user_id is not null as auth_vinculado
from public.empresas e
join public.empresa_membros em on em.empresa_id = e.id
order by e.created_at desc, em.created_at asc;
