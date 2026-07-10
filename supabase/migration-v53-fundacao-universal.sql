-- FichaPRO DEV v53 — Fundação universal
-- Pré-requisito: tabelas empresas e empresa_membros já existentes.
-- Execute apenas no Supabase DEV.

create extension if not exists pgcrypto;

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

alter table public.empresas
  add column if not exists perfil_negocio text not null default 'comercio',
  add column if not exists modulos jsonb not null default '{"vendas":true,"estoque":true,"servicos":false,"recorrencia":false,"tarefas":true,"pagamentos":false,"whatsapp":false,"ia":false}'::jsonb,
  add column if not exists configuracoes jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.produtos
  add column if not exists tipo_item text not null default 'produto',
  add column if not exists periodicidade text,
  add column if not exists intervalo_dias integer,
  add column if not exists acao_pos_pagamento text,
  add column if not exists prazo_recompra_dias integer,
  add column if not exists configuracoes jsonb not null default '{}'::jsonb;

create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  item_id uuid references public.produtos(id) on delete set null,
  nome text not null,
  status text not null default 'ativa' check (status in ('ativa','pausada','vencida','cancelada')),
  periodicidade text not null default 'mensal',
  intervalo_dias integer check (intervalo_dias is null or intervalo_dias > 0),
  valor numeric(12,2) not null default 0 check (valor >= 0),
  vencimento_atual date,
  proximo_vencimento date,
  identificador_externo text,
  observacoes text,
  configuracoes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assinaturas_empresa_status_idx on public.assinaturas(empresa_id,status);
create index if not exists assinaturas_cliente_idx on public.assinaturas(empresa_id,cliente_id);
create index if not exists assinaturas_vencimento_idx on public.assinaturas(empresa_id,proximo_vencimento);
drop trigger if exists set_assinaturas_updated_at on public.assinaturas;
create trigger set_assinaturas_updated_at before update on public.assinaturas for each row execute function public.set_updated_at();

create table if not exists public.tarefas_operacionais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  venda_id uuid references public.vendas(id) on delete set null,
  parcela_id uuid references public.parcelas(id) on delete set null,
  assinatura_id uuid references public.assinaturas(id) on delete set null,
  tipo text not null default 'outra' check (tipo in ('separar_pedido','entregar','renovar','agendar','liberar_acesso','pos_venda','cobrar','outra')),
  titulo text not null,
  descricao text,
  status text not null default 'pendente' check (status in ('pendente','em_andamento','concluida','cancelada')),
  prioridade text not null default 'normal' check (prioridade in ('baixa','normal','alta','urgente')),
  origem text not null default 'manual',
  data_limite date,
  responsavel_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tarefas_empresa_status_idx on public.tarefas_operacionais(empresa_id,status,data_limite);
create index if not exists tarefas_cliente_idx on public.tarefas_operacionais(empresa_id,cliente_id);
create index if not exists tarefas_assinatura_idx on public.tarefas_operacionais(empresa_id,assinatura_id);
drop trigger if exists set_tarefas_updated_at on public.tarefas_operacionais;
create trigger set_tarefas_updated_at before update on public.tarefas_operacionais for each row execute function public.set_updated_at();

create table if not exists public.cobrancas_integradas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  parcela_id uuid references public.parcelas(id) on delete set null,
  assinatura_id uuid references public.assinaturas(id) on delete set null,
  provedor text not null,
  id_externo text,
  chave_idempotencia text not null,
  status text not null default 'pendente',
  valor numeric(12,2) not null check (valor >= 0),
  vencimento date,
  pix_copia_cola text,
  qr_code_base64 text,
  link_pagamento text,
  pago_em timestamptz,
  expira_em timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id,chave_idempotencia),
  unique (empresa_id,provedor,id_externo)
);

create index if not exists cobrancas_empresa_status_idx on public.cobrancas_integradas(empresa_id,status,vencimento);
create index if not exists cobrancas_cliente_idx on public.cobrancas_integradas(empresa_id,cliente_id);
drop trigger if exists set_cobrancas_updated_at on public.cobrancas_integradas;
create trigger set_cobrancas_updated_at before update on public.cobrancas_integradas for each row execute function public.set_updated_at();

create table if not exists public.integracoes_empresa (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  provedor text not null,
  status text not null default 'inativa',
  configuracao_publica jsonb not null default '{}'::jsonb,
  segredo_referencia text,
  ultimo_teste_em timestamptz,
  ultimo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id,provedor)
);

drop trigger if exists set_integracoes_updated_at on public.integracoes_empresa;
create trigger set_integracoes_updated_at before update on public.integracoes_empresa for each row execute function public.set_updated_at();

