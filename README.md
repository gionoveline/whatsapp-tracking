# WhatsApp Tracking

Plataforma de atribuição para campanhas **Click to WhatsApp (CTWA)** com:

- captura de eventos de funil (`lead`, `sql`, `venda`);
- enriquecimento de mídia via Meta Marketing API (campanha, ad set, anúncio);
- envio opcional de conversões para a Meta (Conversions API for Business Messaging);
- isolamento de dados por empresa (multi-tenant com Supabase + RLS).

## Sumário

- [Visão Geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Stack Técnica](#stack-técnica)
- [Pré-requisitos](#pré-requisitos)
- [Configuração de Ambiente](#configuração-de-ambiente)
- [Banco de Dados (Migrations)](#banco-de-dados-migrations)
- [Executando Localmente](#executando-localmente)
- [Autenticação e Multi-tenant](#autenticação-e-multi-tenant)
- [Integração com Meta](#integração-com-meta)
- [Webhooks do Funil](#webhooks-do-funil)
- [Rotas Principais da API](#rotas-principais-da-api)
- [Operação e Deploy](#operação-e-deploy)
- [Segurança](#segurança)
- [Troubleshooting](#troubleshooting)
- [Documentação Complementar](#documentação-complementar)
- [Contribuição](#contribuição)

## Visão Geral

O sistema recebe eventos do WhatsApp/CRM, persiste no Supabase e disponibiliza análises no dashboard com recorte por período e parceiro. Quando configurado, também dispara eventos de conversão para otimização das campanhas na Meta.

Fluxo simplificado:

1. Entrada de webhook (`lead`, `sql`, `sale`).
2. Validação de autenticação, tenant e rate limit.
3. Persistência/atualização em `leads`.
4. Enriquecimento de mídia (cache local + fallback Meta Marketing API).
5. Envio opcional para Meta CAPI (Business Messaging).
6. Exibição analítica no dashboard e exportação.

## Arquitetura

- **Frontend:** App Router (Next.js) com páginas para dashboard, configuração e autenticação.
- **Backend:** API Routes em `app/api/*`.
- **Dados:** Supabase Postgres, `RLS` e políticas por tenant.
- **Integrações:** Meta Marketing API, Meta Conversions API for Business Messaging e OctaDesk.

Para detalhes técnicos completos, consulte `docs/ARCHITECTURE.md`.

## Stack Técnica

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Supabase (`@supabase/supabase-js`, `@supabase/ssr`)

## Pré-requisitos

- Node.js 18+
- `pnpm` instalado globalmente
- Projeto no Supabase
- Credenciais de integração (Meta e, opcionalmente, OctaDesk)

## Configuração de Ambiente

1. Instale dependências:

   ```bash
   pnpm install
   ```

2. Crie arquivo local de ambiente:

   ```bash
   cp .env.example .env.local
   ```

3. Preencha `.env.local`:

- **Obrigatórias**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- **Recomendadas**
  - `APP_SETTINGS_ENCRYPTION_KEY`
- **Opcionais**
  - `META_ACCESS_TOKEN` (fallback, se não for definido por empresa na UI)
  - `WEBHOOK_SECRET` (fallback legado)
  - `OCTADESK_API_TOKEN`
  - `CRON_SECRET`
  - `NEXT_PUBLIC_SITE_URL` (produção)

> Em produção, não utilize `localhost` em `NEXT_PUBLIC_SITE_URL`.

## Banco de Dados (Migrations)

Execute no Supabase SQL Editor, na ordem:

1. `supabase/migrations/001_leads_meta_ad_cache.sql`
2. `supabase/migrations/002_leads_contact_phone_required.sql`
3. `supabase/migrations/003_app_settings.sql`
4. `supabase/migrations/004_status_sql_venda.sql`
5. `supabase/migrations/005_partners_users.sql`
6. `supabase/migrations/006_tenant_enforcement.sql`
7. `supabase/migrations/007_global_admin_seed.sql`
8. `supabase/migrations/008_auth_user_profile.sql`

## Executando Localmente

```bash
pnpm dev
```

Aplicação disponível em `http://localhost:3000`.

Scripts úteis:

```bash
pnpm lint
pnpm build
pnpm start
```

## Autenticação e Multi-tenant

- Login Google via Supabase (`/login`).
- Tenant ativo selecionado no frontend (`active_partner_id`).
- APIs autenticadas exigem:
  - `Authorization: Bearer <supabase_access_token>`
  - `x-partner-id: <uuid_do_partner>`
- RLS reforçada com `force row level security`.

## Integração com Meta

### 1) Enriquecimento de mídia (Marketing API)

Configure o token Meta em `Configurações` para popular:

- `campaign_id`, `campaign_name`
- `adset_id`, `adset_name`
- `ad_name`

### 2) Conversões (CAPI Business Messaging)

Em `Configurações > Conversões`:

- informar `WABA ID`;
- informar `Dataset ID (Pixel)` conforme convenção atual da UI;
- mapear eventos internos (`lead`, `sql`, `venda`) para eventos Meta;
- salvar token Meta válido.

## Webhooks do Funil

Todos os webhooks exigem:

- `x-partner-id`
- token por header (`x-webhook-secret` ou `Authorization: Bearer <token>`)

### `POST /api/webhooks/lead`

Payload no formato do integrador com campos CTWA (ex.: `source_id`, `ctwa_clid`, `headline`, `source_url`) e `createdAt`.

### `POST /api/webhooks/sql`

Body:

```json
{ "occurred_at": "2026-04-08T15:40:00.000Z", "conversation_id": "abc123" }
```

ou

```json
{ "occurred_at": "2026-04-08T15:40:00.000Z", "phone": "5511999999999" }
```

### `POST /api/webhooks/sale`

Body:

```json
{ "occurred_at": "2026-04-08T16:10:00.000Z", "conversation_id": "abc123" }
```

ou

```json
{ "occurred_at": "2026-04-08T16:10:00.000Z", "phone": "5511999999999" }
```

### Regra obrigatória de timestamp

- `lead`: usar `createdAt` (ISO 8601)
- `sql` e `sale`: usar `occurred_at` (ISO 8601)

Sem timestamp válido, o evento é rejeitado.

## Rotas Principais da API

- `GET /api/funnel`
- `GET /api/export`
- `GET|POST /api/settings/meta-token`
- `GET|POST /api/settings/meta-conversions`
- `GET|POST /api/settings/webhook-secret`
- `POST /api/webhooks/lead`
- `POST /api/webhooks/sql`
- `POST /api/webhooks/sale`
- `GET /api/cron/octadesk-sync` (job de sincronização)

## Operação e Deploy

- Porta padrão de execução: `3000`.
- Recomenda-se Vercel para deploy do Next.js.
- Para execução agendada, configure cron chamando `GET /api/cron/octadesk-sync`.
- Em produção, valide:
  - segredo do cron (`CRON_SECRET`);
  - segredos por tenant;
  - configuração de OAuth no Supabase (`Site URL` e callbacks).

## Segurança

Controles atuais:

- autenticação via Supabase;
- autorização por tenant (`x-partner-id`);
- RLS no banco;
- validação de segredo em webhook;
- rate limit em memória;
- isolamento por partner nas queries.

Melhorias recomendadas:

- mover rate limit para backend distribuído (Redis/KV);
- consolidar auditoria/observabilidade de falhas de webhook e CAPI;
- rotação periódica de tokens e segredos por tenant.

## Troubleshooting

### Login Google volta para localhost em produção

- Verifique `NEXT_PUBLIC_SITE_URL`.
- No Supabase Auth, ajuste `Site URL` para domínio público.
- Inclua callbacks corretos em `Redirect URLs`.

### Dashboard sem dados

- Valide recebimento de webhooks.
- Verifique `x-partner-id` e token de webhook.
- Confira timestamps ISO (`createdAt` / `occurred_at`).

### Conversões Meta não chegam

- Verifique token Meta ativo.
- Revise mapeamento de eventos em `Configurações > Conversões`.
- Confirme `WABA ID` e `Dataset ID (Pixel)` preenchidos.
- Consulte logs de backend para falhas de envio CAPI.

## Documentação Complementar

- `docs/ARCHITECTURE.md` (arquitetura técnica detalhada)
- `docs/ONBOARDING.md` (onboarding operacional)
- `docs/VISAO-PRODUTO.md` (visão e roadmap)
- `CONTEXT-CTWA-EMR.md` (contexto de domínio)
- `docs/WCI-REFERENCE.md` (referência WCI)

## Contribuição

1. Crie uma branch de trabalho.
2. Faça mudanças pequenas e coesas.
3. Rode `pnpm lint` e valide fluxo principal.
4. Abra PR com contexto de negócio, risco e plano de teste.
