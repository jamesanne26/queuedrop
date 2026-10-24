import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
const key=process.env.QUEUEDROP_PAYMONGO_TEST_SECRET_KEY;
assert.ok(key?.startsWith("sk_test_"),"Refusing non-test PayMongo key");
const dbUrl=process.env.QUEUEDROP_TEST_SUPABASE_URL;
assert.equal(new URL(dbUrl).hostname,"tcgiwtfhqssulxwawimh.supabase.co","Refusing non-TEST database");
const admin=createClient(dbUrl,process.env.QUEUEDROP_TEST_SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const summary={testMode:true,phase:"starting"};
mkdirSync("paymongo-renewal-result",{recursive:true});
function save(){writeFileSync("paymongo-renewal-result/result.json",JSON.stringify(summary,null,2));}
async function api(path,method="GET",attributes){
 const r=await fetch("https://api.paymongo.com/v1"+path,{method,
 headers:{Authorization:"Basic "+Buffer.from(key+":").toString("base64"),Accept:"application/json",...(attributes?{"Content-Type":"application/json"}:{})},
 ...(attributes?{body:JSON.stringify({data:{attributes}})}:{}),signal:AbortSignal.timeout(30000)});
 const j=await r.json();
 if(!r.ok)throw new Error("Sandbox API "+path.split("?")[0]+" HTTP "+r.status+" "+(j.errors??[]).map(e=>e.code+(e.source?.pointer?" at "+e.source.pointer:"")).join(","));
 return j.data;
}
async function db(q){const r=await q;assert.equal(r.error,null,r.error?.message);return r.data;}
async function state(){
 const sub=await db(admin.from("business_subscriptions").select("status,expires_at,paymongo_subscription_id").eq("business_id",summary.businessId).maybeSingle());
 const payments=await db(admin.from("payments").select("provider_reference,provider_payment_id,amount,currency,status").eq("business_id",summary.businessId).order("paid_at"));
 return {subscription:sub,payments};
}
async function waitForPayments(count){
 for(let n=0;n<90;n++){const s=await state();if(s.payments.length===count&&s.subscription?.status==="active")return s;await delay(2000);}
 throw new Error("Provider webhook did not produce expected payment count "+count);
}
let actionRequired=false;
try{
 summary.phase="create_plan";save();
 const plan=await api("/subscriptions/plans","POST",{type:"scheduled",name:"QueueDrop Sandbox Renewal QA",amount:49900,currency:"PHP",interval:"monthly",interval_count:1,cycle_count:3});
 assert.equal(plan.attributes.livemode,false);
 summary.providerPlanId=plan.id;save();
 const customer=await api("/customers","POST",{first_name:"QueueDrop",last_name:"Sandbox QA",email:"qa@example.com"});
 assert.equal(customer.attributes.livemode,false);
 const provider=await api("/subscriptions","POST",{plan_id:plan.id,customer_id:customer.id});
 assert.equal(provider.attributes.livemode,false);
 summary.providerSubscriptionId=provider.id;
 const business=await db(admin.from("businesses").insert({name:"PayMongo Renewal Acceptance QA",slug:"paymongo-renewal-"+provider.id.toLowerCase()}).select("id").single());
 summary.businessId=business.id;
 const order=await db(admin.from("subscription_orders").insert({
 business_id:business.id,plan_id:"592976f1-d593-46de-86e8-3cf8422557fc",amount:499,subtotal:499,currency:"PHP",
 provider:"paymongo",payment_mode:"subscription",status:"checkout_created",billing_interval:"monthly",renewal_mode:"auto",
 provider_subscription_id:provider.id,provider_customer_id:customer.id,provider_plan_id:plan.id}).select("id").single());
 summary.orderId=order.id;summary.phase="activate";save();
 const piId=provider.attributes.latest_invoice?.payment_intent?.id;
 assert.ok(piId,"Subscription has no first Payment Intent");
 const pi=await api("/payment_intents/"+encodeURIComponent(piId));
 const pm=await api("/payment_methods","POST",{type:"card",details:{card_number:"4343434343434345",exp_month:12,exp_year:2028,cvc:"123"},billing:{name:"QueueDrop Sandbox QA",email:"qa@example.com"}});
 const paid=await api("/payment_intents/"+encodeURIComponent(piId)+"/attach","POST",{
 payment_method:pm.id,client_key:pi.attributes.client_key,return_url:"https://queuedrop-test.vercel.app/pricing?qa_renewal=activation"});
 summary.firstIntentStatus=paid.attributes.status;
 if(paid.attributes.status==="awaiting_next_action"){
  actionRequired=true;summary.actionUrl=paid.attributes.next_action?.redirect?.url;save();
  throw new Error("Sandbox subscription requires browser authorization; see result artifact");
 }
 assert.equal(paid.attributes.status,"succeeded");
 const activated=await waitForPayments(1);
 summary.activation=activated;save();
 console.log("PASS: actual provider first subscription invoice accepted");
 summary.phase="renewal";save();
 await api("/subscriptions/"+encodeURIComponent(provider.id)+"/test_cycle","POST");
 const renewed=await waitForPayments(2);
 summary.renewal=renewed;
 assert.equal(new Set(renewed.payments.map(p=>p.provider_reference)).size,2);
 assert.ok(renewed.payments.every(p=>Number(p.amount)===499&&p.currency==="PHP"&&p.status==="paid"));
 const difference=new Date(renewed.subscription.expires_at)-new Date(activated.subscription.expires_at);
 assert.ok(difference>=20*86400000,"Renewal did not advance expiry by a full billing interval");
 await delay(8000);
 assert.deepEqual(await state(),renewed,"Unexpected duplicate payment or expiry change after provider deliveries settled");
 summary.phase="passed";save();
 console.log("PASS: actual provider renewal invoice accepted, two unique payments and full billing-period extension");
 console.log(JSON.stringify(summary));
}catch(error){summary.error=error.message;save();throw error;}
finally{
 if(summary.providerSubscriptionId&&!actionRequired){
  try{await api("/subscriptions/"+encodeURIComponent(summary.providerSubscriptionId),"DELETE");console.log("Sandbox QA subscription cancelled after verification");}
  catch{console.error("Unable to cancel sandbox QA subscription; see saved subscription id");}
 }
}
