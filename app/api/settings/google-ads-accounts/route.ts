import { NextRequest, NextResponse } from "next/server";
import {
  clearDefaultGoogleAdsAccounts,
  importLegacyGoogleAdsAccountAsDefault,
  listGoogleAdsAccounts,
  normalizeGoogleAdsCustomerId,
  parseGoogleAdsConversionMapping,
  type GoogleAdsAccountRow,
} from "@/lib/google-ads-accounts";
import { getGoogleAdsConversionConfig, type GoogleAdsConversionMapping } from "@/lib/google-conversions";
import { getAuthenticatedUser, resolvePartnerFromRequest } from "@/lib/server-auth";
import { createSupabaseForUserAccessToken } from "@/lib/supabase-user";
import { GENERIC_SERVER_ERROR, logApiError } from "@/lib/api-errors";
import { getClientIp, isRateLimited } from "@/lib/request-security";

const MAX_ACCOUNTS_PER_PARTNER = 10;

function accountResponse(row: GoogleAdsAccountRow) {
  return {
    id: row.id,
    label: row.label,
    customer_id: row.customer_id,
    login_customer_id: row.login_customer_id ?? "",
    currency_code: row.currency_code,
    mapping: row.conversion_mapping,
    is_default: row.is_default,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * GET /api/settings/google-ads-accounts
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:google-ads-accounts:${user.id}:${ip}`, 30, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const accounts = await listGoogleAdsAccounts(partnerId, supabaseUser);
    const legacy = await getGoogleAdsConversionConfig(partnerId, supabaseUser);
    const legacyCustomerId = normalizeGoogleAdsCustomerId(legacy.customer_id);
    return NextResponse.json({
      accounts: accounts.map(accountResponse),
      legacy_available: accounts.length === 0 && Boolean(legacyCustomerId),
      legacy: legacyCustomerId
        ? {
            customer_id: legacyCustomerId,
            currency_code: legacy.currency_code,
            mapping: legacy.mapping,
          }
        : null,
    });
  } catch (error) {
    logApiError("google-ads-accounts:get", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }
}

type SaveAccountBody = {
  id?: string;
  label?: string;
  customer_id?: string;
  login_customer_id?: string;
  currency_code?: string;
  mapping?: GoogleAdsConversionMapping;
  is_default?: boolean;
  import_legacy?: boolean;
};

/**
 * POST /api/settings/google-ads-accounts
 * Body: conta nova/atualizada ou { import_legacy: true }
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const ip = getClientIp(request);
  const { limited } = isRateLimited(`settings:google-ads-accounts-post:${user.id}:${ip}`, 20, 10 * 60 * 1000);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: SaveAccountBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.import_legacy) {
    try {
      const account = await importLegacyGoogleAdsAccountAsDefault(partnerId, supabaseUser);
      if (!account) {
        return NextResponse.json(
          { error: "Configure a conta e conversões legadas antes de importar." },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, account: accountResponse(account) });
    } catch (error) {
      logApiError("google-ads-accounts:import-legacy", error);
      return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
    }
  }

  const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";
  const customerId = normalizeGoogleAdsCustomerId(body.customer_id);
  if (!label) {
    return NextResponse.json({ error: "Informe um nome para a conta." }, { status: 400 });
  }
  if (!customerId) {
    return NextResponse.json({ error: "ID da conta Google Ads inválido." }, { status: 400 });
  }

  const loginCustomerId = normalizeGoogleAdsCustomerId(body.login_customer_id);
  const currencyCode =
    typeof body.currency_code === "string" ? body.currency_code.trim().toUpperCase() || "BRL" : "BRL";
  const mapping = body.mapping ? parseGoogleAdsConversionMapping(body.mapping) : undefined;
  const isDefault = body.is_default === true;
  const accountId = typeof body.id === "string" ? body.id.trim() : "";

  try {
    if (!accountId) {
      const { count, error: countError } = await supabaseUser
        .from("google_ads_accounts")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId);
      if (countError) throw countError;
      if ((count ?? 0) >= MAX_ACCOUNTS_PER_PARTNER) {
        return NextResponse.json(
          { error: `No máximo ${MAX_ACCOUNTS_PER_PARTNER} contas Google Ads por empresa.` },
          { status: 400 }
        );
      }
    }

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      partner_id: partnerId,
      label,
      customer_id: customerId,
      login_customer_id: loginCustomerId,
      currency_code: currencyCode,
      is_default: isDefault,
      updated_at: now,
    };
    if (mapping) payload.conversion_mapping = mapping;

    if (isDefault) {
      await clearDefaultGoogleAdsAccounts(partnerId, accountId || null, supabaseUser);
    }

    if (accountId) {
      const { data, error } = await supabaseUser
        .from("google_ads_accounts")
        .update(payload)
        .eq("partner_id", partnerId)
        .eq("id", accountId)
        .select(
          "id, partner_id, label, customer_id, login_customer_id, currency_code, conversion_mapping, is_default, created_at, updated_at"
        )
        .maybeSingle();

      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

      const accounts = await listGoogleAdsAccounts(partnerId, supabaseUser);
      const saved = accounts.find((a) => a.id === accountId);
      return NextResponse.json({ ok: true, account: saved ? accountResponse(saved) : data });
    }

    const { data, error } = await supabaseUser
      .from("google_ads_accounts")
      .insert({
        ...payload,
        conversion_mapping: mapping ?? parseGoogleAdsConversionMapping(null),
      })
      .select(
        "id, partner_id, label, customer_id, login_customer_id, currency_code, conversion_mapping, is_default, created_at, updated_at"
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Já existe uma conta com este nome." }, { status: 409 });
      }
      throw error;
    }

    const accounts = await listGoogleAdsAccounts(partnerId, supabaseUser);
    const saved = accounts.find((a) => a.id === data.id);
    return NextResponse.json({ ok: true, account: saved ? accountResponse(saved) : data });
  } catch (error) {
    logApiError("google-ads-accounts:save", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }
}

/**
 * DELETE /api/settings/google-ads-accounts?id=
 */
export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerId = await resolvePartnerFromRequest(request, user);
  if (!partnerId) return NextResponse.json({ error: "partner_id is required" }, { status: 400 });

  const supabaseUser = createSupabaseForUserAccessToken(user.accessToken);
  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabaseUser
    .from("google_ads_accounts")
    .delete()
    .eq("partner_id", partnerId)
    .eq("id", id);

  if (error) {
    logApiError("google-ads-accounts:delete", error);
    return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
