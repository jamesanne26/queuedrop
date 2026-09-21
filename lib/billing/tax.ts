export type TaxMode = "non_vat" | "vat";
export type TaxPriceMode = "inclusive" | "exclusive";

export function calculateTax(basePrice: number, taxMode: TaxMode, vatRate: number, priceMode: TaxPriceMode) {
  const price = Math.round(Number(basePrice) * 100) / 100;
  const rate = taxMode === "vat" ? Number(vatRate) : 0;
  if (!Number.isFinite(price) || price < 0) throw new Error("Price must be zero or higher.");
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("VAT rate must be between 0 and 100.");
  if (taxMode === "non_vat" || rate === 0) return { subtotal: price, taxAmount: 0, total: price };
  if (priceMode === "inclusive") {
    const subtotal = Math.round((price / (1 + rate / 100)) * 100) / 100;
    return { subtotal, taxAmount: Math.round((price - subtotal) * 100) / 100, total: price };
  }
  const taxAmount = Math.round((price * rate / 100) * 100) / 100;
  return { subtotal: price, taxAmount, total: Math.round((price + taxAmount) * 100) / 100 };
}
