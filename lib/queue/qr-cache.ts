import QRCode from "qrcode";

const qrCache = new Map<string, Promise<string>>();
const MAX_QR_CACHE = 500;

export function getQueueQrDataUrl(joinUrl: string) {
  const cached = qrCache.get(joinUrl);
  if (cached) return cached;

  if (qrCache.size >= MAX_QR_CACHE) {
    const oldest = qrCache.keys().next().value as string | undefined;
    if (oldest) qrCache.delete(oldest);
  }

  const pending = QRCode.toDataURL(joinUrl, {
    width: 420,
    margin: 1,
    errorCorrectionLevel: "M",
  }).catch((error) => {
    qrCache.delete(joinUrl);
    throw error;
  });

  qrCache.set(joinUrl, pending);
  return pending;
}
