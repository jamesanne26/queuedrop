export type SmsCountry = {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
};

export const SMS_COUNTRIES: readonly SmsCountry[] = [
  { code: "PH", name: "Philippines", dialCode: "63", flag: "🇵🇭" },
  { code: "SG", name: "Singapore", dialCode: "65", flag: "🇸🇬" },
  { code: "MY", name: "Malaysia", dialCode: "60", flag: "🇲🇾" },
  { code: "HK", name: "Hong Kong", dialCode: "852", flag: "🇭🇰" },
  { code: "JP", name: "Japan", dialCode: "81", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", dialCode: "82", flag: "🇰🇷" },
  { code: "AU", name: "Australia", dialCode: "61", flag: "🇦🇺" },
  { code: "GB", name: "United Kingdom", dialCode: "44", flag: "🇬🇧" },
  { code: "US", name: "United States / Canada", dialCode: "1", flag: "🇺🇸" },
  { code: "AE", name: "United Arab Emirates", dialCode: "971", flag: "🇦🇪" },
] as const;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeSmsRecipient(recipient: string, selectedDialCode?: string) {
  const raw = recipient.trim();
  let digits = digitsOnly(raw);
  if (!digits) return "";

  if (digits.startsWith("00")) digits = digits.slice(2);

  // An explicit + or 00 prefix means the user already supplied an
  // international number, so do not prepend the selected country code.
  if (raw.startsWith("+") || raw.replace(/^\s+/, "").startsWith("00")) {
    return digits;
  }

  const dialCode = digitsOnly(selectedDialCode ?? "63") || "63";

  // Preserve an already international number for the selected country.
  if (digits.startsWith(dialCode)) return digits;

  // Philippine mobile shorthand is common throughout QueueDrop.
  if (dialCode === "63" && /^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (dialCode === "63" && /^9\d{9}$/.test(digits)) return `63${digits}`;

  // For other countries, strip one domestic trunk zero before prepending the
  // selected country code. This stores a provider-friendly E.164-style digit
  // string without a leading +, matching QueueDrop's existing database format.
  if (digits.startsWith("0") && digits.length > 1) digits = digits.slice(1);
  return `${dialCode}${digits}`;
}

export function isValidSmsRecipient(recipient: string) {
  const digits = digitsOnly(recipient);
  return digits.length >= 8 && digits.length <= 15 && !/^0/.test(digits);
}

export function smsCountryFromRecipient(recipient: string) {
  const digits = digitsOnly(recipient);
  const match = [...SMS_COUNTRIES]
    .sort((a, b) => b.dialCode.length - a.dialCode.length)
    .find((country) => digits.startsWith(country.dialCode));
  return match?.code ?? "PH";
}

export function splitSmsRecipient(recipient: string | null | undefined) {
  const digits = digitsOnly(recipient ?? "");
  const country = [...SMS_COUNTRIES]
    .sort((a, b) => b.dialCode.length - a.dialCode.length)
    .find((item) => digits.startsWith(item.dialCode)) ?? SMS_COUNTRIES[0];
  const local = digits.startsWith(country.dialCode) ? digits.slice(country.dialCode.length) : digits;
  return { country, local };
}

export function maskSmsRecipient(recipient: string | null | undefined) {
  const digits = digitsOnly(recipient ?? "");
  if (!digits) return "—";
  if (digits.length <= 4) return "•".repeat(digits.length);
  return `${digits.slice(0, Math.min(3, digits.length - 4))}${"•".repeat(Math.max(2, digits.length - 7))}${digits.slice(-4)}`;
}
