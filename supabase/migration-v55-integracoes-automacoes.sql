-- FichaPRO v55 — Integrações, automações e atendimento
-- Execute somente no Supabase DEV, após v53 e v54.

create extension if not exists pgcrypto;

alter table public.clientes
  add column if not exists documento text;

alter table public.tarefas_operacionais
  add column if not exists cobranca_id uuid references public.cobrancas_integradas(id) on delete set null;

create unique index if not exists tarefas_operacionais_cobranca_tipo_unique
  on public.tarefas_operacionais(cobranca_id, tipo)
  where cobranca_id is not null;

create table if not exists public.automacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  gatilho text not null,
  canal text not null default 'interno',
  status text not null default 'rascunho' check (status in ('rascunho','ativa','pausada','arquivada')),
  condicoes jsonb not null default '{}'::jsonb,
  acoes jsonb not null default '[]'::jsonb,
  horario_inicio time,
  horario_fim time,
  dias_semana integer[] not null default '{1,2,3,4,5}',
  ultima_execucao_em timestamptz,
  proxima_execucao_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automacoes_empresa_status_idx
  on public.automacoes(empresa_id, status, gatilho);

drop trigger if exists set_automacoes_updated_at on public.automacoes;
create trigger set_automacoes_updated_at
before update on public.automacoes
for each row execute function public.set_updated_at();

create table if not exists public.automacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  automacao_id uuid references public.automacoes(id) on delete set null,
  evento_origem text not null,
  referencia_externa text,
  status text not null default 'pendente' check (status in ('pendente','processando','concluida','ignorada','erro')),
  entrada jsonb not null default '{}'::jsonb,
  saida jsonb not null default '{}'::jsonb,
  erro text,
  tentativas integer not null default 0,
  iniciou_em timestamptz,
  concluiu_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists automacao_execucoes_empresa_idx
  on public.automacao_execucoes(empresa_id, created_at desc);
create unique index if not exists automacao_execucoes_referencia_unique
  on public.automacao_execucoes(empresa_id, evento_origem, referencia_externa)
  where referencia_externa is not null;

create table if not exists public.eventos_webhook (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  provedor text not null,
  evento_externo_id text not null,
  tipo text,
  status text not null default 'recebido' check (status in ('recebido','processado','ignorado','erro')),
  payload jsonb not null default '{}'::jsonb,
  erro text,
  processado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (provedor, evento_externo_id)
);

create index if not exists eventos_webhook_empresa_idx
  on public.eventos_webhook(empresa_id, created_at desc);

create table if not exists public.conversas_whatsapp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  telefone text not null,
  nome_contato text,
  status text not null default 'aberta' check (status in ('aberta','aguardando_cliente','aguardando_equipe','resolvida','arquivada')),
  intencao text,
  resumo_ia text,
  ultima_mensagem_em timestamptz,
  atendente_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, telefone)
);

create index if not exists conversas_whatsapp_empresa_status_idx
  on public.conversas_whatsapp(empresa_id, status, ultima_mensagem_em desc);

drop trigger if exists set_conversas_whatsapp_updated_at on public.conversas_whatsapp;
create trigger set_conversas_whatsapp_updated_at
before update on public.conversas_whatsapp
for each row execute function public.set_updated_at();

create table if not exists public.mensagens_whatsapp (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conversa_id uuid not null references public.conversas_whatsapp(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  id_externo text,
  direcao text not null check (direcao in ('entrada','saida')),
  tipo text not null default 'texto',
  conteudo text,
  status text not null default 'recebida',
  enviada_por text not null default 'cliente',
  metadata jsonb not null default '{}'::jsonb,
  enviada_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (empresa_id, id_externo)
);

create index if not exists mensagens_whatsapp_conversa_idx
  on public.mensagens_whatsapp(conversa_id, enviada_em desc);

alter table public.automacoes enable row level security;
alter table public.automacao_execucoes enable row level security;
alter table public.eventos_webhook enable row level security;
alter table public.conversas_whatsapp enable row level security;
alter table public.mensagens_whatsapp enable row level security;

-- Políticas multiempresa reexecutáveis.
do $$
declare
  tabela text;
begin
  foreach tabela in array array['automacoes','automacao_execucoes','eventos_webhook','conversas_whatsapp','mensagens_whatsapp']
  loop
    execute format('drop policy if exists %I on public.%I', tabela || '_select_empresa', tabela);
    execute format('drop policy if exists %I on public.%I', tabela || '_insert_empresa', tabela);
    execute format('drop policy if exists %I on public.%I', tabela || '_update_empresa', tabela);
    execute format('drop policy if exists %I on public.%I', tabela || '_delete_empresa', tabela);
    execute format('create policy %I on public.%I for select using (empresa_id is not null and public.fichapro_tem_acesso_empresa(empresa_id))', tabela || '_select_empresa', tabela);
    execute format('create policy %I on public.%I for insert with check (empresa_id is not null and public.fichapro_tem_acesso_empresa(empresa_id))', tabela || '_insert_empresa', tabela);
    execute format('create policy %I on public.%I for update using (empresa_id is not null and public.fichapro_tem_acesso_empresa(empresa_id)) with check (empresa_id is not null and public.fichapro_tem_acesso_empresa(empresa_id))', tabela || '_update_empresa', tabela);
    execute format('create policy %I on public.%I for delete using (empresa_id is not null and public.fichapro_tem_acesso_empresa(empresa_id))', tabela || '_delete_empresa', tabela);
  end loop;
end $$;

-- event webhook pode ser gravado por backend service_role; usuários autenticados apenas consultam sua empresa.
-- Validação rápida:
-- select table_name from information_schema.tables where table_schema='public'
-- and table_name in ('automacoes','automacao_execucoes','eventos_webhook','conversas_whatsapp','mensagens_whatsapp');
