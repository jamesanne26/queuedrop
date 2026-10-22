import crypto from "node:crypto";

export function validPayMongoSignature(raw:string,header:string|null,secret:string|undefined){
  if(!secret||!header)return false; const parts:Record<string,string>={};
  for(const segment of header.split(",")){const i=segment.indexOf("=");if(i>0)parts[segment.slice(0,i).trim()]=segment.slice(i+1).trim();}
  const timestamp=parts.t;const signature=parts.li||parts.te;if(!timestamp||!signature||!/^[a-f0-9]{64}$/i.test(signature))return false;
  const expected=crypto.createHmac("sha256",secret).update(`${timestamp}.${raw}`).digest("hex");
  try{return crypto.timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(expected,"hex"));}catch{return false;}
}

type PayMongoAttributes = Record<string, unknown>;
type PayMongoResource = { id?: string; attributes?: PayMongoAttributes };
type PayMongoEvent = { data?: { attributes?: { type?: string; data?: PayMongoResource } } };

export type NormalizedPaidCheckout = {
  eventType: string;
  reference: string;
  paymentId: string;
  attributes: PayMongoAttributes;
} | null;

/**
 * Normalize PayMongo paid events into the fields QueueDrop needs.
 * Hosted Checkout's canonical event is checkout_session.payment.paid. Its
 * reference_number lives on the Checkout Session, not necessarily on the
 * nested Payment. Legacy payment.paid is retained as a safe fallback only
 * when PayMongo actually supplies an external/reference number.
 */
export function normalizePayMongoPaidEvent(event: PayMongoEvent): NormalizedPaidCheckout {
  const eventType=String(event?.data?.attributes?.type ?? "");
  const resource=event?.data?.attributes?.data;
  const attrs=(resource?.attributes ?? {}) as PayMongoAttributes;

  if(eventType==="checkout_session.payment.paid"){
    const reference=String(attrs.reference_number ?? (attrs.metadata as Record<string,unknown>|undefined)?.reference_number ?? "").trim();
    const payments=Array.isArray(attrs.payments) ? attrs.payments as PayMongoResource[] : [];
    const payment=payments.find((item)=>String(item?.attributes?.status ?? "")==="paid");
    if(!reference || !payment?.id) return null;
    return {eventType,reference,paymentId:payment.id,attributes:(payment.attributes ?? {}) as PayMongoAttributes};
  }

  if(eventType==="payment.paid"){
    const metadata=attrs.metadata as Record<string,unknown>|undefined;
    const reference=String(attrs.external_reference_number ?? attrs.reference_number ?? metadata?.reference_number ?? "").trim();
    if(!reference || !resource?.id) return null;
    return {eventType,reference,paymentId:resource.id,attributes:attrs};
  }

  return null;
}

/** Require provider-supplied payment details; never substitute the order's own amount. */
export function verifiedCheckoutAmount(attributes: Record<string, unknown>, expectedAmount: number, expectedCurrency: string): number | null {
  const cents = attributes.amount;
  const currency = attributes.currency;
  if (typeof cents !== "number" || !Number.isSafeInteger(cents) || cents < 0 || typeof currency !== "string") return null;
  const expectedCents = Math.round(expectedAmount * 100);
  if (!Number.isSafeInteger(expectedCents) || Math.abs(expectedAmount * 100 - expectedCents) > 0.000001) return null;
  if (cents !== expectedCents || currency.toUpperCase() !== expectedCurrency.toUpperCase()) return null;
  return cents / 100;
}
