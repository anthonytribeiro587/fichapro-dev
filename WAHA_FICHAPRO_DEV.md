# Integração WAHA no FichaPRO DEV

Esta versão adiciona a primeira integração segura do FichaPRO DEV com o WAHA hospedado fora da Vercel.

## Variáveis necessárias na Vercel DEV

Cadastre no projeto DEV/Preview da Vercel:

```env
WAHA_BASE_URL=https://waha-production-eb78.up.railway.app
WAHA_API_KEY=fichapro_dev_waha_2026_chave_forte_987
WAHA_SESSION=testeweb
WAHA_WEBHOOK_SECRET=fichapro_dev_webhook_secret
```

> A chave do WAHA fica só no backend do Next.js. O navegador chama apenas `/api/whatsapp/send`.

## O que foi incluído

- `src/app/api/whatsapp/send/route.ts`
  - Envia mensagem de texto pelo endpoint `/api/sendText` do WAHA.
  - Normaliza telefone brasileiro no formato `55DDDNUMERO@c.us`.
  - Usa timeout para evitar carregamento infinito.

- `src/app/api/whatsapp/status/route.ts`
  - Consulta a sessão configurada em `WAHA_SESSION`.

- `src/lib/waha.ts`
  - Helpers de configuração, headers e normalização de telefone.

- `src/app/configuracoes/page.tsx`
  - Nova área **WhatsApp DEV** para testar status e envio manual.

- `src/app/clientes/[id]/page.tsx`
  - Botões de envio por WAHA na ficha do cliente:
    - Cobrança via WAHA;
    - Pós-venda WAHA;
    - Lembrete de parcela via WAHA.
  - Mantido botão de abrir WhatsApp manual como fallback.

## Como testar

1. Confirme no Dashboard do WAHA que a sessão `testeweb` está `WORKING`.
2. Suba este código no GitHub do FichaPRO DEV.
3. Na Vercel DEV, cadastre as variáveis acima.
4. Aguarde o deploy.
5. Acesse `Configurações > WhatsApp DEV`.
6. Clique em **Ver status**.
7. Envie uma mensagem para um número de teste.

## Observação importante

Não aplique isso em produção ainda. Esta etapa é só para validar envio manual no DEV. Webhook, histórico de mensagens no Supabase e automações devem entrar depois que o envio estiver estável.
