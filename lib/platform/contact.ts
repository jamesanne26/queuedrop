/** Only a phone number explicitly configured for public display is accepted. */
export function normalizePlatformContact(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  if (!/^[+\d ()-]+$/.test(input)) throw new Error("Enter a phone number, for example +639171234567.");
  const compact = input.replace(/[ ()-]/g, "");
  const normalized = /^09\d{9}$/.test(compact) ? "+63" + compact.slice(1) : compact;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("Use an international number, for example +639171234567, or a Philippine mobile number.");
  return normalized;
}
