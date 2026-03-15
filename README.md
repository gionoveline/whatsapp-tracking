# WhatsApp Tracking – Atribuição CTWA (MVP)

Atribuição de campanhas Click to WhatsApp (Meta): reconecta leads, OPPs e ganhos às campanhas/ad sets/anúncios.

## Pré-requisitos

- Node.js 18+
- pnpm
- Conta Supabase (projeto criado)
- Token Meta Marketing API (leitura de ads)
- (Opcional) Token OctaDesk para integração

## Configuração

1. Clone/abra o projeto e instale dependências:

   ```bash
   pnpm install
   ```

2. Copie as variáveis de ambiente:

   ```bash
   cp .env.example .env.local
   ```

3. Preencha `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - `META_ACCESS_TOKEN` – token da Meta com permissão de leitura de anúncios
   - `WEBHOOK_SECRET` – token para validar chamadas aos webhooks (header `x-webhook-secret` ou `Authorization: Bearer <token>`)

4. Crie as tabelas no Supabase:
   - No SQL Editor do Supabase, execute o conteúdo de `supabase/migrations/001_leads_meta_ad_cache.sql`.

## Desenvolvimento

```bash
pnpm dev
```

Abre em **http://localhost:3000**.

## API (webhooks)

- **POST /api/webhooks/lead** (conversa iniciada)  
  Body: payload no formato OctaDesk. Obrigatórios: telefone do lead, id do anúncio (source_id), ctwa_clid, headline, source_url. Header: `x-webhook-secret` ou `Authorization: Bearer <WEBHOOK_SECRET>`.

- **POST /api/webhooks/sql**  
  Body: `{ "conversation_id": "...", "opp_id": "..." }` (opp_id opcional). Atualiza o lead para status SQL.

- **POST /api/webhooks/sale**  
  Body: `{ "conversation_id": "..." }` ou `{ "phone": "..." }`. Atualiza o lead para status venda e preenche `won_at`.

As rotas antigas (`/api/webhooks/conversation-started`, `/opp`, `/ganho`) continuam funcionando.

## Funil e dashboard

- **GET /api/funnel** – agregação do funil por campanha (e ad set/ad). Query: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (opcional).
- Dashboard em `/dashboard` (em desenvolvimento).

## Documentação

- [CONTEXT-CTWA-EMR.md](CONTEXT-CTWA-EMR.md) – contexto do problema, APIs, fluxo de dados.
- [docs/VISAO-PRODUTO.md](docs/VISAO-PRODUTO.md) – visão de produto e roadmap.
- [docs/WCI-REFERENCE.md](docs/WCI-REFERENCE.md) – referência Google WCI (futuro).
