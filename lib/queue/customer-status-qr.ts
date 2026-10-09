export function customerStatusQrUrl(origin: string, pathname: string): string {
  const expectedOrigin = new URL(origin).origin;
  const target = new URL(pathname, expectedOrigin);
  if (!pathname.startsWith("/q/status/") || target.origin !== expectedOrigin) {
    throw new Error("A customer queue status page is required to create its QR code.");
  }
  target.search = "";
  target.hash = "";
  return target.toString();
}
