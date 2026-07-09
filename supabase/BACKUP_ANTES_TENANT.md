# Backup antes de aplicar tenant/equipe

Não executei backup real do banco nesta máquina porque o ZIP não contém a senha/connection string do Supabase.
Antes de rodar `migration-v31-tenant-equipe.sql`, faça uma destas opções:

## Opção 1 — Supabase Dashboard
1. Supabase > Project Settings > Database.
2. Copie a connection string.
3. Faça backup pelo painel ou pelo terminal com `pg_dump`.

## Opção 2 — Terminal
```bash
pg_dump "postgresql://postgres:<SENHA>@<HOST>:5432/postgres" \
  --clean --if-exists --no-owner --no-privileges \
  -f backup-fichapro-antes-tenant.sql
```

## Opção 3 — Backup das tabelas principais em CSV/SQL
No SQL Editor, exporte ou rode selects das tabelas:
- clientes
- produtos
- vendas
- venda_itens
- parcelas
- usuarios/perfis, se existir

Depois de confirmar o backup, aí sim rode a migration de tenant/equipe.
