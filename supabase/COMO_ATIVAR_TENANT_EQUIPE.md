# Como ativar SaaS/tenant/equipe no FichaPro

## 1. Antes
Você já zerou os dados de teste e importou clientes da MK. Mesmo assim, não apague usuários do Auth.

## 2. Rodar migration
No Supabase:

**SQL Editor → New query**

Cole e rode todo o arquivo:

`supabase/migration-v34-saas-tenant-equipe-producao.sql`

Ela cria:

- `empresas`
- `empresa_membros`
- `empresa_id` nas tabelas principais
- policies RLS por empresa
- vínculo automático por e-mail quando criar funcionária no Auth

## 3. Como testar
Entre com `mklafke.presentes@gmail.com`.

Depois vá em **Configurações**:

- deve aparecer empresa **MK Presentes**
- deve aparecer o acesso dela como **Dona**
- ao adicionar funcionária, ela entra na mesma empresa

## 4. Fluxo para funcionária
1. Crie o usuário da funcionária no Supabase Auth.
2. No FichaPro, em Configurações, adicione o e-mail da funcionária.
3. Se o e-mail já existir no Auth, ele fica ativo.
4. Ao entrar, ela verá a mesma base da MK Presentes.

## 5. Observação
O app ainda usa `user_id` para auditoria básica, mas o isolamento real passa a ser por `empresa_id`.
