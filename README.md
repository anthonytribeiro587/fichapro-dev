# FichaPro CRM
## Atualização v26 — lapidação UX para apresentação

- Desktop agora funciona como app: menu lateral fixo e somente o conteúdo central rola.
- Sidebar mais fina, leve e alinhada com a identidade visual do sistema.
- Seção **Pedidos** com submenu discreto e sincronizado com as telas.
- Clientes recebeu redução visual de tamanhos para ficar menos “zoomado”.
- Novo pedido ficou mais operacional, com formulário e resumo mais equilibrados.
- Histórico de pedidos ficou mais compacto, com busca e filtros melhores.
- Correção do filtro duplicado em histórico.

## Atualização v21 — venda com ou sem estoque

- Produtos agora têm o campo **Controle de estoque**.
- Quando marcado como **Controlar estoque**, o sistema mostra saldo disponível e baixa/devolve estoque em vendas, cancelamentos e estornos.
- Quando marcado como **Venda livre / sob encomenda**, o produto pode ser vendido sem saldo e não movimenta estoque.
- A tela de pedidos mostra no seletor: preço + quantidade disponível ou **venda livre**.
- A venda também tem opção **Produto avulso / sem estoque**, para itens rotativos que não vale a pena cadastrar no catálogo.
- Para projetos já publicados, rode `supabase/migration-v21-controle-estoque.sql` no Supabase antes do deploy.

## Atualização v16 — UX de pedidos

- Menu lateral alterado de **Nova venda** para **Pedidos**.
- A rota antiga `/vendas` redireciona para `/pedidos/novo`; a criação e o histórico ficam separados para evitar confusão.
- Lista **Pedidos registrados** redesenhada com cards clicáveis, menos botões e melhor leitura.
- Botão **Editar** removido da lista de pedidos; as ações de edição, cancelamento e estorno ficam dentro de **Abrir detalhes**.
- No modal de pedido, a ação foi renomeada para **Editar dados**, deixando claro que ela altera dados administrativos. Para trocar itens, quantidade ou valores, use cancelamento/estorno e lance novamente.



Sistema responsivo para consultoras/vendedoras que hoje usam Excel ou fichário para controlar clientes, compras, parcelas e vencimentos.

## O que já está pronto

- Login com Supabase Auth.
- Dashboard conectado a clientes, vendas e parcelas reais.
- Cadastro de clientes com ficha individual.
- Histórico de compras por cliente.
- Registro de nova venda/pedido com vários itens e geração automática de parcelas.
- Tela de vencimentos com filtros: hoje, atrasadas, próximos 7 dias, próximos 30 dias e todas.
- Botão de WhatsApp com mensagem pronta para cobrança e pós-venda.
- Cadastro de produtos com estoque, status e controle opcional de estoque.
- Relatórios simples de vendas, recebidos, pendentes, ranking de clientes e produtos.
- Layout responsivo para desktop e mobile.
- SQL completo com tabelas, índices, relacionamentos e RLS.

## Stack

- Next.js App Router
- React
- TypeScript
- Supabase Auth + Database
- Vercel
- CSS puro, sem Tailwind, para facilitar manutenção

## Como configurar localmente

### 1. Instale dependências

```bash
npm install
```

### 2. Crie o projeto no Supabase

Crie um projeto em Supabase e abra o SQL Editor.

### 3. Rode o SQL

Copie o conteúdo de:

```text
supabase/schema.sql
```

Cole no SQL Editor do Supabase e execute.

Esse SQL cria:

- `clientes`
- `produtos`
- `vendas`
- `venda_itens`
- `parcelas`
- `historico_cliente`
- índices
- triggers de `updated_at`
- políticas de segurança RLS por usuário

Se você já tinha rodado o banco antes da v21, rode também:

```text
supabase/migration-v21-controle-estoque.sql
```

### 4. Configure Auth

No Supabase, vá em:

