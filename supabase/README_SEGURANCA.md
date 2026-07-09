# Segurança do FichaPro no Supabase

Arquivos principais:

- `schema.sql`: schema base do projeto.
- `schema-seguranca-fichapro.sql`: schema atual com RLS forte, políticas e permissões.
- `backup-schema-fichapro-2026-07-07.sql`: cópia de segurança do schema para guardar.
- `migration-v31-tenant-equipe.sql`: preparação futura para SaaS com empresas/equipe.

## O que protege hoje

O app atual usa isolamento por `user_id = auth.uid()`. Isso significa que cada login só enxerga e altera os próprios clientes, produtos, vendas, parcelas e histórico, desde que as políticas RLS estejam aplicadas.

## O que ainda não é tenant completo

Para uma dona liberar funcionárias no mesmo ambiente, será necessário aplicar e ligar o app ao modelo `empresas` + `empresa_membros`. A migração v31 já deixa essa base preparada, mas o app atual ainda trabalha principalmente por `user_id`.

## Antes de apresentar

No Supabase Free, backups agendados não estão inclusos. Guarde pelo menos estes arquivos no GitHub:

- `/supabase/schema-seguranca-fichapro.sql`
- `/supabase/backup-schema-fichapro-2026-07-07.sql`
