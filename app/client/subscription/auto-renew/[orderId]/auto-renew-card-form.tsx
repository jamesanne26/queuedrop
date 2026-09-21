"use client";

import { FormEvent, useState } from "react";

type Props = {
  publicKey: string;
  paymentIntentId: string;
  clientKey: string;
  returnUrl: string;
  customerName: string;
  customerEmail: string;
};

function authHeader(publicKey: string) {
  return `Basic ${btoa(`${publicKey}:`)}`;
}

export function AutoRenewCardForm({ publicKey, paymentIntentId, clientKey, returnUrl, customerName, customerEmail }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const cardNumber = String(form.get("card_number") ?? "").replace(/\D/g, "");
      const expMonth = Number(form.get("exp_month"));
      const expYear = Number(form.get("exp_year"));
      const cvc = String(form.get("cvc") ?? "").trim();
      if (cardNumber.length < 12 || !Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12 || !Number.isInteger(expYear) || expYear < new Date().getFullYear() || !/^\d{3,4}$/.test(cvc)) {
        throw new Error("Please check the card number, expiry, and CVC.");
      }

      const methodResponse = await fetch("https://api.paymongo.com/v1/payment_methods", {
        method: "POST",
        headers: { Authorization: authHeader(publicKey), "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          data: {
            attributes: {
              type: "card",
              details: { card_number: cardNumber, exp_month: expMonth, exp_year: expYear, cvc },
              billing: { name: customerName, email: customerEmail },
            },
          },
        }),
      });
      const methodPayload = await methodResponse.json();
      const paymentMethodId = methodPayload?.data?.id;
      if (!methodResponse.ok || !paymentMethodId) throw new Error(methodPayload?.errors?.[0]?.detail ?? "Unable to create card payment method.");

      const attachResponse = await fetch(`https://api.paymongo.com/v1/payment_intents/${paymentIntentId}/attach`, {
        method: "POST",
        headers: { Authorization: authHeader(publicKey), "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ data: { attributes: { payment_method: paymentMethodId, client_key: clientKey, return_url: returnUrl } } }),
      });
      const attachPayload = await attachResponse.json();
      if (!attachResponse.ok) throw new Error(attachPayload?.errors?.[0]?.detail ?? "Unable to attach the card to the subscription payment.");

      const status = String(attachPayload?.data?.attributes?.status ?? "");
      const redirectUrl = attachPayload?.data?.attributes?.next_action?.redirect?.url;
      if (status === "awaiting_next_action" && redirectUrl) {
        window.location.assign(redirectUrl);
        return;
      }
      if (status === "succeeded" || status === "processing") {
        window.location.assign(returnUrl);
        return;
      }
      throw new Error(attachPayload?.data?.attributes?.last_payment_error?.failed_message ?? "The card could not be authorized. Please try another card.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to set up auto-renew.");
      setBusy(false);
    }
  }

  return (
    <section className="dashboard-section">
      <p className="eyebrow">Card authorization</p>
      <h2>Activate automatic renewal</h2>
      {error ? <div className="notice notice-error">{error}</div> : null}
      <form className="system-form-grid" onSubmit={submit} autoComplete="on">
        <label className="system-form-wide">Card number<input name="card_number" inputMode="numeric" autoComplete="cc-number" placeholder="Card number" required /></label>
        <label>Expiry month<input name="exp_month" type="number" min="1" max="12" autoComplete="cc-exp-month" placeholder="MM" required /></label>
        <label>Expiry year<input name="exp_year" type="number" min={new Date().getFullYear()} autoComplete="cc-exp-year" placeholder="YYYY" required /></label>
        <label>CVC<input name="cvc" inputMode="numeric" autoComplete="cc-csc" maxLength={4} placeholder="CVC" required /></label>
        <div className="system-form-wide system-plan-form-actions">
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Authorizing…" : "Pay & enable auto-renew"}</button>
        </div>
      </form>
      <p className="muted">Card details are sent directly from your browser to PayMongo. QueueDrop does not store the card number or CVC.</p>
    </section>
  );
}
