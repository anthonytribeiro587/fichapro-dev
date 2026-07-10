-- FichaPRO DEV v56 — Permite tarefas criadas por mensagens do WhatsApp
-- Execute somente no Supabase DEV, após v53, v54 e v55.

begin;

alter table public.tarefas_operacionais
  drop constraint if exists tarefas_operacionais_tipo_check;

alter table public.tarefas_operacionais
  add constraint tarefas_operacionais_tipo_check
  check (tipo in (
    'separar_pedido',
    'entregar',
    'renovar',
    'agendar',
    'liberar_acesso',
    'pos_venda',
    'cobrar',
    'responder',
    'outra'
  ));

commit;

-- Validação opcional:
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.tarefas_operacionais'::regclass
--   and conname = 'tarefas_operacionais_tipo_check';
