# FichaPRO DEV — Integrações e Automações v55

Esta versão conecta a operação do FichaPRO DEV ao Mercado Pago e à Evolution API, mantendo ações sensíveis controladas e auditáveis.

## O que foi implementado

### Mercado Pago

- Teste de credencial pelo backend.
- Geração de Pix individual por cliente.
- Registro da cobrança em `cobrancas_integradas`.
- Webhook com validação de assinatura.
- Consulta da ordem novamente na API antes de confiar no status.
- Baixa da parcela vinculada quando o pagamento é confirmado.
- Criação idempotente de tarefa pós-pagamento.
- Notificação opcional ao administrador pela Evolution.

### Evolution API

- Teste da conexão da instância.
- Configuração do webhook pelo painel do FichaPRO.
- Recepção de mensagens e eventos.
- Associação da conversa ao cliente pelo telefone.
- Registro de conversas e mensagens.
- Criação de tarefa `Responder cliente` para novas mensagens.
- Confirmação automática de recebimento opcional e desligada por padrão.

### Produto e UX

- Central de Automações em `/automacoes`.
- Central de Pagamentos em `/pagamentos`.
- Personalização da empresa em `/configuracoes/negocio`.
- Perfis de comércio, serviços, recorrência e híbrido.
- Nome, cor e termos personalizados por empresa.
- Histórico de execuções de webhooks e automações.
- Navegação reorganizada por objetivo do usuário.

## 1. Banco de dados DEV

Execute no SQL Editor do Supabase DEV, após as migrations v53 e v54:

```text
supabase/migration-v55-integracoes-automacoes.sql
```

Valide:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'automacoes',
    'automacao_execucoes',
    'eventos_webhook',
    'conversas_whatsapp',
    'mensagens_whatsapp'
  );
```

## 2. Variáveis na Vercel DEV

Use `.env.example` como referência e configure no projeto Vercel conectado ao `fichapro-dev`.

Variáveis obrigatórias:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL
SUPABASE_SERVICE_ROLE_KEY

WHATSAPP_PROVIDER
EVOLUTION_API_URL
EVOLUTION_API_KEY
EVOLUTION_INSTANCE
WHATSAPP_WEBHOOK_SECRET

MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_SECRET
```

Variáveis opcionais:

```text
WHATSAPP_ADMIN_NUMBER
WHATSAPP_AUTO_ACK_ENABLED=false
```

Nunca use a `service_role`, Access Token do Mercado Pago ou chave da Evolution em variáveis `NEXT_PUBLIC_*`.

## 3. Mercado Pago

### Criar a aplicação

No painel Mercado Pago Developers, crie ou use uma aplicação vinculada à conta que receberá os pagamentos.

Adicione o Access Token na Vercel DEV:

```text
MERCADO_PAGO_ACCESS_TOKEN
```

### Configurar o webhook

Cadastre esta URL no Mercado Pago:

```text
https://SEU-DOMINIO-DEV/api/webhooks/mercadopago
```

Selecione notificações de **Order/Pedido**. Copie a assinatura secreta gerada e salve na Vercel como:

```text
MERCADO_PAGO_WEBHOOK_SECRET
```

Depois faça redeploy.

### Teste

1. Acesse `/automacoes`.
2. Abra `Integrações`.
3. Confirme que Mercado Pago aparece conectado.
4. Acesse `/pagamentos`.
5. Escolha um cliente com e-mail válido.
6. Gere uma cobrança de valor baixo para teste.
7. Pague o Pix.
8. Confirme que:
   - a cobrança mudou para `pago`;
   - uma tarefa foi criada em `/operacao`;
   - o histórico apareceu em `/automacoes`.

## 4. Evolution API

Confirme na Vercel DEV:

```text
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL
EVOLUTION_API_KEY
EVOLUTION_INSTANCE
WHATSAPP_WEBHOOK_SECRET
```

Acesse:

```text
/automacoes > Integrações > Evolution API
```

Clique em **Configurar webhook**. O FichaPRO cadastra automaticamente os eventos:

- mensagens recebidas;
- atualizações de mensagem;
- mensagens enviadas;
- alterações de conexão.

Teste enviando uma mensagem para o WhatsApp conectado. O sistema deve:

1. registrar o evento;
2. identificar o cliente pelo telefone, quando existir;
3. criar ou atualizar a conversa;
4. salvar a mensagem;
5. criar uma próxima ação para responder.

## 5. Resposta automática de recebimento

Ela fica desligada por padrão:

```text
WHATSAPP_AUTO_ACK_ENABLED=false
```

Somente após validar os webhooks, altere para:

```text
WHATSAPP_AUTO_ACK_ENABLED=true
```

Essa opção envia apenas uma confirmação curta de recebimento. Ela não ativa atendimento com IA.

## 6. Estado atual das automações

Já executam de verdade:

- pagamento confirmado → baixar cobrança/parcela;
- pagamento confirmado → criar tarefa pós-pagamento;
- pagamento confirmado → avisar administrador, quando configurado;
- mensagem recebida → registrar conversa e mensagem;
- mensagem recebida → criar tarefa de resposta.

Ainda são modelos/rascunhos e exigem próximas etapas:

- régua automática por data de vencimento;
- reativação programada de clientes;
- IA para classificação e resposta;
- envio automático de cobrança sem revisão;
- renovação em sistemas externos.

## 7. Segurança

- Webhooks possuem validação e deduplicação.
- O backend consulta a ordem no Mercado Pago antes de confirmar o pagamento.
- A tarefa pós-pagamento possui chave única por cobrança e tipo.
- Credenciais ficam somente no backend.
- A IA não confirma pagamento e não conclui renovação.
- A confirmação automática de recebimento fica desligada por padrão.
- Não execute esta migration no Supabase de produção nesta etapa.

## 8. Atenção às credenciais antigas

Caso alguma chave real da Evolution tenha sido colocada anteriormente em arquivo versionado, documentação, commit ou print público, gere uma nova chave antes de continuar os testes. Remover o texto do arquivo atual não elimina o segredo do histórico do Git.
