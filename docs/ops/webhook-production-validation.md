# Webhook Production Validation

Use this checklist after deploy to validate webhook integration per tenant.

## 1) Pre-check

- [ ] Partner selected in app header.
- [ ] `x-partner-id` copied from `Configurações > Webhooks`.
- [ ] Webhook token configured in `Configurações > Webhooks`.
- [ ] Integrator configured to send `x-partner-id` + `x-webhook-secret`.

## 2) Payload contract

- [ ] `lead` sends `createdAt` in ISO 8601 and required referral fields.
- [ ] `sql` sends `occurred_at` in ISO 8601 and one key: `conversation_id` or `phone`.
- [ ] `sale` sends `occurred_at` in ISO 8601 and one key: `conversation_id` or `phone`.

## 3) Smoke tests

- [ ] POST test to `/api/webhooks/lead` returns `200`.
- [ ] POST test to `/api/webhooks/sql` (by `conversation_id`) returns `200`.
- [ ] POST test to `/api/webhooks/sql` (by `phone`) returns `200`.
- [ ] POST test to `/api/webhooks/sale` (by `conversation_id`) returns `200`.
- [ ] POST test to `/api/webhooks/sale` (by `phone`) returns `200`.

## 4) Negative tests

- [ ] Missing token returns `401`.
- [ ] Missing `x-partner-id` returns `400`.
- [ ] Missing required datetime (`createdAt`/`occurred_at`) returns `400`.
- [ ] Invalid datetime format returns `400`.

## 5) Functional verification

- [ ] Dashboard receives lead in expected day bucket.
- [ ] SQL/Venda status transitions are reflected for the same lead.
- [ ] Export (`/api/export`) contains expected status and timestamps.
- [ ] Multi-tenant isolation verified (event with partner A does not affect partner B).
