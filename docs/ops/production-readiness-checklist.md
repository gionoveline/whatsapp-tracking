# Production Readiness Checklist

Scope: WhatsApp Tracking (Next.js + Supabase multi-tenant)

## 1) Pre-Deploy Security

- [ ] All migrations applied in target environment (`009` to latest).
- [ ] RLS + FORCE RLS enabled on tenant-critical tables.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set only in server environment, never exposed to client.
- [ ] `NEXT_PUBLIC_SUPABASE_*` values point to correct production project.
- [ ] Allowed login domain policy reviewed (`auth-constants`).
- [ ] Webhook token configured per active partner before enabling integrations.
- [ ] Domain auto-link setting reviewed for each partner (`auto_link_by_domain`).

## 2) Functional Multi-Tenant Validation

- [ ] Run SQL smoke tests: `docs/testing/multi-tenant-smoke-tests.sql`.
- [ ] Super Admin can switch partners and data refreshes correctly.
- [ ] Non-admin user only sees assigned partner(s).
- [ ] New domain user auto-links only when partner has domain auto-link enabled.
- [ ] First access onboarding flow works end-to-end.

## 3) Performance & Reliability

- [ ] `pnpm build` succeeds on CI.
- [ ] Route latency sampled for:
  - [ ] `/api/funnel`
  - [ ] `/api/export`
  - [ ] `/api/onboarding/company`
- [ ] Webhook payload contract validated in staging:
  - [ ] `lead` sends `createdAt` (ISO 8601)
  - [ ] `sql` sends `occurred_at` + (`conversation_id` or `phone`)
  - [ ] `sale` sends `occurred_at` + (`conversation_id` or `phone`)
- [ ] Onboarding latency tracked before/after RPC migration.
- [ ] Large export behavior validated (timeouts/memory) with realistic dataset.

## 4) Monitoring (Minimum Viable)

- [ ] Centralized server logs (route, status, latency, partner_id when available).
- [ ] Error tracking for API routes (5xx aggregation + alerting).
- [ ] Authentication failures tracked (401 spikes).
- [ ] Rate-limit events tracked (429 trends).
- [ ] Webhook failures tracked by endpoint and partner_id.

## 5) Alerting Baselines

- [ ] Alert when API 5xx > 2% over 5 minutes.
- [ ] Alert when webhook 401/429 spikes over baseline.
- [ ] Alert when onboarding company creation fails repeatedly.
- [ ] Alert when DB connection/timeout errors exceed threshold.

## 6) Deployment Runbook (pnpm)

1. Pull latest branch.
2. `pnpm install`
3. `pnpm lint`
4. `pnpm build`
5. Apply DB migrations (Supabase):
   - `npx supabase link --project-ref <PROJECT_REF>`
   - `npx supabase db push`
6. Smoke test critical routes and login/onboarding flow.
7. Deploy application.
8. Run post-deploy checks:
   - homepage/login/dashboard/configuracoes loading,
   - partner switch refresh behavior,
   - webhook token configured and test webhooks accepted for `lead/sql/sale` with timestamp.

## 7) Rollback Strategy

- App rollback: redeploy previous stable image/build.
- DB rollback: forward-fix migration preferred; avoid destructive rollback in prod.
- If tenant-impacting issue detected:
  - disable onboarding route temporarily,
  - force read-only ops if needed,
  - communicate partner impact scope by `partner_id`.
