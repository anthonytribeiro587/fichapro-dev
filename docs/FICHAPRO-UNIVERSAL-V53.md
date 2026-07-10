# FichaPRO Universal — DEV v53/v54

Esta evolução foi aplicada no repositório `fichapro-dev`. O repositório de produção não deve receber estas migrations ou telas antes da validação completa.

## Objetivo

Manter um único FichaPRO capaz de atender:

- comércio e revenda;
- prestadores de serviços;
- negócios com assinaturas e renovações;
- operações híbridas.

A interface muda conforme o perfil e os módulos da empresa, mas clientes, vendas, cobranças, pagamentos e próximas ações continuam no mesmo núcleo.

## Entregue nesta etapa

- perfil de negócio por empresa;
- módulos ativáveis;
- produtos, serviços, assinaturas, pacotes e encomendas;
- estrutura de assinaturas recorrentes;
- central de próximas ações em `/operacao`;
- configuração em `/configuracoes/negocio`;
- estrutura para cobranças integradas;
- estrutura para Mercado Pago e Evolution API sem armazenar tokens no navegador;
- RLS e validação entre registros da mesma empresa.

## O que ainda não acontece automaticamente

Ativar Pagamentos, WhatsApp ou IA não executa nada sozinho. Nesta fase:

- não é criado Pix;
- não é enviado WhatsApp;
- a IA não atende clientes;
- pagamentos não são baixados automaticamente;
- renovações continuam manuais.

## Ativação no Supabase DEV

Execute no SQL Editor do projeto Supabase ligado ao FichaPRO DEV, nesta ordem:

```text
supabase/migration-v53-fundacao-universal.sql
supabase/migration-v54-seguranca-relacoes.sql
```

Pré-requisito: a estrutura multiempresa com `empresas` e `empresa_membros` precisa estar ativa.

## Validação

```sql
select id, nome, perfil_negocio, modulos
from public.empresas;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'assinaturas',
    'tarefas_operacionais',
    'cobrancas_integradas',
    'integracoes_empresa'
  );
```

Depois:

1. abra `/configuracoes/negocio`;
2. configure uma empresa como comércio e revenda;
3. configure a empresa de recorrência com Recorrência e Próximas ações ativas;
4. abra `/operacao`;
5. crie, inicie, conclua e reabra uma ação manual;
6. confirme que usuários de outra empresa não conseguem acessar ou vincular os registros.

## Próximas etapas

1. integrar Mercado Pago em modo de teste;
2. validar o webhook e a idempotência;
3. ao confirmar pagamento, criar uma próxima ação automaticamente;
4. usar a Evolution API já existente no DEV para notificar somente números autorizados;
5. adicionar IA inicialmente apenas para consulta, triagem e geração de respostas;
6. liberar automações reais somente após testes com lista branca.

## Segurança

- Access Token do Mercado Pago e chave da Evolution ficam em variáveis protegidas do ambiente.
- `integracoes_empresa` guarda apenas configurações públicas e referências de segredo.
- A IA não confirma pagamento, desconto, entrega ou renovação por conta própria.
- Webhooks precisam ser validados e processados com chave de idempotência.
- A migration v54 bloqueia relações entre clientes, vendas, parcelas, assinaturas e cobranças de empresas diferentes.
