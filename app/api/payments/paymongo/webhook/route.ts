import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addBillingPeriod, type BillingInterval } from "@/lib/billing/subscription";
import { normalizePayMongoPaidEvent, validPayMongoSignature, verifiedPayMongoAmount } from "@/lib/billing/paymongo";

type EventResource = { id?: string; type?: string; attributes?: Record<string, unknown> };
type PayMongoEvent = { data?: { attributes?: { type?: string; data?: EventResource } } };

function eventInfo(event: unknown) {
  const typed = event as PayMongoEvent;
  return {
    type: String(typed?.data?.attributes?.type ?? ""),
    resource: typed?.data?.attributes?.data,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function subscriptionIdFromInvoice(resource: EventResource | undefined) {
  const attrs = resource?.attributes ?? {};
  const subscription = asRecord(attrs.subscription);
  return String(subscription?.id ?? attrs.resource_id ?? "").trim();
}


async function resolveInvoicePaymentId(paymentIntentId: string) {
  const secret = process.env.PAYMONGO_SECRET_KEY;
  if (!secret || !paymentIntentId) return paymentIntentId;
  try {
    const response = await fetch(`https://api.paymongo.com/v1/payment_intents/${paymentIntentId}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return paymentIntentId;
    const payload = await response.json();
    const payments = Array.isArray(payload?.data?.attributes?.payments) ? payload.data.attributes.payments : [];
    const paid = payments.find((item: { attributes?: { status?: string } }) => item?.attributes?.status === "paid") ?? payments[0];
    return String(paid?.id ?? paymentIntentId);
  } catch {
    return paymentIntentId;
  }
}
function nextBillingFromResource(resource: EventResource | undefined) {
  const attrs = resource?.attributes ?? {};
  const nestedSubscription = asRecord(attrs.subscription);
  const raw = attrs.next_billing_schedule ?? nestedSubscription?.next_billing_schedule ?? null;
  if (!raw) return null;
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function handleSubscriptionStatusEvent(eventType: string, resource: EventResource | undefined) {
  const subscriptionId = String(resource?.id ?? "").trim();
  if (!subscriptionId) return NextResponse.json({ error: "Subscription event is missing subscription id" }, { status: 422 });

  const attrs = resource?.attributes ?? {};
  const providerStatus = String(attrs.status ?? (eventType === "subscription.past_due" ? "past_due" : eventType === "subscription.unpaid" ? "unpaid" : ""));
  const queueDropStatus = providerStatus === "active"
    ? "active"
    : providerStatus === "past_due" || providerStatus === "unpaid"
      ? "past_due"
      : providerStatus === "cancelled" || providerStatus === "incomplete_cancelled"
        ? "cancelled"
        : null;

  const admin = createAdminClient();
  const { data: current, error } = await admin
    .from("business_subscriptions")
    .select("id")
    .eq("paymongo_subscription_id", subscriptionId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Subscription lookup failed" }, { status: 500 });
  if (!current) return NextResponse.json({ received: true, ignored: "subscription_not_linked" });

  const nextBilling = nextBillingFromResource(resource);
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (queueDropStatus) payload.status = queueDropStatus;
  if (nextBilling) payload.next_billing_at = nextBilling.toISOString();
  const { error: updateError } = await admin.from("business_subscriptions").update(payload).eq("id", current.id);
  if (updateError) return NextResponse.json({ error: "Unable to update subscription status" }, { status: 500 });
  return NextResponse.json({ received: true });
}

async function handleSubscriptionInvoicePaid(resource: EventResource | undefined) {
  const invoiceId = String(resource?.id ?? "").trim();
  const attrs = resource?.attributes ?? {};
  const providerSubscriptionId = subscriptionIdFromInvoice(resource);
  if (!invoiceId || !providerSubscriptionId) return NextResponse.json({ error: "Paid subscription invoice is missing identifiers" }, { status: 422 });

  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin
    .from("business_subscriptions")
    .select("id,business_id,plan_id,billing_interval,renewal_mode,billing_currency,paymongo_customer_id,paymongo_plan_id,expires_at")
    .eq("paymongo_subscription_id", providerSubscriptionId)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: "Subscription lookup failed" }, { status: 500 });

  // During first activation, business_subscriptions may not be linked yet. Fall
  // back to the setup order that owns this PayMongo subscription.
  const { data: setupOrder, error: orderError } = await admin
    .from("subscription_orders")
    .select("id,business_id,plan_id,amount,subtotal,tax_mode,vat_rate,tax_amount,tax_price_mode,currency,billing_interval,renewal_mode,status,provider_customer_id,provider_plan_id")
    .eq("provider_subscription_id", providerSubscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) return NextResponse.json({ error: "Billing order lookup failed" }, { status: 500 });
  if (!current && !setupOrder) return NextResponse.json({ received: true, ignored: "subscription_not_linked" });

  const businessId = current?.business_id ?? setupOrder!.business_id;
  const planId = current?.plan_id ?? setupOrder!.plan_id;
  const interval = String(current?.billing_interval ?? setupOrder?.billing_interval ?? "monthly") as BillingInterval;
  const expectedCurrency = String(current?.billing_currency ?? setupOrder?.currency ?? "PHP").toUpperCase();
  const verifiedAmount = verifiedPayMongoAmount(attrs.amount, attrs.currency, expectedCurrency);
  const amount = verifiedAmount ?? NaN;
  const currency = typeof attrs.currency === "string" ? attrs.currency.toUpperCase() : "";
  if (!Number.isFinite(amount) || amount <= 0 || currency !== expectedCurrency) {
    return NextResponse.json({ error: "Invalid recurring invoice amount or currency" }, { status: 409 });
  }
  // The initial subscription invoice must match the amount authorized in its setup order.
  if (!current && setupOrder && Math.abs(amount - Number(setupOrder.amount)) > 0.001) {
    return NextResponse.json({ error: "Initial recurring invoice amount mismatch" }, { status: 409 });
  }
  const now = new Date();
  const nextBilling = nextBillingFromResource(resource) ?? addBillingPeriod(now, interval);

  // Invoice idempotency must be checked BEFORE creating a renewal order.
  // A webhook retry must reuse the original payment/order and still retry activation.
  const { data: existingInvoicePayment, error: invoiceLookupError } = await admin
    .from("payments")
    .select("subscription_order_id")
    .eq("provider", "paymongo")
    .eq("provider_reference", invoiceId)
    .maybeSingle();
  if (invoiceLookupError) return NextResponse.json({ error: "Invoice payment lookup failed" }, { status: 500 });

  let orderId = existingInvoicePayment?.subscription_order_id ?? (setupOrder?.status !== "paid" ? setupOrder?.id : null);
  if (!orderId) {
    const { data: renewalOrder, error: renewalOrderError } = await admin.from("subscription_orders").insert({
      business_id: businessId,
      plan_id: planId,
      requested_by: null,
      amount,
      subtotal: setupOrder?.subtotal ?? amount,
      tax_mode: setupOrder?.tax_mode ?? "non_vat",
      vat_rate: setupOrder?.vat_rate ?? 0,
      tax_amount: setupOrder?.tax_amount ?? 0,
      tax_price_mode: setupOrder?.tax_price_mode ?? "inclusive",
      currency,
      billing_interval: interval,
      renewal_mode: "auto",
      payment_mode: "subscription",
      provider: "paymongo",
      provider_subscription_id: providerSubscriptionId,
      provider_customer_id: current?.paymongo_customer_id ?? setupOrder?.provider_customer_id ?? null,
      provider_plan_id: current?.paymongo_plan_id ?? setupOrder?.provider_plan_id ?? null,
      status: "paid",
    }).select("id").single();
    if (renewalOrderError || !renewalOrder) return NextResponse.json({ error: "Unable to record renewal order" }, { status: 500 });
    orderId = renewalOrder.id;
  } else {
    const { error: finalizeError } = await admin.from("subscription_orders").update({ status: "paid", updated_at: now.toISOString() }).eq("id", orderId);
    if (finalizeError) return NextResponse.json({ error: "Unable to finalize subscription order" }, { status: 500 });
  }

  const paymentIntent = asRecord(attrs.payment_intent);
  const paymentIntentId = String(paymentIntent?.id ?? "");
  const providerPaymentId = paymentIntentId ? await resolveInvoicePaymentId(paymentIntentId) : `subscription_invoice:${invoiceId}`;
  const { data: duplicate, error: duplicateError } = await admin.from("payments").select("id,subscription_order_id").eq("provider_payment_id", providerPaymentId).maybeSingle();
  if (duplicateError) return NextResponse.json({ error: "Payment lookup failed" }, { status: 500 });
  if (alreadyPaid && (alreadyPaid.subscription_order_id !== order.id || alreadyPaid.business_id !== order.business_id)) {
    return NextResponse.json({ error: "Payment ID belongs to another order or business" }, { status: 409 });
  }
  if (existingInvoicePayment && duplicate && existingInvoicePayment.subscription_order_id !== duplicate.subscription_order_id) {
    return NextResponse.json({ error: "Conflicting invoice payment records" }, { status: 409 });
  }
  if (duplicate && duplicate.subscription_order_id !== orderId) {
    return NextResponse.json({ error: "Invoice payment is linked to another order" }, { status: 409 });
  }
  if (!duplicate && !existingInvoicePayment) {
    const { error: paymentError } = await admin.from("payments").insert({
      business_id: businessId,
      subscription_order_id: orderId,
      provider: "paymongo",
      provider_payment_id: providerPaymentId,
      provider_reference: invoiceId,
      amount,
      subtotal: setupOrder?.subtotal ?? amount,
      tax_mode: setupOrder?.tax_mode ?? "non_vat",
      vat_rate: setupOrder?.vat_rate ?? 0,
      tax_amount: setupOrder?.tax_amount ?? 0,
      currency,
      payment_method: "subscription",
      status: "paid",
      paid_at: now.toISOString(),
      metadata: attrs,
    });
    if (paymentError) return NextResponse.json({ error: "Unable to record subscription payment" }, { status: 500 });
  }

  const { data: existingBusinessSubscription, error: existingBusinessError } = await admin
    .from("business_subscriptions")
    .select("plan_id")
    .eq("business_id", businessId)
    .maybeSingle();
  if (existingBusinessError) return NextResponse.json({ error: "Unable to read current QueueDrop subscription" }, { status: 500 });
  const changingPlan = Boolean(existingBusinessSubscription && existingBusinessSubscription.plan_id !== planId);

  const subscriptionPayload: Record<string, unknown> = {
    business_id: businessId,
    plan_id: planId,
    status: "active",
    billing_interval: interval,
    renewal_mode: "auto",
    billing_currency: currency,
    paymongo_subscription_id: providerSubscriptionId,
    paymongo_customer_id: current?.paymongo_customer_id ?? setupOrder?.provider_customer_id ?? null,
    paymongo_plan_id: current?.paymongo_plan_id ?? setupOrder?.provider_plan_id ?? null,
    next_billing_at: nextBilling.toISOString(),
    expires_at: nextBilling.toISOString(),
    updated_at: now.toISOString(),
  };
  if (!current) subscriptionPayload.started_at = now.toISOString();
  if (interval === "yearly") subscriptionPayload.billing_price_yearly = Number(setupOrder?.tax_price_mode === "inclusive" ? setupOrder?.amount ?? amount : setupOrder?.subtotal ?? amount);
  else subscriptionPayload.billing_price_monthly = Number(setupOrder?.tax_price_mode === "inclusive" ? setupOrder?.amount ?? amount : setupOrder?.subtotal ?? amount);
  if (changingPlan) Object.assign(subscriptionPayload, {
    custom_monthly_price: null,
    custom_max_branches: null,
    custom_max_active_queues_per_branch: null,
    custom_max_services_per_branch: null,
    custom_trial_days: null,
    custom_max_users: null,
    custom_max_terminals: null,
    override_reason: null,
    override_expires_at: null,
  });

  const { error: subscriptionError } = await admin.from("business_subscriptions").upsert(subscriptionPayload, { onConflict: "business_id" });
  if (subscriptionError) return NextResponse.json({ error: "Unable to activate recurring subscription" }, { status: 500 });
  return NextResponse.json({ received: true });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validPayMongoSignature(raw, request.headers.get("paymongo-signature"), process.env.PAYMONGO_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: unknown;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { type: eventType, resource } = eventInfo(event);

  if (eventType === "subscription.invoice.paid") return handleSubscriptionInvoicePaid(resource);
  if (["subscription.updated", "subscription.past_due", "subscription.unpaid"].includes(eventType)) {
    return handleSubscriptionStatusEvent(eventType, resource);
  }

  const normalized = normalizePayMongoPaidEvent(event as Parameters<typeof normalizePayMongoPaidEvent>[0]);
  if (!normalized) {
    // Hosted Checkout must always carry the QueueDrop order reference. Generic
    // payment.paid can also be emitted by recurring subscription payments, so
    // acknowledge it when no QueueDrop reference is present.
    if (eventType === "checkout_session.payment.paid") {
      return NextResponse.json({ error: "Paid checkout is missing QueueDrop order reference or payment id" }, { status: 422 });
    }
    return NextResponse.json({ received: true });
  }

  const { reference, paymentId, attributes: attrs } = normalized;
  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin
    .from("subscription_orders")
    .select("id,business_id,plan_id,amount,subtotal,tax_mode,vat_rate,tax_amount,tax_price_mode,currency,status,billing_interval,renewal_mode")
    .eq("id", reference)
    .maybeSingle();
  if (orderError) return NextResponse.json({ error: "Billing lookup failed" }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Subscription order not found" }, { status: 404 });

  const verifiedAmount = verifiedPayMongoAmount(attrs.amount, attrs.currency, String(order.currency));
  const paidAmount = verifiedAmount ?? NaN;
  const paidCurrency = typeof attrs.currency === "string" ? attrs.currency.toUpperCase() : "";
  if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - Number(order.amount)) > 0.001 || paidCurrency !== String(order.currency).toUpperCase()) {
    await admin.from("subscription_orders").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", order.id).neq("status", "paid");
    return NextResponse.json({ error: "Payment amount or currency mismatch" }, { status: 409 });
  }

  const { data: alreadyPaid, error: duplicateError } = await admin.from("payments").select("id,subscription_order_id,business_id").eq("provider_payment_id", paymentId).maybeSingle();
  if (duplicateError) return NextResponse.json({ error: "Payment lookup failed" }, { status: 500 });
  // Do not return early: a previous delivery may have recorded the payment
  // but failed before subscription activation or order finalization.
  const isDuplicatePayment = Boolean(alreadyPaid);

  const paidAtValue = attrs.paid_at;
  const paidAt = typeof paidAtValue === "number" ? new Date(paidAtValue * 1000) : new Date();
  const source = attrs.source as { type?: string } | undefined;
  const paymentPayload = {
    business_id: order.business_id,
    subscription_order_id: order.id,
    provider: "paymongo",
    provider_payment_id: paymentId,
    provider_reference: reference,
    amount: paidAmount,
    subtotal: order.subtotal,
    tax_mode: order.tax_mode,
    vat_rate: order.vat_rate,
    tax_amount: order.tax_amount,
    currency: paidCurrency,
    payment_method: source?.type ?? String(attrs.payment_method_used ?? "online"),
    status: "paid",
    paid_at: paidAt.toISOString(),
    metadata: attrs,
  };
  if (!isDuplicatePayment) {
    const { error: paymentError } = await admin.from("payments").upsert(paymentPayload, { onConflict: "provider_payment_id" });
    if (paymentError) return NextResponse.json({ error: "Unable to record payment" }, { status: 500 });
  }

  const { data: existing, error: existingError } = await admin
    .from("business_subscriptions")
    .select("plan_id,status,expires_at")
    .eq("business_id", order.business_id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: "Unable to read current subscription" }, { status: 500 });

  // A fully finalized order is already fulfilled. Replaying its webhook
  // must not extend the paid-through date by another billing period.
  if (order.status === "paid" && existing?.status === "active" && existing.plan_id === order.plan_id) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  const changingPlan = Boolean(existing && existing.plan_id !== order.plan_id);
  const existingExpiry = existing?.expires_at ? new Date(existing.expires_at) : null;
  const periodBase = !changingPlan && existingExpiry && existingExpiry > paidAt ? existingExpiry : paidAt;
  const interval = (order.billing_interval === "yearly" ? "yearly" : "monthly") as BillingInterval;
  const expiry = addBillingPeriod(periodBase, interval);
  const payload: Record<string, unknown> = {
    business_id: order.business_id,
    plan_id: order.plan_id,
    status: "active",
    started_at: paidAt.toISOString(),
    expires_at: expiry.toISOString(),
    billing_interval: interval,
    renewal_mode: "manual",
    next_billing_at: null,
    billing_currency: order.currency,
    paymongo_subscription_id: null,
    paymongo_customer_id: null,
    paymongo_plan_id: null,
    updated_at: new Date().toISOString(),
  };
  if (interval === "yearly") payload.billing_price_yearly = Number(order.tax_price_mode === "inclusive" ? order.amount : order.subtotal);
  else payload.billing_price_monthly = Number(order.tax_price_mode === "inclusive" ? order.amount : order.subtotal);
  if (changingPlan) Object.assign(payload, {
    custom_monthly_price: null,
    custom_max_branches: null,
    custom_max_active_queues_per_branch: null,
    custom_max_services_per_branch: null,
    custom_trial_days: null,
    custom_max_users: null,
    custom_max_terminals: null,
    override_reason: null,
    override_expires_at: null,
  });
  const { error: subscriptionError } = await admin.from("business_subscriptions").upsert(payload, { onConflict: "business_id" });
  if (subscriptionError) return NextResponse.json({ error: "Unable to activate subscription" }, { status: 500 });

  const { error: orderUpdateError } = await admin.from("subscription_orders").update({ status: "paid", updated_at: new Date().toISOString() }).eq("id", order.id);
  if (orderUpdateError) return NextResponse.json({ error: "Unable to finalize subscription order" }, { status: 500 });
  return NextResponse.json({ received: true });
}
