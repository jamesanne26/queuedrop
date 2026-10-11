import test from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import { customerStatusQrUrl } from "../../lib/queue/customer-status-qr.ts";

test("customer queue QR points back to the private status path and drops transient query/hash", () => {
  assert.equal(
    customerStatusQrUrl("https://queuedrop-test.vercel.app/", "/q/status/private-ticket-token?message=updated#position"),
    "https://queuedrop-test.vercel.app/q/status/private-ticket-token",
  );
});

test("customer queue QR rejects non-status and cross-origin paths", () => {
  assert.throws(() => customerStatusQrUrl("https://queuedrop-test.vercel.app", "/dashboard"));
  assert.throws(() => customerStatusQrUrl("https://queuedrop-test.vercel.app", "//evil.example/q/status/token"));
});

test("QR renderer creates a PNG data URL for the private customer status link", async () => {
  const url = customerStatusQrUrl("https://queuedrop-test.vercel.app", "/q/status/private-ticket-token");
  const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 280 });
  assert.match(dataUrl, /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
});
