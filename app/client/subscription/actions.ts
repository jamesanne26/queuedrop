"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function startSubscriptionCheckout(formData: FormData) {
  const planId = String(formData.get("plan_id") ?? "").trim();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/auth/login?next=%2Fclient%2Fsubscription");

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id,role")
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) redirect("/dashboard");

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from("plans")
    .select("id,name,description,price_monthly,currency,is_active,is_public,accepts_new_subscriptions")
    .eq("id", planId)
    .eq("is_active", true)
    .eq("accepts_new_subscriptions", true)
    .maybeSingle();
  if (!plan) redirect("/client/subscription?error=Plan%20not%20found%20or%20not%20available.");

  const { data: current } = await admin
    .from("business_subscriptions")
    .select("plan_id,billing_price_monthly,billing_currency,custom_monthly_price,override_expires_at")
    .eq("business_id", membership.business_id)
    .maybeSingle();

  const hasCurrentPlan = current !== null && current.plan_id === plan.id;
  const overrideActive = Boolean(
    hasCurrentPlan &&
    current.custom_monthly_price !== null &&
    current.custom_monthly_price !== undefined &&
    (!current.override_expires_at || new Date(current.override_expires_at) > new Date()),
  );
  const lockedPrice = hasCurrentPlan ? current.billing_price_monthly : null;
  const amount = Number(
    overrideActive && current ? current.custom_monthly_price : lockedPrice ?? plan.price_monthly,
  );
  const currency = hasCurrentPlan ? current.billing_currency ?? plan.currency : plan.currency;

  const { data: order, error: orderError } = await supabase
    .from("subscription_orders")
    .insert({
      business_id: membership.business_id,
      plan_id: plan.id,
      requested_by: auth.user.id,
      amount,
      currency,
      payment_mode: "online",
      provider: "paymongo",
      status: "pending",
    })
    .select("id")
    .single();
  if (orderError || !order) redirect(`/client/subscription?error=${encodeURIComponent(orderError?.message ?? "Unable to create checkout.")}`);

  const secret = process.env.PAYMONGO_SECRET_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!secret || !siteUrl) {
    redirect(`/client/subscription?error=${encodeURIComponent("Online payment is prepared but PAYMONGO_SECRET_KEY and NEXT_PUBLIC_SITE_URL must be configured first.")}`);
  }

  const response = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          billing: { name: auth.user.user_metadata?.full_name ?? auth.user.email ?? "QueueDrop Client", email: auth.user.email },
          cancel_url: `${siteUrl}/client/subscription?payment=cancelled`,
          success_url: `${siteUrl}/client/subscription?payment=success`,
          description: `QueueDrop ${plan.name} monthly subscription`,
          payment_method_types: ["card", "gcash"],
          line_items: [{ amount: Math.round(amount * 100), quantity: 1, name: `QueueDrop ${plan.name}`, description: plan.description ?? "Monthly QueueDrop subscription", currency }],
          reference_number: order.id,
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
        },
      },
    }),
    cache: "no-store",
  });

  const payload = await response.json();
  const checkout = payload?.data;
  const checkoutUrl = checkout?.attributes?.checkout_url;
  if (!response.ok || !checkout?.id || !checkoutUrl) {
    await admin.from("subscription_orders").update({ status: "failed" }).eq("id", order.id);
    const message = payload?.errors?.[0]?.detail ?? "Payment provider could not create a checkout session.";
    redirect(`/client/subscription?error=${encodeURIComponent(message)}`);
  }

  await admin
    .from("subscription_orders")
    .update({ provider_checkout_id: checkout.id, provider_checkout_url: checkoutUrl, status: "checkout_created", updated_at: new Date().toISOString() })
    .eq("id", order.id);
  redirect(checkoutUrl);
}
