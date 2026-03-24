# API Endpoint Security Audit

Scope: `app/api/**/route.ts`  
Date: 2026-03-23  
Reviewer: GPT-5.3 Codex

## Critical Findings

- No critical vulnerabilities identified in the current tenant boundary path.
- Tenant isolation has defense-in-depth now:
  - request-level partner validation (`resolvePartnerFromRequest` / webhook partner validation),
  - `partner_id` filters in data operations,
  - RLS + FORCE RLS at DB layer.

## High/Medium Findings

- **High - Service-role overuse risk (design-level)**  
  Several internal routes still use service-role Supabase client. Even with explicit partner checks, this increases blast radius if a route regresses.  
  **Recommendation:** Prefer user-token scoped client for tenant-bound read/write operations unless admin-only behavior is required.

- **Medium - No explicit CSRF strategy for cookie-backed app routes**  
  Auth relies on bearer token from client session + cookie middleware, but no explicit CSRF token strategy is documented for mutating browser-origin calls.  
  **Recommendation:** Add same-site policy review + explicit CSRF posture docs. For sensitive state changes, require bearer header and reject missing auth header (already mostly done).

- **Medium - Secret/token values stored plaintext in `app_settings`**  
  `meta_access_token` and `webhook_secret` are stored as raw values.  
  **Recommendation:** Move to encrypted-at-rest pattern (KMS envelope or pgcrypto), add rotation policy and masked admin views.

## Endpoint-by-Endpoint Notes

- `GET /api/auth/session`
  - Good: requires authenticated user, returns scoped partners.
  - Good: user profile includes `is_global_admin`.

- `GET /api/funnel`
  - Good: auth + partner validation + rate limit.
  - Good: strict date format validation.

- `GET /api/export`
  - Good: auth + partner validation + rate limit.
  - Good: format whitelist (`csv|tsv`), date validation.
  - Risk: large exports may impact memory (single in-memory payload).

- `GET/POST /api/settings/meta-token`
  - Good: partner-scoped key access.
  - Risk: token stored plaintext in DB.

- `GET/POST /api/settings/webhook-secret`
  - Good: partner-scoped and does not expose secret in GET.
  - Risk: secret stored plaintext in DB.

- `GET/POST /api/settings/meta-conversions`
  - Good: partner-scoped config handling.
  - Note: write path uses multiple upserts; acceptable but could be wrapped transactionally for consistency.

- `POST /api/onboarding/company`
  - Good: authenticated-only, rate-limited.
  - Good: domain auto-link uniqueness conflict handled.
  - Good: moved to DB RPC for atomic creation and membership binding.

- `POST /api/webhooks/*`
  - Good: require `x-partner-id`.
  - Good: rate-limited by partner+IP.
  - Good: shared secret verification (`requireWebhookSecretForPartner`).
  - Good: updates are partner-scoped (`eq("partner_id", ...)`).

## Required Tests Before Production

- Unauthorized requests for all protected routes return 401.
- Cross-tenant access attempts return 400/401/403 (never data).
- Webhooks reject invalid/missing secret and invalid `x-partner-id`.
- Super Admin can switch tenant context safely without data bleed.

## Suggested Next Security Iterations

1. Encrypt sensitive app settings (`meta_access_token`, `webhook_secret`) at rest.
2. Add structured security logs (event type, partner_id, actor_id, endpoint, status).
3. Add periodic automated SQL smoke tests for RLS/tenant invariants in CI/CD gate.
