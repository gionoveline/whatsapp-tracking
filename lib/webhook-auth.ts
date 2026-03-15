import { NextRequest } from "next/server";

export function requireWebhookSecret(request: NextRequest): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true; // em dev pode não estar definido
  const header = request.headers.get("x-webhook-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}
