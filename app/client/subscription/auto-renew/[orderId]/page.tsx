import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AutoRenewCardForm } from "./auto-renew-card-form";

type Props = { params: Promise<{ orderId: string }> };

export default async function AutoRenewSetupPage({ params }: Props) {
  const { orderId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/auth/login?next=${encodeURIComponent(`/client/subscription/auto-renew/${orderId}`)}`);

  const { data: membership } = await supabase
    .from("business_users")
    .select("business_id,role")
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) redirect("/dashboard");

  const { data: order } = await supabase
    .from("subscription_orders")
    .select("id,business_id,amount,currency,billing_interval,renewal_mode,status,provider_payment_intent_id,provider_payment_intent_client_key,plans(name)")
    .eq("id", orderId)
    .eq("business_id", membership.business_id)
    .maybeSingle();

  if (!order || order.renewal_mode !== "auto") redirect("/client/subscription?error=Auto-renew%20setup%20was%20not%20found.");
  if (order.status === "paid") redirect("/client/subscription?payment=success");
  if (!order.provider_payment_intent_id || !order.provider_payment_intent_client_key) {
    redirect("/client/subscription?error=Auto-renew%20payment%20setup%20is%20incomplete.%20Please%20start%20again.");
  }

  const publicKey = process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY;
  if (!publicKey) redirect("/client/subscription?error=PayMongo%20public%20key%20is%20not%20configured.");

  const relation = order.plans as { name?: string } | { name?: string }[] | null;
  const planName = Array.isArray(relation) ? relation[0]?.name : relation?.name;

  return (
    <section className="client-content">
      <div className="client-hero">
        <p className="eyebrow">Auto-renew setup</p>
        <h1>{planName ?? "QueueDrop plan"}</h1>
        <p className="muted">Your first card payment activates the subscription and authorizes PayMongo to charge future billing cycles automatically.</p>
      </div>
      <section className="dashboard-section">
        <div className="subscription-summary-grid">
          <span>Billing <strong>{order.billing_interval === "yearly" ? "Annual" : "Monthly"}</strong></span>
          <span>Renewal <strong>Automatic</strong></span>
          <span>Amount <strong>₱{Number(order.amount).toLocaleString()}</strong></span>
          <span>Payment method <strong>Visa / Mastercard</strong></span>
        </div>
        <p className="muted">GCash remains available for manual renewal. PayMongo automatic subscriptions currently support cards and Maya, not GCash.</p>
      </section>
      <AutoRenewCardForm
        publicKey={publicKey}
        paymentIntentId={order.provider_payment_intent_id}
        clientKey={order.provider_payment_intent_client_key}
        returnUrl={`${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? ""}/client/subscription?payment=success`}
        customerName={auth.user.user_metadata?.full_name ?? "QueueDrop Client"}
        customerEmail={auth.user.email ?? ""}
      />
    </section>
  );
}
