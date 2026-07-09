# Auditoria rápida de segurança — FichaPro

## Ajustes aplicados neste pacote

1. **Headers de segurança no Next/Vercel**
   - `X-Frame-Options: DENY` contra iframe/clickjacking.
   - `X-Content-Type-Options: nosniff`.
   - `Referrer-Policy: no-referrer`.
   - `Permissions-Policy` bloqueando câmera, microfone, localização, USB e payment.
   - `X-Robots-Tag: noindex, nofollow` para evitar indexação do app.
   - `Content-Security-Policy` restrita a self + Supabase.

2. **Login sem senha demo exposta**
   - Removido preenchimento automático `demo@fichapro.com` e senha padrão.
   - Erro de login agora é genérico para não expor detalhe técnico.

3. **Supabase protegido por RLS**
   - Incluído `/supabase/schema-seguranca-fichapro.sql`.
   - Incluído `/supabase/backup-schema-fichapro-2026-07-07.sql`.
   - Políticas garantem que cada usuário acesse apenas registros com `user_id = auth.uid()`.
   - Relacionamentos de vendas, parcelas e itens validam cliente/produto/venda do próprio usuário.
   - `FORCE ROW LEVEL SECURITY` aplicado nas tabelas principais.
   - Permissões do papel `anon` revogadas nas tabelas do sistema.

4. **Preparação para SaaS/equipe**
   - Mantida a migração `migration-v31-tenant-equipe.sql` para futura evolução com `empresas` e `empresa_membros`.
   - Estado atual: seguro por login individual. Para equipe compartilhada, ainda precisa ligar o app ao `empresa_id`.

## Pontos que ainda precisam de etapa 2 antes de produção SaaS real

- Criar fluxo de convite de funcionária com permissões por função.
- Migrar consultas do app de `user_id` para `empresa_id` quando ativar multiusuário por empresa.
- Criar backup externo automático ou migrar Supabase para plano com backup agendado.
- Criar logs de auditoria visíveis na área de Configurações.
- Evitar operações críticas de estoque 100% pelo frontend usando RPCs transacionais no Supabase.

## Como aplicar a proteção no Supabase

1. Abra Supabase > SQL Editor.
2. Cole e execute o arquivo `/supabase/schema-seguranca-fichapro.sql`.
3. Depois teste com dois logins diferentes: um usuário não deve ver dados do outro.