create or replace function public.fichapro_tem_acesso_empresa(target_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.empresa_membros m
    where m.empresa_id = target_empresa_id
      and m.user_id = auth.uid()
      and m.status = 'ativo'
  );
$$;

revoke all on function public.fichapro_tem_acesso_empresa(uuid) from public;
grant execute on function public.fichapro_tem_acesso_empresa(uuid) to authenticated;

alter table public.assinaturas enable row level security;
alter table public.tarefas_operacionais enable row level security;
alter table public.cobrancas_integradas enable row level security;
alter table public.integracoes_empresa enable row level security;

-- Assinaturas
drop policy if exists assinaturas_select_empresa on public.assinaturas;
drop policy if exists assinaturas_insert_empresa on public.assinaturas;
drop policy if exists assinaturas_update_empresa on public.assinaturas;
drop policy if exists assinaturas_delete_empresa on public.assinaturas;
create policy assinaturas_select_empresa on public.assinaturas for select using (public.fichapro_tem_acesso_empresa(empresa_id));
create policy assinaturas_insert_empresa on public.assinaturas for insert with check (user_id = auth.uid() and public.fichapro_tem_acesso_empresa(empresa_id));
create policy assinaturas_update_empresa on public.assinaturas for update using (public.fichapro_tem_acesso_empresa(empresa_id)) with check (public.fichapro_tem_acesso_empresa(empresa_id));
create policy assinaturas_delete_empresa on public.assinaturas for delete using (public.fichapro_tem_acesso_empresa(empresa_id));

-- Tarefas
drop policy if exists tarefas_select_empresa on public.tarefas_operacionais;
drop policy if exists tarefas_insert_empresa on public.tarefas_operacionais;
drop policy if exists tarefas_update_empresa on public.tarefas_operacionais;
drop policy if exists tarefas_delete_empresa on public.tarefas_operacionais;
create policy tarefas_select_empresa on public.tarefas_operacionais for select using (public.fichapro_tem_acesso_empresa(empresa_id));
create policy tarefas_insert_empresa on public.tarefas_operacionais for insert with check (user_id = auth.uid() and public.fichapro_tem_acesso_empresa(empresa_id));
create policy tarefas_update_empresa on public.tarefas_operacionais for update using (public.fichapro_tem_acesso_empresa(empresa_id)) with check (public.fichapro_tem_acesso_empresa(empresa_id));
create policy tarefas_delete_empresa on public.tarefas_operacionais for delete using (public.fichapro_tem_acesso_empresa(empresa_id));

-- Cobranças
drop policy if exists cobrancas_select_empresa on public.cobrancas_integradas;
drop policy if exists cobrancas_insert_empresa on public.cobrancas_integradas;
drop policy if exists cobrancas_update_empresa on public.cobrancas_integradas;
drop policy if exists cobrancas_delete_empresa on public.cobrancas_integradas;
create policy cobrancas_select_empresa on public.cobrancas_integradas for select using (public.fichapro_tem_acesso_empresa(empresa_id));
create policy cobrancas_insert_empresa on public.cobrancas_integradas for insert with check (user_id = auth.uid() and public.fichapro_tem_acesso_empresa(empresa_id));
create policy cobrancas_update_empresa on public.cobrancas_integradas for update using (public.fichapro_tem_acesso_empresa(empresa_id)) with check (public.fichapro_tem_acesso_empresa(empresa_id));
create policy cobrancas_delete_empresa on public.cobrancas_integradas for delete using (public.fichapro_tem_acesso_empresa(empresa_id));

-- Integrações: sem segredos; apenas estado e referências.
drop policy if exists integracoes_select_empresa on public.integracoes_empresa;
drop policy if exists integracoes_insert_empresa on public.integracoes_empresa;
drop policy if exists integracoes_update_empresa on public.integracoes_empresa;
drop policy if exists integracoes_delete_empresa on public.integracoes_empresa;
create policy integracoes_select_empresa on public.integracoes_empresa for select using (public.fichapro_tem_acesso_empresa(empresa_id));
create policy integracoes_insert_empresa on public.integracoes_empresa for insert with check (user_id = auth.uid() and public.fichapro_tem_acesso_empresa(empresa_id));
create policy integracoes_update_empresa on public.integracoes_empresa for update using (public.fichapro_tem_acesso_empresa(empresa_id)) with check (public.fichapro_tem_acesso_empresa(empresa_id));
create policy integracoes_delete_empresa on public.integracoes_empresa for delete using (public.fichapro_tem_acesso_empresa(empresa_id));

-- Validação rápida:
-- select id,nome,perfil_negocio,modulos from public.empresas;
-- select table_name from information_schema.tables where table_schema='public' and table_name in ('assinaturas','tarefas_operacionais','cobrancas_integradas','integracoes_empresa');
