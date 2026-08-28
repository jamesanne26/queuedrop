import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function validSignature(raw: string, header: string | null, secret: string | undefined) {
  if (!secret || !header) return false;
  const parts: Record<string, string> = {};
  for (const segment of header.split(",")) {
    const separator = segment.indexOf("=");
    if (separator < 1) continue;
    parts[segment.slice(0, separator).trim()] = segment.slice(separator + 1).trim();
  }
  const timestamp = parts.t;
  const signature = parts.li || parts.te;
  if (!timestamp || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("paymongo-signature"), process.env.PAYMONGO_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(raw);
  const type = event?.data?.attributes?.type;
  const resource = event?.data?.attributes?.data;
  const attrs = resource?.attributes ?? {};
  if (type !== "payment.paid") return NextResponse.json({ received: true });

  const reference = attrs.external_reference_number ?? attrs.reference_number ?? attrs.metadata?.reference_number;
  if (!reference) return NextResponse.json({ received: true });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("subscription_orders")
    .select("id,business_id,plan_id,amount,currency")
    .eq("id", reference)
    .maybeSingle();
  if (!order) return NextResponse.json({ received: true });

  await admin.from("payments").upsert({
    business_id: order.business_id,
    subscription_order_id: order.id,
    provider: "paymongo",
    provider_payment_id: resource.id,
    provider_reference: reference,
    amount: attrs.amount !== undefined ? Number(attrs.amount) / 100 : Number(order.amount),
    currency: attrs.currency ?? order.currency,
    payment_method: attrs.source?.type ?? attrs.payment_method_used ?? "online",
    status: "paid",
    paid_at: attrs.paid_at ? new Date(attrs.paid_at * 1000).toISOString() : new Date().toISOString(),
    metadata: attrs,
  }, { onConflict: "provider_payment_id" });

  await admin.from("subscription_orders").update({ status: "paid", updated_at: new Date().toISOString() }).eq("id", order.id);

  const { data: existing } = await admin.from("business_subscriptions").select("plan_id").eq("business_id", order.business_id).maybeSingle();
  const changingPlan = Boolean(existing && existing.plan_id !== order.plan_id);
  const now = new Date();
  const expiry = new Date(now);
  expiry.setMonth(expiry.getMonth() + 1);
  const subscriptionPayload: Record<string, unknown> = {
    business_id: order.business_id,
    plan_id: order.plan_id,
    status: "active",
    started_at: now.toISOString(),
    expires_at: expiry.toISOString(),
    billing_price_monthly: Number(order.amount),
    billing_currency: order.currency,
    updated_at: now.toISOString(),
  };
  if (changingPlan) {
    subscriptionPayload.custom_monthly_price = null;
    subscriptionPayload.custom_max_branches = null;
    subscriptionPayload.custom_max_active_queues_per_branch = null;
    subscriptionPayload.custom_max_services_per_branch = null;
    subscriptionPayload.custom_trial_days = null;
    subscriptionPayload.override_reason = null;
    subscriptionPayload.override_expires_at = null;
  }
  await admin.from("business_subscriptions").upsert(subscriptionPayload, { onConflict: "business_id" });

  return NextResponse.json({ received: true });
}
