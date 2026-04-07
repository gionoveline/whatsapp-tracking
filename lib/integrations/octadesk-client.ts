export type OctadeskConnectionResult = {
  ok: boolean;
  status: number | null;
  message: string;
};

export function normalizeOctadeskBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export async function testOctadeskConnection(input: {
  baseUrl: string;
  apiToken: string;
}): Promise<OctadeskConnectionResult> {
  const baseUrl = normalizeOctadeskBaseUrl(input.baseUrl);
  const apiToken = input.apiToken.trim();
  if (!baseUrl || !apiToken) {
    return {
      ok: false,
      status: null,
      message: "Base URL e token sao obrigatorios.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    // A tela "Conversas" do Octadesk vem da API /chat. /tickets e outro modulo e pode retornar [] mesmo com muitas conversas.
    const response = await fetch(`${baseUrl}/chat?page=1&limit=1`, {
      method: "GET",
      headers: {
        "X-API-KEY": apiToken,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.ok) {
      return { ok: true, status: response.status, message: "Conexao validada (GET /chat)." };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: response.status, message: "Token invalido ou sem permissao." };
    }
    if (response.status === 404) {
      return { ok: false, status: response.status, message: "Endpoint nao encontrado para esta Base URL." };
    }
    if (response.status === 429) {
      return { ok: false, status: response.status, message: "Limite de requisicoes atingido no provider." };
    }
    return {
      ok: false,
      status: response.status,
      message: "Falha ao validar conexao com o provider.",
    };
  } catch (error) {
    const timeoutError = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      status: null,
      message: timeoutError ? "Timeout na conexao com o provider." : "Erro de rede ao acessar o provider.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
