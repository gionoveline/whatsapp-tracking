# Security best practices report — WhatsApp Tracking

**Stack:** Next.js (App Router), React 19, Supabase JS, TypeScript.  
**Referência:** `.cursor/skills/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md` (+ visão geral de frontend onde aplicável).

## Executive summary

O projeto segue boa parte do modelo **auth no servidor** para rotas autenticadas e usa **segredo de webhook** com comparação em tempo constante. Os principais gaps vs. o spec Next.js são: **webhook sem schema estrito**, **cliente Supabase com service role** (RLS não protege o servidor), **rate limit apenas em memória**, e **ausência visível de CSP / headers globais** no app. Durante esta auditoria foi corrigido um bug que impedia compilar e impedia HMAC sobre bytes reais do corpo (**BP-RESOLVED-001**).

---

## Critical findings

*Nenhum finding crítico aberto após BP-RESOLVED-001; riscos arquiteturais permanecem em High (ver seção High).*

### BP-RESOLVED-001 — Export inexistente e corpo do webhook

- **Severity:** Critical (build + HMAC)  
- **Location:** `lib/webhook-auth.ts` (export ausente); chamadas em `app/api/webhooks/lead/route.ts`, `sql/route.ts`, `sale/route.ts` (linhas de import e `if (!requireWebhookSecret` → corrigido).  
- **Evidence:** `pnpm exec tsc --noEmit` falhava com `has no exported member named 'requireWebhookSecret'`.  
- **Impact:** projeto não tipava; com `WEBHOOK_REQUIRE_HMAC=true`, qualquer verificação precisa do corpo bruto **antes** de re-serializar JSON.  
- **Fix aplicada:** `requireWebhookSecret` assíncrono lê `await request.clone().text()` e delega a `requireWebhookAuth(request, rawBody)`; rotas usam `await requireWebhookSecret(request)`.  
- **Rule:** NEXT-WEBHOOK-001 / NEXT-INPUT-001 (parcial).

---

## High findings

### BP-002 — Service role (bypass de RLS) no backend

- **Severity:** High  
- **Location:** `lib/supabase.ts` linhas 3–6  
- **Evidence:**

```3:6:lib/supabase.ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, serviceKey);
```

- **Impact:** qualquer bug de autorização na camada Next vira risco de acesso cross-tenant ou vazamento em massa.  
- **Mitigation:** documentar invariantes; usar JWT do usuário + RLS onde possível; RPC com `security definer` e checagens explícitas.  
- **Rule:** NEXT-AUTH-001 (defense in depth), NEXT-SECRETS-002.

### BP-003 — `x-partner-id` em webhooks só valida existência do partner

- **Severity:** High  
- **Location:** `lib/server-auth.ts` `resolveWebhookPartner` (aprox. linhas 94–99)  
- **Evidence:** qualquer cliente com `WEBHOOK_SECRET` válido pode enviar UUID de outro partner se conhecer o id.  
- **Mitigation:** segredo por partner, HMAC que inclua `partner_id`, ou allowlist de IP da origem.  
- **Rule:** NEXT-WEBHOOK-001 (autenticidade da origem por tenant).

---

## Medium findings

### BP-004 — Rate limiting in-process

- **Severity:** Medium  
- **Location:** `lib/request-security.ts` — `Map` em memória.  
- **Impact:** multi-instância ou cold start reinicia contadores; abuso distribuído.  
- **Mitigation:** Redis / KV na edge; limites no proxy.  
- **Rule:** NEXT-DOS-001.

### BP-005 — Payload JSON sem validação por schema

- **Severity:** Medium  
- **Location:** Webhooks após `request.json()` — ex. `app/api/webhooks/sql/route.ts`.  
- **Impact:** campos inesperados, tipos ambíguos, superfície para bugs lógicos.  
- **Mitigation:** zod/valibot nos bodies.  
- **Rule:** NEXT-INPUT-001.

### BP-006 — Mensagens de erro do Supabase ao cliente

- **Severity:** Medium  
- **Location:** Várias rotas retornam `error.message` (ex. `app/api/export/route.ts` linhas 55–57).  
- **Impact:** vazamento de detalhes internos úteis para atacante.  
- **Mitigation:** log server-side; cliente recebe código genérico.  
- **Rule:** NEXT-ERROR-001.

### BP-007 — Headers de segurança não centralizados no código revisado

- **Severity:** Medium  
- **Location:** sem `middleware.ts` com CSP; conferir `next.config.ts` e hospedagem.  
- **Mitigation:** CSP com nonce, `nosniff`, `frame-ancestors` na edge.  
- **Rule:** NEXT-HEADERS-001, NEXT-CSP-001.

---

## Low findings

### BP-008 — Lista de e-mails permitidos hardcoded

- **Severity:** Low (operacional)  
- **Location:** `lib/auth-constants.ts`  
- **Impact:** mudanças de política exigem deploy.  
- **Mitigation:** tabela `allowed_domains` ou config no Supabase.

### BP-009 — Versão do Next

- **Severity:** Low (confirmado OK no lockfile)  
- **Evidence:** `pnpm-lock.yaml` resolve `next` para **15.5.12**, acima dos pisos citados para advisories recentes no doc do skill.  
- **Mitigation:** manter `pnpm outdated` / dependabot.

---

## Frontend (resumo)

- Revisar `"use client"` + imports de `process.env` (regra NEXT-SECRETS-002).  
- Evitar `dangerouslySetInnerHTML` com conteúdo não confiável (NEXT-XSS-001) — não destacado em grep rápido nesta rodada.

---

## Prioritized remediation order

1. Manter `WEBHOOK_SECRET` forte e considerar `WEBHOOK_REQUIRE_HMAC=true` em produção.  
2. Endurecer modelo de confiança webhook ↔ tenant (BP-003).  
3. Reduzir superfície do service role onde for viável (BP-002).  
4. Rate limit distribuído (BP-004).  
5. Schema validation + erros genéricos (BP-005, BP-006).  
6. Headers (BP-007).

---

*Relatório gerado como parte da varredura com os três skills de segurança; correção BP-RESOLVED-001 já aplicada no código.*
