export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeEmail(value: unknown): string | undefined {
  const email = String(value ?? "").trim().toLowerCase();
  return email && email.includes("@") ? email : undefined;
}

export function normalizePhone(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  let digits = raw.replace(/\D/g, "");
  const hasExplicitInternationalPrefix = raw.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (hasExplicitInternationalPrefix) {
    if (digits.startsWith("55") && (digits.length < 12 || digits.length > 13)) return undefined;
    if (digits.length < 8 || digits.length > 15) return undefined;
    return `+${digits}`;
  }

  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return `+${digits}`;
  return undefined;
}

export function phoneDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}
