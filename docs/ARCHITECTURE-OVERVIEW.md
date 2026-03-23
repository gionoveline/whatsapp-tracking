# Architecture Overview – WhatsApp Tracking

Resumo executivo de 1 página para onboarding rápido.

---

## O que a plataforma faz

O WhatsApp Tracking conecta eventos de WhatsApp (lead qualificado e venda) com a origem de mídia (campanha, conjunto e anúncio), permitindo medir funil por empresa.

Em termos práticos:

- recebe eventos de sistemas externos (ex.: OctaDesk) via webhook;
- enriquece com dados da Meta;
- salva no Supabase com isolamento por tenant;
- exibe dashboard e exporta dados para análise.

---

## Arquitetura em 30 segundos

- **Frontend:** Next.js + React (dashboard, configurações, login).
- **Backend:** API Routes no próprio Next.js.
- **Banco/Auth:** Supabase Postgres + Supabase Auth (Google).
- **Integrações:** Meta Marketing API e Meta Conversions API.
- **Segurança:** autenticação por JWT, `x-partner-id`, RLS no banco e segredo de webhook por tenant.

---

## Fluxo principal de dados

1. Um evento chega via webhook (`lead`, `sql` ou `sale`) com `x-partner-id`.
2. A API valida autenticação do webhook e limites de requisição.
3. No evento `lead`, o sistema busca dados da campanha (cache + Meta API).
4. O registro é salvo/atualizado em `leads`.
5. O dashboard lê `leads` por tenant e monta o funil.
6. (Opcional) eventos também são enviados para Meta CAPI para otimização de campanhas.

---

## Entidades de banco mais importantes

- `partners`: empresas (tenants).
- `users`: usuários da aplicação.
- `partner_members`: relação usuário x empresa.
- `leads`: fato principal do funil (`lead` -> `sql` -> `venda`).
- `meta_ad_cache`: cache de metadados de anúncios da Meta.
- `app_settings`: configurações por empresa (token Meta, webhook secret, CAPI).

---

## Multi-tenant e segurança

- Toda operação de negócio é escopada por `partner_id`.
- Policies de RLS aplicam isolamento no nível do banco.
- Endpoints internos exigem `Authorization: Bearer <token>` + `x-partner-id`.
- Webhooks exigem segredo por tenant e podem usar HMAC com timestamp.

---

## Benefícios atuais

- Visão de funil por campanha com granularidade de anúncio.
- Menos dependência de planilhas manuais para atribuição.
- Estrutura pronta para múltiplas empresas com controle de acesso.

---

## Próximos passos recomendados

- Criptografia de segredos armazenados em `app_settings`.
- Rate limiting distribuído (Redis/KV) para escala horizontal.
- Agregações SQL/materialized views para melhorar performance analítica.
- Observabilidade por tenant (latência de webhook, erro por integração, taxa de conversão).

---

## Referências internas

- Arquitetura completa: `docs/ARCHITECTURE.md`
- Dicionário de dados: `docs/DATA-DICTIONARY.md`
- Onboarding operacional: `docs/ONBOARDING.md`

