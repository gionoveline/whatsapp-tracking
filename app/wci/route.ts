import { NextRequest } from "next/server";
import { handleGoogleLpGoRedirect } from "@/lib/google-lp-go-redirect";

/**
 * GET /wci?partner_id=UUID&emr_id=ID00111
 * WCI — extensões de mensagem / Click to WhatsApp no Google Ads (sem landing).
 * Equivalente ao redirect layer do projeto open source google/wci.
 */
export async function GET(request: NextRequest) {
  return handleGoogleLpGoRedirect(request, "/wci");
}
