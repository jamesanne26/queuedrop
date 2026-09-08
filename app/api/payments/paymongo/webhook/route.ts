import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addBillingMonth } from "@/lib/billing/subscription";
import { validPayMongoSignature } from "@/lib/billing/paymongo";

export async function POST(request: Request) {
  const raw=await request.text();
  if(!validPayMongoSignature(raw,request.headers.get("paymongo-signature"),process.env.PAYMONGO_WEBHOOK_SECRET)) return NextResponse.json({error:"Invalid signature"},{status:401});
  let event: { data?: { attributes?: { type?: string; data?: { id?: string; attributes?: { external_reference_number?: string; reference_number?: string; metadata?: { reference_number?: string }; amount?: number | string; currency?: string; paid_at?: number; source?: { type?: string }; payment_method_used?: string } } } } };
  try { event=JSON.parse(raw); } catch { return NextResponse.json({error:"Invalid JSON"},{status:400}); }
  const type=event?.data?.attributes?.type;
  const resource=event?.data?.attributes?.data;
  const attrs=resource?.attributes ?? {};
  if(type!=="payment.paid") return NextResponse.json({received:true});
  const reference=attrs.external_reference_number ?? attrs.reference_number ?? attrs.metadata?.reference_number;
  if(!reference || !resource?.id) return NextResponse.json({received:true});

  const admin=createAdminClient();
  const {data:order,error:orderError}=await admin.from("subscription_orders").select("id,business_id,plan_id,amount,currency,status").eq("id",reference).maybeSingle();
  if(orderError) return NextResponse.json({error:"Billing lookup failed"},{status:500});
  if(!order) return NextResponse.json({received:true});

  const paidAmount=attrs.amount!==undefined ? Number(attrs.amount)/100 : Number(order.amount);
  const paidCurrency=String(attrs.currency ?? order.currency).toUpperCase();
  if(Math.abs(paidAmount-Number(order.amount))>0.001 || paidCurrency!==String(order.currency).toUpperCase()) {
    await admin.from("subscription_orders").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",order.id).neq("status","paid");
    return NextResponse.json({error:"Payment amount or currency mismatch"},{status:409});
  }

  const {data:alreadyPaid}=await admin.from("payments").select("id").eq("provider_payment_id",resource.id).maybeSingle();
  if(alreadyPaid) return NextResponse.json({received:true,duplicate:true});

  const paidAt=attrs.paid_at ? new Date(attrs.paid_at*1000) : new Date();
  const {error:paymentError}=await admin.from("payments").upsert({
    business_id:order.business_id, subscription_order_id:order.id, provider:"paymongo", provider_payment_id:resource.id,
    provider_reference:reference, amount:paidAmount, currency:paidCurrency, payment_method:attrs.source?.type ?? attrs.payment_method_used ?? "online",
    status:"paid", paid_at:paidAt.toISOString(), metadata:attrs,
  },{onConflict:"provider_payment_id"});
  if(paymentError) return NextResponse.json({error:"Unable to record payment"},{status:500});

  const {data:existing}=await admin.from("business_subscriptions").select("plan_id,status,expires_at").eq("business_id",order.business_id).maybeSingle();
  const changingPlan=Boolean(existing && existing.plan_id!==order.plan_id);
  const existingExpiry=existing?.expires_at ? new Date(existing.expires_at) : null;
  const periodBase=!changingPlan && existingExpiry && existingExpiry>paidAt ? existingExpiry : paidAt;
  const expiry=addBillingMonth(periodBase);
  const payload:Record<string,unknown>={ business_id:order.business_id, plan_id:order.plan_id, status:"active", started_at:paidAt.toISOString(), expires_at:expiry.toISOString(), billing_price_monthly:Number(order.amount), billing_currency:order.currency, updated_at:new Date().toISOString() };
  if(changingPlan) Object.assign(payload,{custom_monthly_price:null,custom_max_branches:null,custom_max_active_queues_per_branch:null,custom_max_services_per_branch:null,custom_trial_days:null,custom_max_users:null,custom_max_terminals:null,override_reason:null,override_expires_at:null});
  const {error:subscriptionError}=await admin.from("business_subscriptions").upsert(payload,{onConflict:"business_id"});
  if(subscriptionError) return NextResponse.json({error:"Unable to activate subscription"},{status:500});
  await admin.from("subscription_orders").update({status:"paid",updated_at:new Date().toISOString()}).eq("id",order.id);
  return NextResponse.json({received:true});
}
