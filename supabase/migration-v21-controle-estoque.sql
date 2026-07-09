-- v21 — controle de estoque opcional
-- Permite produtos vendidos sob encomenda/rotativos sem baixar estoque.

alter table public.produtos
add column if not exists controla_estoque boolean not null default true;

comment on column public.produtos.controla_estoque is
'Quando false, o produto pode ser vendido sem saldo e não baixa/devolve estoque em pedidos.';


-- Garante que o status de estorno usado pelo sistema seja aceito no banco.
alter table public.vendas drop constraint if exists vendas_status_check;
alter table public.vendas
add constraint vendas_status_check
check (status in ('aberta', 'quitada', 'cancelada', 'estornada'));
