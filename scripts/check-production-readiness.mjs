const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "PAYMONGO_SECRET_KEY",
  "PAYMONGO_WEBHOOK_SECRET",
  "CRON_SECRET",
  "QUEUEDROP_SUPPORT_EMAIL",
  "RESEND_API_KEY",
  "SEMAPHORE_API_KEY",
];

const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
const problems = [];
const site = String(process.env.NEXT_PUBLIC_SITE_URL ?? "");
if (site && !site.startsWith("https://")) problems.push("NEXT_PUBLIC_SITE_URL must use https:// in production.");
if (site && /localhost|127\.0\.0\.1|queuedrop-test|(?:^|\.)test\./i.test(site)) problems.push("NEXT_PUBLIC_SITE_URL appears to be a local/test URL.");
const supabase = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
if (supabase && !/^https:\/\/.+\.supabase\.co\/?$/i.test(supabase)) problems.push("NEXT_PUBLIC_SUPABASE_URL does not look like a hosted Supabase project URL.");
const paymongo = String(process.env.PAYMONGO_SECRET_KEY ?? "");
if (paymongo && /^sk_test_/i.test(paymongo)) problems.push("PAYMONGO_SECRET_KEY is still a TEST key.");
if (paymongo && !/^sk_live_/i.test(paymongo)) problems.push("PAYMONGO_SECRET_KEY is not a PayMongo LIVE secret key.");
if (String(process.env.SMS_DRY_RUN ?? "").toLowerCase() === "true") problems.push("SMS_DRY_RUN is true; real SMS delivery is disabled.");
if (String(process.env.SMS_PROVIDER ?? "semaphore").toLowerCase() !== "semaphore") problems.push("SMS_PROVIDER must be semaphore for production.");
const supportEmail = String(process.env.QUEUEDROP_SUPPORT_EMAIL ?? "");
if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) problems.push("QUEUEDROP_SUPPORT_EMAIL is not a valid email address.");

if (missing.length || problems.length) {
  console.error("QueueDrop production readiness check FAILED.");
  if (missing.length) console.error(`Missing required environment variables: ${missing.join(", ")}`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("QueueDrop production environment checks passed.");
