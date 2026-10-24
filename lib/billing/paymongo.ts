import crypto from "node:crypto";

export function validPayMongoSignature(
  raw: string,
  header: string | null,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!secret || !header || !Number.isSafeInteger(nowSeconds)) return false;
  const parts: Record<string, string> = {};
  for (const segment of header.split(",")) {
    const index = segment.indexOf("=");
    if (index <= 0) return false;
    const key = segment.slice(0, index).trim();
    if (Object.hasOwn(parts, key)) return false;
    parts[key] = segment.slice(index + 1).trim();
  }
  const timestamp = parts.t;
  if (!timestamp || !/^[0-9]+$/.test(timestamp)) return false;
  const signedAt = Number(timestamp);
  // Bound replay age and clock skew using the delivery's signed timestamp,
  // not the event creation time. Provider retries must carry a fresh signature.
  if (!Number.isSafeInteger(signedAt) || Math.abs(nowSeconds - signedAt) > 300) return false;
  const signature = parts.li || parts.te;
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
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

/** Only accept a provider-reported integer amount in minor currency units. */
export function verifiedPayMongoAmount(amount: unknown, currency: unknown, expectedCurrency: string): number | null {
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0) return null;
  if (typeof currency !== "string" || currency.toUpperCase() !== expectedCurrency.toUpperCase()) return null;
  return amount / 100;
}

/**
 * Require exact equality in provider minor units. Never tolerate a difference
 * smaller than one peso via floating-point comparisons or round a non-cent
 * order total into a paid amount.
 */
export function verifiedPayMongoExpectedAmount(
  amount: unknown,
  currency: unknown,
  expectedAmount: number,
  expectedCurrency: string,
): number | null {
  const paidAmount = verifiedPayMongoAmount(amount, currency, expectedCurrency);
  if (paidAmount === null || !Number.isFinite(expectedAmount) || expectedAmount <= 0) return null;
  const expectedMinorUnits = Math.round(expectedAmount * 100);
  if (!Number.isSafeInteger(expectedMinorUnits)) return null;
  if (Math.abs(expectedAmount * 100 - expectedMinorUnits) > 0.000001) return null;
  return amount === expectedMinorUnits ? paidAmount : null;
}
