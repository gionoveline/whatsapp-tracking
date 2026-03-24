import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { supabase } from "@/lib/supabase";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(request);
  const { limited } = isRateLimited(`onboarding:create-company:${user.id}:${ip}`, 10, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { companyName?: string; logoDataUrl?: string; autoLinkByDomain?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  if (!companyName || companyName.length < 2) {
    return NextResponse.json({ error: "companyName is required (min 2 chars)" }, { status: 400 });
  }
  if (companyName.length > 120) {
    return NextResponse.json({ error: "companyName is too long (max 120 chars)" }, { status: 400 });
  }
  const autoLinkByDomain = body.autoLinkByDomain === true;
  const logoDataUrl = typeof body.logoDataUrl === "string" ? body.logoDataUrl.trim() : "";
  if (logoDataUrl) {
    if (!logoDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "logoDataUrl must be a valid image data URL" }, { status: 400 });
    }
    if (logoDataUrl.length > 1_500_000) {
      return NextResponse.json({ error: "logoDataUrl is too large" }, { status: 400 });
    }
  }
  try {
    const { data, error } = await supabase.rpc("create_company_onboarding", {
      p_user_id: user.id,
      p_user_email: user.email,
      p_user_full_name: user.fullName,
      p_user_is_global_admin: user.isGlobalAdmin,
      p_company_name: companyName,
      p_logo_url: logoDataUrl || null,
      p_auto_link_by_domain: autoLinkByDomain,
    });
    if (error) {
      if (error.code === "23505" && String(error.message).includes("DOMAIN_ALREADY_LINKED")) {
        return NextResponse.json(
          { error: "Este dominio ja esta vinculado automaticamente a outra empresa." },
          { status: 409 }
        );
      }
      throw error;
    }

    const partner = Array.isArray(data) ? data[0] : null;
    if (!partner?.id) {
      throw new Error("Partner not created");
    }

    return NextResponse.json({
      ok: true,
      partner: {
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        logo_url: partner.logo_url,
        auto_link_by_domain: partner.auto_link_by_domain,
        allowed_email_domain: partner.allowed_email_domain,
      },
    });
  } catch (error) {
    logApiError("onboarding:create-company", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }
}
