import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES, validateAttachment } from "@/lib/support/attachments";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: "Support session required." }, { status: 403, headers });
  const operation = new URL(request.url).searchParams.get("action");
  if (!operation || !["upload", "list", "download"].includes(operation)) return NextResponse.json({ error: "Invalid attachment action." }, { status: 400, headers });
  try {
    const admin = createAdminClient();
    const call = async (action: string, data: Record<string, unknown>) => {
      const result = await admin.rpc("support_attachment_call", { p_session: token, p_action: action, p_data: data });
      if (result.error) throw new Error(result.error.code === "42501" ? "Attachment access denied." : result.error.message);
      return result.data;
    };
    if (operation !== "upload") {
      const raw = await request.text();
      if (raw.length > 1000) throw new Error("Request too large.");
      const data = JSON.parse(raw);
      if (!uuid.test(data.id || "")) throw new Error("Invalid report or attachment.");
      const result = await call(operation, { id: data.id });
      if (operation === "list") return NextResponse.json(result, { headers });
      const download = await admin.storage.from(ATTACHMENT_BUCKET).download(result.path);
      if (download.error || !download.data) throw new Error("Attachment is unavailable.");
      return new Response(download.data, { headers: { ...headers, "Content-Type": result.type,
        "Content-Disposition": `attachment; filename="attachment.${result.extension}"; filename*=UTF-8''${encodeURIComponent(result.name)}` } });
    }
    // Also enforced at the portal proxy and private bucket.
    if (Number(request.headers.get("content-length") || 0) > MAX_ATTACHMENT_BYTES + 65536) throw new Error("Attachment too large.");
    if (!request.body) throw new Error("Select an attachment.");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = []; let total = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.length;
      if (total > MAX_ATTACHMENT_BYTES + 65536) { await reader.cancel(); throw new Error("Attachment too large."); }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    const form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
    const report = form.get("report_id"), file = form.get("file"), clientKey = form.get("attachment_key");
    if (typeof report !== "string" || !uuid.test(report) || typeof clientKey !== "string" || !uuid.test(clientKey) || !(file instanceof File)) throw new Error("Select an attachment and report.");
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("Each attachment must be at most 2 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = validateAttachment(file.name, bytes);
    const reserved = await call("reserve", { id: report, client_key: clientKey, ...info });
    if (reserved.state === "ready") return NextResponse.json({ id: reserved.id, ...info }, { headers });
    try {
      const uploaded = await admin.storage.from(ATTACHMENT_BUCKET).upload(reserved.path, bytes, { contentType: info.type, upsert: false });
      if (uploaded.error) {
        // A prior response may have been lost after upload. Complete only if the exact private object exists.
        const existing = await admin.storage.from(ATTACHMENT_BUCKET).download(reserved.path);
        if (existing.error || !existing.data || existing.data.size !== bytes.length
            || !Buffer.from(await existing.data.arrayBuffer()).equals(Buffer.from(bytes))) throw new Error("Unable to upload attachment.");
      }
      await call("complete", { id: reserved.id });
      return NextResponse.json({ id: reserved.id, ...info }, { headers });
    } catch (error) {
      // If completion succeeded but its response was lost, abort is denied and the file is preserved.
      try { await call("abort", { id: reserved.id }); await admin.storage.from(ATTACHMENT_BUCKET).remove([reserved.path]); } catch { /* Preserve uncertain completion for a safe retry. */ }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process attachment.";
    return NextResponse.json({ error: /access|session|revoked|expired|unavailable/i.test(message) ? "Attachment access denied or unavailable." : message },
      { status: /access|session|revoked|expired|unavailable/i.test(message) ? 403 : 400, headers });
  }
}
