export type PartnerForOnboarding = {
  id: string;
  name: string;
  slug?: string | null;
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isPlaceholderPartner(partner: PartnerForOnboarding): boolean {
  const slug = (partner.slug ?? "").trim().toLowerCase();
  if (slug === "default") return true;

  const name = normalize(partner.name ?? "");
  return name === "parceiro padrao" || name === "default";
}

export function hasOnlyPlaceholderPartners(partners: PartnerForOnboarding[]): boolean {
  return partners.length > 0 && partners.every(isPlaceholderPartner);
}

export function shouldRequireOnboarding(
  isGlobalAdmin: boolean,
  partners: PartnerForOnboarding[]
): boolean {
  if (isGlobalAdmin) return false;
  return partners.length === 0 || hasOnlyPlaceholderPartners(partners);
}
