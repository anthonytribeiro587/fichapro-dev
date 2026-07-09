# FichaPRO DEV + Evolution API

Esta versão usa a Evolution API como provedor principal de WhatsApp.

## Variáveis na Vercel DEV

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=http://147.15.89.173:8080
EVOLUTION_API_KEY=nextlead_api_2026
EVOLUTION_INSTANCE=nextlead
WHATSAPP_WEBHOOK_SECRET=fichapro_dev_webhook_secret
```

Se a chave `nextlead_api_2026` não funcionar, use o token da instância copiado no Manager da Evolution.

## Teste

1. Confirme no Evolution Manager que a instância `nextlead` está `Connected`.
2. Suba este zip no GitHub/Vercel.
3. Faça redeploy após cadastrar as variáveis.
4. Acesse `Configurações > WhatsApp DEV`.
5. Clique em `Ver status`.
6. Envie uma mensagem de teste para outro número.

## Endpoint usado

O FichaPRO envia mensagens por:

```txt
POST /message/sendText/{EVOLUTION_INSTANCE}
```

Body:

```json
{
  "number": "5551999999999",
  "textMessage": {
    "text": "Mensagem"
  },
  "delay": 1000,
  "linkPreview": false
}
```

Header:

```txt
apikey: EVOLUTION_API_KEY
```

## Fallback WAHA

O código ainda mantém fallback para WAHA se `WHATSAPP_PROVIDER=waha`, mas para o DEV atual o recomendado é usar Evolution.
