-- Reconcile two PayMongo invoice uniqueness indexes present in TEST but missing in PROD.
-- Idempotent: PROD indexes were first applied after confirming zero existing payment rows.
CREATE UNIQUE INDEX IF NOT EXISTS payments_paymongo_invoice_reference_unique
  ON public.payments (provider, provider_reference)
  WHERE provider = 'paymongo' AND provider_reference IS NOT NULL
    AND provider_reference LIKE 'in_%';

CREATE UNIQUE INDEX IF NOT EXISTS payments_paymongo_invoice_unique_all
  ON public.payments (provider, provider_reference)
  WHERE provider = 'paymongo' AND payment_method = 'subscription'
    AND provider_reference IS NOT NULL;
