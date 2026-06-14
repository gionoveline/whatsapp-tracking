import { NextRequest } from "next/server";
import { handleGoogleLpGoRedirect } from "@/lib/google-lp-go-redirect";

/**
 * GET /go?partner_id=UUID&emr_id=ID00111
 * Redirect Google LP / landing → WhatsApp com protocolo GLP.
 */
export async function GET(request: NextRequest) {
  return handleGoogleLpGoRedirect(request, "/go");
}