```text
Authentication > Providers > Email
```

Ative Email/Password.

Para facilitar teste, você pode desativar confirmação obrigatória de e-mail enquanto estiver em desenvolvimento.

### 5. Configure variáveis de ambiente

Crie um arquivo `.env.local` na raiz do projeto:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
```

Você encontra essas chaves em:

```text
Supabase > Project Settings > API
```

Use apenas a `anon public key` no frontend. Nunca coloque a `service_role` no projeto público.

### 6. Rode o projeto

```bash
npm run dev
```

Abra:

```text
http://localhost:3000
```

### 7. Crie sua conta

Na tela de login, clique em `Criar conta`.

Depois de entrar, clique em:

```text
Inserir dados demo
```

Isso cria clientes, produtos, vendas, parcelas e histórico fictícios na sua própria conta.

## Deploy na Vercel

1. Suba o projeto para o GitHub.
2. Importe o repositório na Vercel.
3. Configure as variáveis:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

4. Faça o deploy.

O `package.json` já contém:

```json
"engines": {
  "node": "24.x"
}
```

Isso evita problema com versões antigas do Node na Vercel.

## Estrutura do projeto

```text
src/
  app/
    login/              Login e cadastro
    dashboard/          Indicadores principais
    clientes/           Lista e cadastro de clientes
    clientes/[id]/      Ficha completa do cliente
    vendas/             Nova venda/pedido + vários itens + geração de parcelas
    vencimentos/        Agenda de cobranças
    produtos/           Cadastro e estoque
    relatorios/         Relatórios simples
  components/
    AppShell.tsx        Layout protegido com menu
    Notice.tsx          Mensagens do sistema
    StatusPill.tsx      Tags visuais de status
  lib/
    supabase.ts         Cliente Supabase
    demo.ts             Inserção de dados demo
    format.ts           Datas, moeda, WhatsApp e utilitários
    types.ts            Tipos do sistema
supabase/
  schema.sql            Banco completo
