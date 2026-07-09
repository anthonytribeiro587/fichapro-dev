-- FichaPro v36/v37 - quantidade de atenção do produto
-- Rode no SQL Editor do Supabase antes/depois do deploy desta versão.
-- Não apaga dados. Apenas cria o campo usado para salvar a Qtd. de atenção por produto.

alter table public.produtos
  add column if not exists quantidade_atencao integer not null default 1 check (quantidade_atencao >= 1);

-- Produtos antigos que ficaram sem valor recebem o novo padrão 1.
update public.produtos
set quantidade_atencao = 1
where quantidade_atencao is null or quantidade_atencao < 1;

comment on column public.produtos.quantidade_atencao is 'Quantidade mínima para o sistema mostrar alerta de estoque baixo.';
