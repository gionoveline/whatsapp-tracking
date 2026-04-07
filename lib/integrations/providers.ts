export type DeskProviderId = "octadesk";

export type ProviderFieldType = "text" | "password";

export type ProviderFieldDefinition = {
  key: "baseUrl" | "apiToken";
  label: string;
  placeholder: string;
  required: boolean;
  type: ProviderFieldType;
  secret?: boolean;
};

export type DeskProviderDefinition = {
  id: DeskProviderId;
  label: string;
  description: string;
  fields: ProviderFieldDefinition[];
};

export const DESK_PROVIDER_ACTIVE_KEY = "desk.provider.active";

export const DESK_PROVIDER_DEFINITIONS: Record<DeskProviderId, DeskProviderDefinition> = {
  octadesk: {
    id: "octadesk",
    label: "Octadesk",
    description:
      "Credenciais da API Octadesk para sync automatico (GET /chat) e testes. Webhooks em Configuracoes > Webhooks sao opcionais.",
    fields: [
      {
        key: "baseUrl",
        label: "Base URL da API",
        placeholder: "https://sua-instancia.api002.octadesk.services",
        required: true,
        type: "text",
      },
      {
        key: "apiToken",
        label: "API token",
        placeholder: "Cole o token da API",
        required: true,
        type: "password",
        secret: true,
      },
    ],
  },
};

export const DESK_PROVIDER_OPTIONS = Object.values(DESK_PROVIDER_DEFINITIONS).map((provider) => ({
  id: provider.id,
  label: provider.label,
}));

export function isDeskProviderId(value: string): value is DeskProviderId {
  return value in DESK_PROVIDER_DEFINITIONS;
}

export function getDeskProviderCredentialKeys(providerId: DeskProviderId) {
  return {
    baseUrl: `desk.provider.${providerId}.baseUrl`,
    apiToken: `desk.provider.${providerId}.apiToken`,
  };
}