```

## Regras de segurança

Todas as tabelas têm `user_id` e RLS ativo.

Isso significa que:

- uma consultora não enxerga dados da outra;
- inserts só entram com o próprio `auth.uid()`;
- updates/deletes só funcionam nos registros do usuário logado.

## Observações importantes

Este projeto está pronto como MVP real, mas ainda pode evoluir com:

- edição completa de clientes;
- importação de Excel;
- exportação de relatórios;
- lembretes automáticos por WhatsApp/API;
- painel admin para plano SaaS;
- assinatura mensal;
- multiusuário por equipe;
- anexos/fotos de comprovantes;
- controle de entrega.

## Sugestão comercial

Para primeira cliente:

- implantação inicial: R$ 500 a R$ 1.500;
- mensalidade: R$ 49 a R$ 97;
- ou valor simbólico em troca de feedback, prints e depoimento.

Posicionamento:

> Sistema para consultoras substituírem fichário e Excel por uma ficha digital com clientes, compras, parcelas, cobranças e WhatsApp.

## Ajustes v2

Esta versão corrige pontos de apresentação e operação:

- Tela de login com cards menores e mais alinhados.
- Layout geral mais suave, com menos peso visual e componentes menores.
- Tela de produtos agora permite editar um produto existente.
- Clique em **Editar** preenche o formulário da direita como **Editar produto**.
- Produtos têm movimentação rápida de estoque com botões **+1** e **-1**.
- O formulário de produto permite ajuste manual de estoque antes de salvar.

Se o projeto já estiver na Vercel, basta substituir os arquivos no GitHub e aguardar o redeploy.

## Ajustes v5 — venda com vários itens

Esta versão muda a tela de **Nova venda** para funcionar como uma sacola/pedido:

- escolha a cliente uma vez;
- adicione vários produtos no mesmo pedido;
- ajuste quantidade de cada item;
- o sistema calcula o total geral;
- as parcelas são geradas em cima do total da venda;
- o estoque baixa por produto vendido;
- a prévia e o WhatsApp mostram o resumo completo do pedido.

### Importante para quem já rodou o banco antes

Se você já estava usando uma versão anterior, rode no Supabase apenas este arquivo:

```text
supabase/migration-v5-venda-itens.sql
```

Ele cria a tabela:

```text
venda_itens
```

Essa tabela guarda os produtos dentro de cada venda. O arquivo também cria as políticas de segurança RLS e migra vendas antigas para um item único, para os relatórios não quebrarem.

Se você está criando o projeto do zero, pode rodar direto o `supabase/schema.sql`, porque ele já inclui a tabela `venda_itens`.

## Ajustes v6 — valor unitário editável na venda

Esta versão melhora a rotina real da consultora na tela de **Nova venda**:

- o produto continua sendo escolhido a partir do cadastro;
- o sistema puxa o preço cadastrado automaticamente;
- antes de adicionar na sacola, a consultora pode alterar o **valor unitário** só daquela venda;
- dentro da sacola, cada item também permite editar o **valor un.** sem alterar o cadastro original do produto;
- o total do item, total do pedido, parcelas e WhatsApp recalculam automaticamente;
- o mesmo produto pode entrar mais de uma vez no pedido com preços diferentes, se necessário;
- o estoque é baixado corretamente somando as quantidades por produto.

Não precisa rodar SQL novo para este ajuste. A alteração usa a tabela `venda_itens` criada na v5, que já possui `valor_unitario` e `valor_total`.


## Atualização v7

- O seletor de produto da tela Nova venda ficou em linha inteira para mostrar o nome completo do produto.
- O resumo da venda agora mostra os itens do pedido com quantidade, valor unitário e total do item.
- Antes de adicionar o produto, a prévia mostra o item selecionado como sugestão; depois de clicar em “Adicionar produto”, ele entra na sacola e passa a compor o total real da venda.
- Não precisa rodar SQL novo se a migração da v5 (`supabase/migration-v5-venda-itens.sql`) já foi executada.

## Ajustes da versão v9

- Corrigida a tela de ficha completa da cliente (`/clientes/[id]`) que estava visualmente desconfigurada.
- A ficha completa agora tem resumo superior, métricas, observações da ficha e últimas notas rápidas.
- A nota rápida agora salva no histórico e também atualiza o campo de observações da cliente.
- A tela de clientes agora busca e exibe as últimas notas rápidas no resumo da cliente selecionada.
- Não é necessário rodar novo SQL se você já rodou o `schema.sql` inicial e a migração da v5 para `venda_itens`.


## Atualização v10

- Adicionado botão **Nota rápida** diretamente no resumo da cliente na tela de Clientes.
- A nota rápida agora abre em modal, salva no histórico e também atualiza o campo de observações da ficha.
- A nota passa a aparecer tanto no resumo da cliente quanto na ficha completa.
- Não exige novo SQL, desde que a migração da v5 (`venda_itens`) já tenha sido executada.

## Atualização v12 — detalhes do pedido na ficha

- Cards de compra agora são clicáveis.
- Quando a venda tem vários itens, o card mostra `Pedido com X itens` e uma prévia dos produtos.
- Ao clicar, abre um modal com os itens do pedido, quantidade, valor unitário, total por item, total geral, parcelas, observações e WhatsApp.
- Na ficha completa, o histórico de compras também abre o mesmo detalhe do pedido.
- Não precisa rodar SQL novo, desde que a migração da v5 (`venda_itens`) já tenha sido executada.

## Atualização v15 — Gestão de vendas

Esta versão adiciona controle operacional para pedidos já registrados:

- abrir detalhes do pedido a partir da tela de Nova venda;
- editar data da venda, primeiro vencimento, forma de pagamento e observações;
- cancelar venda;
- estornar venda, cancelando parcelas e devolvendo itens ao estoque;
- marcar parcelas como pagas dentro do modal de detalhes;
- registrar histórico automático no cliente para venda editada, cancelada ou estornada.

Não é necessário rodar SQL novo nesta versão. Ela usa os campos e status já existentes nas tabelas `vendas`, `parcelas`, `produtos`, `venda_itens` e `historico_cliente`.

## v17 — Gestão do pedido também na ficha da cliente

Ajustes incluídos nesta versão:

- O modal de detalhes do pedido, aberto pela tela de Clientes e pela Ficha completa, agora também mostra ações de gestão.
- Agora é possível marcar parcelas como pagas, cancelar pedido ou estornar pedido diretamente pelos detalhes do pedido na ficha da cliente.
- Cancelamento e estorno foram separados por regra:
  - Cancelar pedido: indicado para desistência, erro de lançamento ou pedido que não deve seguir. Cancela parcelas em aberto e devolve estoque.
  - Estornar pedido: indicado para devolução/reembolso. Cancela parcelas e devolve estoque, mantendo registro de auditoria.
- Pedidos estornados passam a ter status `estornada`.
- Pedidos cancelados passam a ter status `cancelada`.

Não precisa rodar SQL novo se a migração `venda_itens` da v5 já foi aplicada.


## v18 — Correção mobile

Esta versão ajusta a experiência no celular para funcionar como aplicativo:

- menu inferior fixo estilo app/rede social;
- sidebar do desktop removida no mobile;
- topo mobile com marca e botão sair;
- telas em coluna única no celular;
- botões e cards reorganizados para não quebrar;
- modal de detalhes em formato de folha/bottom sheet no mobile;
- tela de pedidos, clientes, produtos, vencimentos e relatórios com melhor leitura em telas pequenas;
- correção de overflow horizontal e botões estourados.

Não precisa rodar SQL novo para atualizar da v17 para a v18.

## v19 — correções mobile

Ajustes desta versão:

- Removido botão "Inserir dados demo" da tela inicial.
- Corrigido topo mobile de Clientes para evitar campo de busca cortado.
- Vencimentos agora são agrupados por dia, evitando cards repetidos e datas quebradas no celular.
- Filtros de vencimentos no mobile viraram uma barra horizontal, sem botões gigantes empilhados.
- Topo de Produtos no mobile ficou mais limpo, sem duplicar títulos.
- Cards de produtos receberam ajuste de fontes, botões e espaçamentos no celular.

Não precisa rodar SQL novo em relação à v18.


## Atualização v20 — Mobile refeito

Esta versão ajusta a experiência mobile para ficar mais próxima de um app:

- topo mobile mais compacto;
- menu inferior com rótulos curtos;
- remoção do excesso visual do dashboard mobile;
- clientes com busca, botão e filtros mais alinhados;
- vencimentos agrupados por dia com cards menores;
- produtos com cards mais compactos e ações de estoque melhor posicionadas;
- pedidos com formulário e lista mais estáveis no celular;
- modais em formato bottom sheet no mobile.

Não precisa rodar SQL novo para esta versão.


## v27 — Retrofit visual aplicado

Esta versão aplica no código real o visual dos mockups aprovados:

- sidebar por grupos: Geral, Operação, Controle e Configurações;
- ícones redesenhados em SVG inline;
- Início sem texto explicativo longo, focado em resumo operacional;
- Pedidos separado em `/pedidos/novo` e `/pedidos/historico`;
- Histórico de pedidos com busca e filtros;
- Vencimentos com regra padrão: mostra somente parcelas não pagas e não canceladas. Parcelas pagas aparecem apenas em “Todos” ou conforme busca/filtro;
- layout desktop com sidebar fixa e conteúdo central rolável;
- ajustes visuais para deixar telas menos grandes e mais parecidas com SaaS real.

Não há SQL novo nesta versão. Se você já rodou a migração v21, basta substituir os arquivos e redeployar.
