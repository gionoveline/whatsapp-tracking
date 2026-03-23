# Varredura de segurança — 3 skills (relatório consolidado)

**Data:** 2026-03-20  
**Plano de referência:** `~/.cursor/plans/varredura_segurança_3_skills_6d33607b.plan.md`  
**Escopo:** Next.js (App Router) + Supabase, rotas em `app/api`, UI em `app/`, políticas em `supabase/migrations/`.

## Artefatos gerados

| Skill | Artefato |
|--------|-----------|
| security-ownership-map | `docs/security/ownership-map-out/` (CSVs, `summary.json`, grafos) |
| security-threat-model | `docs/security/whatsapp-tracking-threat-model.md` |
| security-best-practices | `docs/security/security_best_practices_report.md` |

**Skills instaladas no repositório:** `.cursor/skills/security-ownership-map`, `security-threat-model`, `security-best-practices` (cópia a partir de `~/.codex/skills`).

---

## Fase 1 — Donos e SLA (ownership-map + matriz por domínio)

### Métricas do git (24 meses)

- **Commits analisados:** 3  
- **Pessoas:** 1 (`gnoveline@gmail.com` / `gionoveline`)  
- **Bus factor efetivo:** **1** para praticamente todo o código → risco operacional alto (férias, saída, indisponibilidade).  
- **Hotspots sensíveis automáticos (`summary.json`):** listas vazias — os padrões default do script não etiquetaram `lib/server-auth.ts` como `auth` (caminho `lib/`, não `**/auth/**`). Revisão manual abaixo.

### Matriz domínio × dono × SLA sugerido

| Domínio | Ativos principais | Dono (git) | SLA sugerido p/ Critical/High |
|--------|-------------------|------------|-------------------------------|
| Auth / sessão API | `lib/server-auth.ts`, `app/api/auth/session/route.ts`, `lib/auth-constants.ts` | gnoveline@gmail.com | Critical 24h / High 72h |
| Webhooks | `app/api/webhooks/**`, `lib/webhook-auth.ts`, `lib/octadesk.ts` | idem | Critical 24h / High 72h |
| Export / funil | `app/api/export/route.ts`, `app/api/funnel/route.ts` | idem | High 72h / Medium 7d |
| Settings / segredos app | `app/api/settings/meta-token/route.ts`, `app/api/settings/meta-conversions/route.ts`, `lib/get-meta-token.ts` | idem | Critical 24h |
| Supabase / tenant | `lib/supabase.ts`, `supabase/migrations/005*.sql`–`008*.sql` | idem | Critical 24h |
| Dashboard / UI | `app/dashboard/**`, `components/**` | idem | Medium 7d |

**Pontos sem “dono” formal:** não há `CODEOWNERS`; dono implícito = único committer. Recomenda-se documentar responsável de produto + engenharia e revisão de segurança periódica.

---

## Fase 2 — Threat model (resumo)

Principais temas: **segredo de webhook compartilhado**, **cabeçalho `x-partner-id` escolhível por quem tem o segredo**, **cliente Supabase com service role (RLS bypass no app)**, **rate limit em memória**, **exposição de PII em export**. Detalhes e tabela TM-xxx em `whatsapp-tracking-threat-model.md`.

---

## Fase 3 — Boas práticas (checklist por camada)

Legenda: **done** | **partial** | **missing**

| Camada | Item | Status |
|--------|------|--------|
| App/API | Auth obrigatória em rotas sensíveis (Bearer + partner) | partial — webhooks usam segredo compartilhado, não usuário |
| App/API | Validação de entrada (datas, format) | partial — JSON de webhook sem schema estrito (zod) |
| App/API | Rate limit | partial — `lib/request-security.ts` in-process apenas |
| App/API | Erros sem vazamento de stack | partial — algumas rotas retornam `error.message` do Supabase |
| Webhooks | Verificação com corpo bruto quando HMAC | done — `requireWebhookSecret` usa `clone().text()` + `requireWebhookAuth` |
| Webhooks | Anti-replay opcional | partial — depende de `WEBHOOK_REQUIRE_HMAC=true` |
| Supabase | RLS nas tabelas | done nas migrations; **app usa service role** → confiança na camada app |
| Segredos | `.env` não versionado | done (`.gitignore`); conferir deploy |

Relatório numerado: `security_best_practices_report.md`.

---

## Backlog priorizado (consolidado)

| ID | Severidade | Tema | Ação |
|----|------------|------|------|
| TM/BP | High | Partner em webhook só com segredo | Mapear segredo por partner, ou assinar `partner_id` no HMAC, ou IP allowlist |
| TM/BP | High | Service role em todo o servidor | Documentar invariantes; considerar RPC `security definer` + políticas mínimas ou cliente com JWT do usuário onde couber |
| BP | Medium | Rate limit | Redis/edge KV em produção multi-instância |
| BP | Medium | Headers de segurança | Centralizar CSP / nosniff / frame-ancestors (Next config ou proxy) |
| BP | Low | Logging | Auditar `console.log` em rotas; redigir PII |

---

## Correção aplicada durante a varredura

- **Export ausente `requireWebhookSecret`:** implementado em `lib/webhook-auth.ts` com leitura do corpo bruto via `request.clone().text()` para compatibilidade com `WEBHOOK_REQUIRE_HMAC` e `await` nas rotas `lead`, `sql`, `sale`. `tsc --noEmit` volta a passar.

---

## Risco residual e rotina

- **Risco residual:** alto enquanto houver um único mantenedor e webhook global com escolha de `x-partner-id` apenas protegida por segredo compartilhado.  
- **Revalidação sugerida:** mensal ou após mudanças em `app/api/**` ou migrations; repetir `run_ownership_map.py` quando o histórico git crescer; revisar versão do Next contra advisories.

---

## Próximos passos opcionais

1. Adicionar `CODEOWNERS` apontando para o time real.  
2. Habilitar `WEBHOOK_REQUIRE_HMAC=true` em produção após alinhar OctaDesk/outbound.  
3. Rodar `pnpm build` e testes manuais de webhooks após deploy.
