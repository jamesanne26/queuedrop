"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBillingInterval, parseRenewalMode } from "@/lib/billing/subscription";
import { calculateTax, type TaxMode, type TaxPriceMode } from "@/lib/billing/tax";

function payMongoHeaders(secret: string) {
  return {
    Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function payMongoJson(url: string, secret: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { ...payMongoHeaders(secret), ...(init.headers ?? {}) }, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.detail ?? payload?.errors?.[0]?.code ?? `PayMongo request failed (${response.status}).`;
    throw new Error(detail);
  }
  return payload;
}

function splitName(fullName: string | undefined, email: string | undefined) {
  const fallback = email?.split("@")[0] || "QueueDrop Client";
  const parts = String(fullName || fallback).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "QueueDrop",
    lastName: parts.slice(1).join(" ") || "Client",
  };
}

export async function startSubscriptionCheckout(formData: FormData) {
  const planId = String(formData.get("plan_id") ?? "").trim();
  const billingInterval = parseBillingInterval(formData.get("billing_interval"));
  const renewalMode = parseRenewalMode(formData.get("renewal_mode"));
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
    .select("id,name,description,price_monthly,price_yearly,currency,is_active,is_public,accepts_new_subscriptions,allow_auto_renew,tax_mode,vat_rate,tax_price_mode")
    .eq("id", planId)
    .eq("is_active", true)
    .eq("accepts_new_subscriptions", true)
    .maybeSingle();
  if (!plan) redirect("/client/subscription?error=Plan%20not%20found%20or%20not%20available.");
  if (billingInterval === "yearly" && (plan.price_yearly === null || Number(plan.price_yearly) <= 0)) {
    redirect("/client/subscription?error=Annual%20billing%20is%20not%20available%20for%20this%20plan.");
  }
  if (renewalMode === "auto" && !plan.allow_auto_renew) {
    redirect("/client/subscription?error=Auto-renew%20is%20not%20available%20for%20this%20plan.");
  }

  const { data: current } = await admin
    .from("business_subscriptions")
    .select("plan_id,billing_price_monthly,billing_price_yearly,billing_currency,custom_monthly_price,override_expires_at")
    .eq("business_id", membership.business_id)
    .maybeSingle();

  const hasCurrentPlan = current !== null && current.plan_id === plan.id;
  const overrideActive = Boolean(
    hasCurrentPlan &&
    current.custom_monthly_price !== null &&
    current.custom_monthly_price !== undefined &&
    (!current.override_expires_at || new Date(current.override_expires_at) > new Date()),
  );
  const amount = billingInterval === "yearly"
    ? Number(hasCurrentPlan ? current?.billing_price_yearly ?? plan.price_yearly : plan.price_yearly)
    : Number(overrideActive && current ? current.custom_monthly_price : (hasCurrentPlan ? current?.billing_price_monthly : null) ?? plan.price_monthly);
  const currency = hasCurrentPlan ? current?.billing_currency ?? plan.currency : plan.currency;
  const taxMode = (plan.tax_mode === "vat" ? "vat" : "non_vat") as TaxMode;
  const taxPriceMode = (plan.tax_price_mode === "exclusive" ? "exclusive" : "inclusive") as TaxPriceMode;
  const vatRate = taxMode === "vat" ? Number(plan.vat_rate ?? 0) : 0;
  const tax = calculateTax(amount, taxMode, vatRate, taxPriceMode);

  if (!Number.isFinite(amount) || amount <= 0) {
    redirect("/client/subscription?error=This%20billing%20option%20does%20not%20have%20a%20valid%20price.");
  }

  // The authenticated owner and server-calculated price above authorize this write.
  // Clients cannot insert arbitrary prices or payment states through the REST API.
  const { data: order, error: orderError } = await admin
    .from("subscription_orders")
    .insert({
      business_id: membership.business_id,
      plan_id: plan.id,
      requested_by: auth.user.id,
      amount: tax.total,
      subtotal: tax.subtotal,
      tax_mode: taxMode,
      vat_rate: vatRate,
      tax_amount: tax.taxAmount,
      tax_price_mode: taxPriceMode,
      currency,
      billing_interval: billingInterval,
      renewal_mode: renewalMode,
      payment_mode: renewalMode === "auto" ? "subscription" : "online",
      provider: "paymongo",
      status: "pending",
    })
    .select("id")
    .single();
  if (orderError || !order) redirect(`/client/subscription?error=${encodeURIComponent(orderError?.message ?? "Unable to create billing order.")}`);

  const secret = process.env.PAYMONGO_SECRET_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!secret || !siteUrl) {
    await admin.from("subscription_orders").update({ status: "failed" }).eq("id", order.id);
    redirect(`/client/subscription?error=${encodeURIComponent("PAYMONGO_SECRET_KEY and NEXT_PUBLIC_SITE_URL must be configured first.")}`);
  }

  if (renewalMode === "auto") {
    if (process.env.PAYMONGO_SUBSCRIPTIONS_ENABLED !== "true") {
      await admin.from("subscription_orders").update({ status: "failed" }).eq("id", order.id);
      redirect(`/client/subscription?error=${encodeURIComponent("Auto-renew is prepared in QueueDrop, but PayMongo Subscriptions must be enabled for this merchant account first.")}`);
    }
    if (!process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY) {
      await admin.from("subscription_orders").update({ status: "failed" }).eq("id", order.id);
      redirect(`/client/subscription?error=${encodeURIComponent("NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY is required for auto-renew card setup.")}`);
    }

    try {
      const planPayload = await payMongoJson("https://api.paymongo.com/v1/subscriptions/plans", secret, {
        method: "POST",
        body: JSON.stringify({
          data: {
            attributes: {
              type: "scheduled",
              name: `QueueDrop ${plan.name} ${billingInterval}`,
              description: plan.description ?? `QueueDrop ${plan.name} subscription`,
              amount: Math.round(tax.total * 100),
              currency,
              interval: billingInterval === "yearly" ? "yearly" : "monthly",
              interval_count: 1,
              metadata: { reference_number: order.id, business_id: membership.business_id },
            },
          },
        }),
      });
      const providerPlanId = String(planPayload?.data?.id ?? "");
      if (!providerPlanId) throw new Error("PayMongo did not return a subscription plan ID.");

      const { firstName, lastName } = splitName(auth.user.user_metadata?.full_name, auth.user.email ?? undefined);
      const customerPayload = await payMongoJson("https://api.paymongo.com/v1/customers", secret, {
        method: "POST",
        body: JSON.stringify({
          data: { attributes: { first_name: firstName, last_name: lastName, email: auth.user.email } },
        }),
      });
      const customerId = String(customerPayload?.data?.id ?? "");
      if (!customerId) throw new Error("PayMongo did not return a customer ID.");

      const subscriptionPayload = await payMongoJson("https://api.paymongo.com/v1/subscriptions", secret, {
        method: "POST",
        body: JSON.stringify({ data: { attributes: { plan_id: providerPlanId, customer_id: customerId } } }),
      });
      const providerSubscriptionId = String(subscriptionPayload?.data?.id ?? "");
      const paymentIntentId = String(subscriptionPayload?.data?.attributes?.latest_invoice?.payment_intent?.id ?? "");
      if (!providerSubscriptionId || !paymentIntentId) throw new Error("PayMongo did not return the first subscription payment intent.");

      const intentPayload = await payMongoJson(`https://api.paymongo.com/v1/payment_intents/${paymentIntentId}`, secret, { method: "GET" });
      const clientKey = String(intentPayload?.data?.attributes?.client_key ?? "");
      if (!clientKey) throw new Error("PayMongo did not return the payment intent client key.");

      const { error: updateError } = await admin.from("subscription_orders").update({
        provider_plan_id: providerPlanId,
        provider_customer_id: customerId,
        provider_subscription_id: providerSubscriptionId,
        provider_payment_intent_id: paymentIntentId,
        provider_payment_intent_client_key: clientKey,
        status: "checkout_created",
        updated_at: new Date().toISOString(),
      }).eq("id", order.id);
      if (updateError) throw updateError;

    } catch (error) {
      await admin.from("subscription_orders").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", order.id);
      redirect(`/client/subscription?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to start auto-renew subscription.")}`);
    }
    redirect(`/client/subscription/auto-renew/${order.id}`);
  }

  const response = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
    method: "POST",
    headers: payMongoHeaders(secret),
    body: JSON.stringify({
      data: {
        attributes: {
          billing: { name: auth.user.user_metadata?.full_name ?? auth.user.email ?? "QueueDrop Client", email: auth.user.email },
          cancel_url: `${siteUrl}/client/subscription?payment=cancelled`,
          success_url: `${siteUrl}/client/subscription?payment=success`,
          description: `QueueDrop ${plan.name} ${billingInterval} subscription`,
          payment_method_types: ["card", "gcash"],
          line_items: [{ amount: Math.round(tax.total * 100), quantity: 1, name: `QueueDrop ${plan.name}`, description: plan.description ?? `${billingInterval} QueueDrop subscription`, currency }],
          reference_number: order.id,
          metadata: { reference_number: order.id, business_id: membership.business_id, billing_interval: billingInterval, renewal_mode: renewalMode, tax_mode: taxMode, vat_rate: String(vatRate), tax_amount: String(tax.taxAmount) },
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
