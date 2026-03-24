export const ALLOWED_EMAIL_DOMAIN = "eumedicoresidente.com.br";
export const GLOBAL_ADMIN_EMAIL = "gnoveline@gmail.com";

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return normalized === GLOBAL_ADMIN_EMAIL || normalized.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}
