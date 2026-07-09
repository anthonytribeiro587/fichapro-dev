# FichaPro — versão recriada

Versão recriada com foco no padrão visual dos mockups enviados: layout premium, sidebar fixa, cards claros, ações rápidas, telas de pedido, histórico, vencimentos, clientes, produtos e relatórios com UI consistente.

## Como subir no Git/Vercel

1. Extraia o zip.
2. Copie os arquivos por cima do repositório atual.
3. Mantenha as variáveis no Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Rode o build:
   - `npm install`
   - `npm run build`

## Observação importante

O build foi testado com sucesso. O arquivo `src/lib/supabase.ts` não quebra mais o build quando as variáveis não existem localmente, mas no Vercel elas precisam estar configuradas para o sistema conectar nos dados reais.

## Principais ajustes

- CSS global refeito do zero, com padrão mais próximo dos prints.
- Melhor responsividade para mobile.
- Sidebar e menu inferior ajustados.
- Cards, botões, tabelas, vencimentos e pedidos com visual mais limpo.
- Build validado em produção.


## Atualização v24
- Campo fornecedor no cadastro/edição de produtos.
- Venda livre / sob encomenda oculta campos e ações de estoque.
- Migration: supabase/migration-v33-produto-fornecedor.sql


## v27
- Categorias e fornecedores salvos agora aparecem com prioridade nas sugestões.
- Quando a categoria atual já é uma opção exata, a lista continua mostrando outras opções para evitar a impressão de que não salvou.
- Lista de sugestões expandida para até 12 itens.
