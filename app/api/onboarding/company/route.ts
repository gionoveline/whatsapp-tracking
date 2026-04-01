import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { supabase } from "@/lib/supabase";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";

type RpcErrorShape = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

/** PostgREST may put the Postgres message in `details`; match domain conflict broadly. */
function isDomainAlreadyLinkedError(error: RpcErrorShape): boolean {
  if (error.code !== "23505") return false;
  const combined = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return (
    combined.includes("DOMAIN_ALREADY_LINKED") ||
    combined.includes("uq_partners_auto_domain") ||
    (combined.includes("duplicate key") && combined.includes("allowed_email_domain"))
  );
}

type OnboardingPartnerRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  auto_link_by_domain: boolean;
  allowed_email_domain: string | null;
};

/** PostgREST returns table RPCs as an array; guard a single-object shape just in case. */
function firstRpcRow(data: unknown): OnboardingPartnerRow | null {
  if (data == null) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row !== "object" || row === null || !("id" in row)) return null;
  return row as OnboardingPartnerRow;
}

/**
 * Maps known Supabase/PostgREST failures so production is actionable instead of a generic 500.
 * PGRST202: function missing from schema cache or signature mismatch (migrations not applied).
 */
function mapOnboardingInfrastructureError(error: RpcErrorShape): { status: number; message: string } | null {
  const combined = [error.message, error.details, error.hint].filter(Boolean).join(" | ");
  const lower = combined.toLowerCase();

  if (error.code === "PGRST202" || lower.includes("could not find the function")) {
    return {
      status: 503,
      message:
        "Servidor de dados desatualizado: aplique as migrations do Supabase (funcao create_company_onboarding).",
    };
  }

  if (error.code === "42883" || (lower.includes("function") && lower.includes("does not exist"))) {
    return {
      status: 503,
      message:
        "Servidor de dados desatualizado: aplique as migrations do Supabase (funcao create_company_onboarding).",
    };
  }

  if (lower.includes("permission denied for function") || lower.includes("permission denied for routine")) {
    return {
      status: 503,
      message:
        "Configuracao do servidor: defina SUPABASE_SERVICE_ROLE_KEY no ambiente e garanta GRANT EXECUTE na funcao de onboarding.",
    };
  }

  return null;
}

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
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    logApiError("onboarding:create-company", new Error("SUPABASE_SERVICE_ROLE_KEY is not set"));
    return NextResponse.json(
      {
        error:
          "Configuracao do servidor: defina a variavel SUPABASE_SERVICE_ROLE_KEY no ambiente de producao (nao use apenas a anon key).",
      },
      { status: 503 }
    );
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
      if (isDomainAlreadyLinkedError(error)) {
        return NextResponse.json(
          { error: "Este dominio ja esta vinculado automaticamente a outra empresa." },
          { status: 409 }
        );
      }
      const infra = mapOnboardingInfrastructureError(error);
      if (infra) {
        return NextResponse.json({ error: infra.message }, { status: infra.status });
      }
      throw error;
    }

    const partner = firstRpcRow(data);
    if (!partner?.id) {
      logApiError("onboarding:create-company:empty-rpc-data", { data });
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
