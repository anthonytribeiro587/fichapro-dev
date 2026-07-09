# Roadmap para ambiente de testes - FichaPro

Lista de melhorias para desenvolver e validar em ambiente de testes antes de publicar em produção.

## Controle de custo e lucro

Objetivo: diferenciar preço de venda, custo do produto e lucro estimado.

Pontos a desenhar/testar:

- Adicionar preço de custo no cadastro do produto.
- Avaliar se o custo deve ser fixo no produto ou registrado por entrada de estoque.
- Registrar entrada de estoque com quantidade, custo unitário, fornecedor e data.
- Calcular custo médio quando houver compras com preços diferentes.
- Mostrar margem estimada por produto.
- Mostrar lucro bruto nas vendas.
- Ajustar relatórios para separar faturamento, custo e lucro.
- Evitar alterar histórico de vendas antigas quando o custo atual mudar.

## Observação importante

No momento, o indicador da tela de produtos mostra o valor potencial de venda do estoque atual, calculado por:

estoque atual x preço de venda

Por isso, em produção o texto foi ajustado para "Valor previsto em estoque".
