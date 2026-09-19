import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type PinReveal = { terminalName: string; pin: string; expiresAt: number };

function key() {
  const secret = process.env.TERMINAL_PIN_REVEAL_SECRET ?? process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing terminal PIN reveal secret.");
  return createHash("sha256").update(secret).digest();
}

export function createPinRevealToken(terminalName: string, pin: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const payload: PinReveal = { terminalName, pin, expiresAt: Date.now() + 10 * 60 * 1000 };
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function readPinRevealToken(token?: string): PinReveal | null {
  if (!token) return null;
  try {
    const value = Buffer.from(token, "base64url");
    if (value.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8")) as PinReveal;
    return payload.expiresAt >= Date.now() && /^\d{4,8}$/.test(payload.pin) ? payload : null;
  } catch { return null; }
}
