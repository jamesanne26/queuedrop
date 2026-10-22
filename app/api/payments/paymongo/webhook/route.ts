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

  const paymentIntent = asRecord(attrs.payment_intent);
  const paymentIntentId = String(paymentIntent?.id ?? "");
  const providerPaymentId = paymentIntentId ? await resolveInvoicePaymentId(paymentIntentId) : `subscription_invoice:${invoiceId}`;
  const { error: fulfillmentError, data: result } = await admin.rpc("finalize_paymongo_invoice_atomic", {
    p_invoice_id: invoiceId,
    p_subscription_id: providerSubscriptionId,
    p_payment_id: providerPaymentId,
    p_amount: amount,
    p_currency: currency,
    p_next_billing: nextBilling.toISOString(),
    p_metadata: attrs,
  });
  if (fulfillmentError) {
    console.error("Atomic PayMongo invoice fulfillment failed", fulfillmentError.code);
    return NextResponse.json({ error: "Unable to finalize subscription invoice" }, { status: 500 });
  }
  return NextResponse.json({ received: true, result });

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
    return NextResponse.json({ error: "Payment amount or currency mismatch" }, { status: 409 });
  }

  const paidAtValue = attrs.paid_at;
  const paidAt = typeof paidAtValue === "number" ? new Date(paidAtValue * 1000) : new Date();
  const source = attrs.source as { type?: string } | undefined;
  const { data: result, error: fulfillmentError } = await admin.rpc("finalize_paymongo_checkout_atomic", {
    p_order_id: order.id,
    p_payment_id: paymentId,
    p_amount: paidAmount,
    p_currency: paidCurrency,
    p_paid_at: paidAt.toISOString(),
    p_payment_method: source?.type ?? String(attrs.payment_method_used ?? "online"),
    p_metadata: attrs,
  });
  if (fulfillmentError) {
    console.error("Atomic PayMongo checkout fulfillment failed", fulfillmentError.code);
    return NextResponse.json({ error: "Unable to finalize checkout payment" }, { status: 500 });
  }
  return NextResponse.json({ received: true, result });
}
