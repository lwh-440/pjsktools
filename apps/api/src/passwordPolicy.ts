const weakPasswords = new Set([
  "password",
  "password123",
  "qwerty123",
  "12345678",
  "123456789",
  "11111111",
  "00000000",
  "abc123456"
]);

export function validatePasswordStrength(password: string, email?: string) {
  const reasons: string[] = [];
  const lower = password.toLowerCase();
  const emailPrefix = email?.split("@")[0]?.toLowerCase();

  if (password.length < 10) reasons.push("password must be at least 10 characters");
  if (weakPasswords.has(lower)) reasons.push("password is too common");
  if (emailPrefix && emailPrefix.length >= 4 && lower.includes(emailPrefix)) reasons.push("password must not contain the email prefix");

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const categoryCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  if (password.length >= 14) {
    if (categoryCount < 3) reasons.push("passwords with 14 or more characters must include at least 3 character classes");
  } else if (!hasLower || !hasUpper || !hasDigit || !hasSymbol) {
    reasons.push("password must include uppercase letters, lowercase letters, digits, and symbols");
  }

  return { ok: reasons.length === 0, reasons };
}
