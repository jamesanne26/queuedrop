import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const cfg=JSON.parse(readFileSync("ops/paymongo-sandbox-checkout.json","utf8"));
assert.match(cfg.orderId,/^[0-9a-f-]{36}$/);
const key=process.env.QUEUEDROP_PAYMONGO_TEST_SECRET_KEY;
assert.ok(key?.startsWith("sk_test_"),"Refusing non-test PayMongo key");
async function api(path,method="GET",attributes){
 const response=await fetch("https://api.paymongo.com/v1"+path,{
  method,headers:{Authorization:"Basic "+Buffer.from(key+":").toString("base64"),Accept:"application/json",...(attributes?{"Content-Type":"application/json"}:{})},
  ...(attributes?{body:JSON.stringify({data:{attributes}})}:{}),signal:AbortSignal.timeout(30000)});
 const json=await response.json();
 if(!response.ok)throw new Error("Sandbox API HTTP "+response.status+" "+(json.errors??[]).map(x=>x.code).join(","));
 return json.data;
}
const cs=await api("/checkout_sessions","POST",{
 reference_number:cfg.orderId,description:"QueueDrop sandbox acceptance only",
 line_items:[{name:"QueueDrop Sandbox QA",amount:49900,currency:"PHP",quantity:1}],
 payment_method_types:["card"],send_email_receipt:false,show_description:true,show_line_items:true,
 success_url:"https://queuedrop-test.vercel.app/pricing?qa_payment=success",
 cancel_url:"https://queuedrop-test.vercel.app/pricing?qa_payment=cancelled"});
assert.equal(cs.attributes.livemode,false,"Refusing live checkout resource");
const summary={checkoutId:cs.id,orderId:cfg.orderId,checkoutUrl:cs.attributes.checkout_url,livemode:false};
mkdirSync("paymongo-checkout-result",{recursive:true});
writeFileSync("paymongo-checkout-result/result.json",JSON.stringify(summary,null,2));
const linked=cs.attributes.payment_intent;
if(!linked?.id){
 console.log("Sandbox hosted checkout created; browser completion required");
 console.log(JSON.stringify(summary));
}else{
 const intent=await api("/payment_intents/"+encodeURIComponent(linked.id));
 assert.equal(intent.attributes.livemode,false);
 const pm=await api("/payment_methods","POST",{
 type:"card",details:{card_number:"4343434343434345",exp_month:12,exp_year:2028,cvc:"123"},
 billing:{name:"QueueDrop Sandbox QA",email:"qa@example.com"}});
 assert.equal(pm.attributes.livemode,false);
 const paid=await api("/payment_intents/"+encodeURIComponent(intent.id)+"/attach","POST",{
 payment_method:pm.id,client_key:intent.attributes.client_key,
 return_url:"https://queuedrop-test.vercel.app/pricing?qa_payment=success"});
 summary.paymentIntentId=paid.id;summary.paymentStatus=paid.attributes.status;
 summary.needsBrowser=paid.attributes.status!=="succeeded";
 writeFileSync("paymongo-checkout-result/result.json",JSON.stringify(summary,null,2));
 console.log(JSON.stringify(summary));
 assert.equal(paid.attributes.status,"succeeded","Sandbox card did not succeed; inspect hosted checkout result");
 console.log("PASS: real PayMongo sandbox card payment succeeded; verify provider webhook in TEST database");
}
