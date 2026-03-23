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
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`
   - `META_ACCESS_TOKEN` – token da Meta com permissão de leitura de anúncios (opcional se salvar por empresa em Configurações)
   - `WEBHOOK_SECRET` – fallback legado para validar chamadas aos webhooks (produção recomendada: token por empresa em Configurações > Webhooks)

4. **Supabase Auth (Google)**  
   No painel do Supabase: **Authentication → Providers → Google** (habilitar).  
   Em **Authentication → URL Configuration**:
   - **Site URL** deve ser a URL **pública de produção** (ex.: `https://seu-app.vercel.app` ou domínio próprio), **não** `http://localhost:3000` — se o Site URL for localhost, o fluxo OAuth pode voltar para localhost mesmo com o app em produção.
   - **Redirect URLs** (lista): inclua **todas** as URLs de callback, por exemplo:
     - `http://localhost:3000/auth/callback` (dev)
     - `https://seu-app.vercel.app/auth/callback` (produção / preview)
     - domínio customizado, se houver  
   Na **Vercel** (Production): confira que **não** há `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. Se precisar forçar a origem do redirect, use `NEXT_PUBLIC_SITE_URL=https://seu-dominio-real` (veja `.env.example`).

5. Crie as tabelas no Supabase (SQL Editor), **nesta ordem**:
   - `supabase/migrations/001_leads_meta_ad_cache.sql`
   - `supabase/migrations/002_leads_contact_phone_required.sql`
   - `supabase/migrations/003_app_settings.sql`
   - `supabase/migrations/004_status_sql_venda.sql`
   - `supabase/migrations/005_partners_users.sql`
   - `supabase/migrations/006_tenant_enforcement.sql`
   - `supabase/migrations/007_global_admin_seed.sql`
   - `supabase/migrations/008_auth_user_profile.sql`

## Desenvolvimento

```bash
pnpm dev
```

Abre em **http://localhost:3000**.

## Autenticação e multi-empresa

- Login com **Google** via Supabase (`/login`).
- E-mails permitidos: `@eumedicoresidente.com.br` e exceção **`gnoveline@gmail.com`** (acesso global a todas as empresas no app).
- Após o login, use o seletor de empresa no topo; o valor fica em `localStorage` (`active_partner_id`).
- APIs autenticadas (`/api/funnel`, `/api/export`, `/api/settings/*`) exigem:
  - header `Authorization: Bearer <access_token do Supabase>`
  - header `x-partner-id: <uuid da linha em public.partners>`

O front já envia esses headers onde aplicável.

## API (webhooks)

Todos os webhooks exigem o token no header (`x-webhook-secret` ou `Authorization: Bearer`) e o header **`x-partner-id`** com o UUID do parceiro (empresa).

- **POST /api/webhooks/lead** (conversa iniciada)  
  Body: payload no formato OctaDesk contendo no mínimo `id`, `createdAt`, telefone do contato e referral com `source_id`, `ctwa_clid`, `headline`, `source_url`.

- **POST /api/webhooks/sql**  
  Body: `{ "occurred_at": "...", "conversation_id": "..." }` **ou** `{ "occurred_at": "...", "phone": "..." }` (`opp_id` opcional).

- **POST /api/webhooks/sale**  
  Body: `{ "occurred_at": "...", "conversation_id": "..." }` **ou** `{ "occurred_at": "...", "phone": "..." }`.

As rotas antigas (`/api/webhooks/conversation-started`, `/opp`, `/ganho`) reencaminham para essas rotas.

### Regra de data/hora (obrigatória)

- `lead`: usar `createdAt` (ISO 8601, ex. `2026-03-20T16:20:00.000Z`)
- `sql` e `sale`: usar `occurred_at` (ISO 8601)
- Esses timestamps são obrigatórios para refletir o momento real dos eventos nos gráficos.

## Funil e dashboard

- **GET /api/funnel** – agregação do funil por campanha. Query: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (opcional). Requer autenticação + `x-partner-id`.
- Dashboard em `/dashboard` (em desenvolvimento).

## Documentação

- [CONTEXT-CTWA-EMR.md](CONTEXT-CTWA-EMR.md) – contexto do problema, APIs, fluxo de dados.
- [docs/ONBOARDING.md](docs/ONBOARDING.md) – onboarding detalhado.
- [docs/VISAO-PRODUTO.md](docs/VISAO-PRODUTO.md) – visão de produto e roadmap.
- [docs/WCI-REFERENCE.md](docs/WCI-REFERENCE.md) – referência Google WCI (futuro).

## Rollout (checklist)

1. Rodar migrations `001`–`008` na ordem em um banco Staging e validar.
2. Confirmar provider Google e redirect `…/auth/callback`.
3. Criar linhas em `partners` / `partner_members` conforme necessário (novos usuários do domínio recebem vínculo automático ao parceiro `default` via trigger em `008`).
4. Configurar token de webhook por empresa em `Configurações > Webhooks` e integrar com `x-partner-id` correto.
5. Validar envio de timestamps obrigatórios (`createdAt`/`occurred_at`) em todos os eventos.
