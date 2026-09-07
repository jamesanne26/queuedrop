export function normalizeSmsRecipient(recipient: string) {
  const digits = recipient.replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `63${digits}`;
  if (/^639\d{9}$/.test(digits)) return digits;
  return digits;
}
