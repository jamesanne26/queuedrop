-- Enforce uniqueness of PayMongo invoice references across payment methods.
-- Complements payments_paymongo_invoice_unique_all (subscription-only).
-- A partial unique index is safe for existing checkout rows whose references are order UUIDs.
CREATE UNIQUE INDEX IF NOT EXISTS payments_paymongo_invoice_reference_unique
ON public.payments(provider, provider_reference)
WHERE provider = 'paymongo'
  AND provider_reference IS NOT NULL
  AND provider_reference LIKE 'in_%';
