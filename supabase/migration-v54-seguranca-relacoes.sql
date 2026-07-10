-- FichaPRO DEV v54 — Segurança das relações multiempresa
-- Execute depois da migration v53, somente no Supabase DEV.

create or replace function public.validar_assinatura_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  empresa_cliente uuid;
  empresa_item uuid;
begin
  select empresa_id into empresa_cliente from public.clientes where id = new.cliente_id;
  if empresa_cliente is distinct from new.empresa_id then
    raise exception 'Cliente não pertence à empresa da assinatura.';
  end if;

  if new.item_id is not null then
    select empresa_id into empresa_item from public.produtos where id = new.item_id;
    if empresa_item is distinct from new.empresa_id then
      raise exception 'Item não pertence à empresa da assinatura.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validar_assinatura_empresa_trigger on public.assinaturas;
create trigger validar_assinatura_empresa_trigger
before insert or update on public.assinaturas
for each row execute function public.validar_assinatura_empresa();

create or replace function public.validar_tarefa_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  empresa_relacionada uuid;
begin
  if new.cliente_id is not null then
    select empresa_id into empresa_relacionada from public.clientes where id = new.cliente_id;
    if empresa_relacionada is distinct from new.empresa_id then raise exception 'Cliente não pertence à empresa da tarefa.'; end if;
  end if;

  if new.venda_id is not null then
    select empresa_id into empresa_relacionada from public.vendas where id = new.venda_id;
    if empresa_relacionada is distinct from new.empresa_id then raise exception 'Venda não pertence à empresa da tarefa.'; end if;
  end if;

  if new.parcela_id is not null then
    select empresa_id into empresa_relacionada from public.parcelas where id = new.parcela_id;
    if empresa_relacionada is distinct from new.empresa_id then raise exception 'Parcela não pertence à empresa da tarefa.'; end if;
  end if;

  if new.assinatura_id is not null then
    select empresa_id into empresa_relacionada from public.assinaturas where id = new.assinatura_id;
    if empresa_relacionada is distinct from new.empresa_id then raise exception 'Assinatura não pertence à empresa da tarefa.'; end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validar_tarefa_empresa_trigger on public.tarefas_operacionais;
create trigger validar_tarefa_empresa_trigger
before insert or update on public.tarefas_operacionais
for each row execute function public.validar_tarefa_empresa();

create or replace function public.validar_cobranca_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  empresa_relacionada uuid;
begin
  select empresa_id into empresa_relacionada from public.clientes where id = new.cliente_id;
  if empresa_relacionada is distinct from new.empresa_id then
    raise exception 'Cliente não pertence à empresa da cobrança.';
  end if;

  if new.parcela_id is not null then
    select empresa_id into empresa_relacionada from public.parcelas where id = new.parcela_id;
    if empresa_relacionada is distinct from new.empresa_id then raise exception 'Parcela não pertence à empresa da cobrança.'; end if;
  end if;

  if new.assinatura_id is not null then
    select empresa_id into empresa_relacionada from public.assinaturas where id = new.assinatura_id;
    if empresa_relacionada is distinct from new.empresa_id then raise exception 'Assinatura não pertence à empresa da cobrança.'; end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validar_cobranca_empresa_trigger on public.cobrancas_integradas;
create trigger validar_cobranca_empresa_trigger
before insert or update on public.cobrancas_integradas
for each row execute function public.validar_cobranca_empresa();

revoke all on function public.validar_assinatura_empresa() from public;
revoke all on function public.validar_tarefa_empresa() from public;
revoke all on function public.validar_cobranca_empresa() from public;

-- Teste esperado: qualquer tentativa de vincular UUIDs de empresas diferentes deve falhar.
