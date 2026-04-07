export const PARTNER_MEMBER_ROLES = ["owner", "admin", "member"] as const;
export type PartnerMemberRole = (typeof PARTNER_MEMBER_ROLES)[number];

export function isValidPartnerMemberRole(role: string): role is PartnerMemberRole {
  return (PARTNER_MEMBER_ROLES as readonly string[]).includes(role);
}

export function partnerMemberRoleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "Proprietário";
    case "admin":
      return "Administrador";
    case "member":
      return "Membro";
    default:
      return role;
  }
}
