-- Bring PROD PayMongo invoice replay protection in line with verified TEST indexes.
-- Preflight: no duplicate PayMongo invoice references in PROD as of 2026-11-04.
CREATE UNIQUE INDEX IF NOT EXISTS payments_paymongo_invoice_reference_unique
ON public.payments (provider, provider_reference)
WHERE provider = 'paymongo' AND provider_reference IS NOT NULL AND provider_reference LIKE 'in_%';

CREATE UNIQUE INDEX IF NOT EXISTS payments_paymongo_invoice_unique_all
ON public.payments (provider, provider_reference)
WHERE provider = 'paymongo' AND payment_method = 'subscription' AND provider_reference IS NOT NULL;
