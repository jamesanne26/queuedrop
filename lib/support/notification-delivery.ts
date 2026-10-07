type Notification = { id: string; recipient: string; body: string; claim: string };
type Rpc = (action: string, data?: Record<string, unknown>) => Promise<unknown>;
type Options = { dryRun: boolean; apiKey?: string; from?: string; appUrl: string; send?: typeof fetch; batchLimit?: number; reportId?: string };

export async function dispatchNotifications(rpc: Rpc, options: Options) {
  if (!options.dryRun && (!options.apiKey || !options.from)) {
    throw new Error("Email delivery is not configured.");
  }
  const app = new URL(options.appUrl);
  if (app.protocol !== "https:" || app.username || app.password) throw new Error("Invalid application URL");
  let sent = 0, simulated = 0, failed = 0;
  const deadline = Date.now() + 20000;
  for (let i = 0; i < Math.max(1, Math.min(options.batchLimit || 1, 10)); i++) {
    if (Date.now() > deadline) break;
    const job = await rpc("notification_claim", options.reportId ? { report_id: options.reportId } : {}) as Partial<Notification>;
    if (!job.id) break;
    if (!job.recipient || !job.claim || !job.body) throw new Error("Invalid notification record");
    if (options.dryRun) {
      await rpc("notification_complete", { id: job.id, claim: job.claim, state: "simulated", provider_id: "test-dry-run" });
      simulated++;
      continue;
    }
    try {
      const response = await (options.send || fetch)("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `support-resolution/${job.id}` },
        body: JSON.stringify({ from: options.from, to: [job.recipient], subject: "QueueDrop support: your report is resolved", text: `${job.body}\n\nOpen Support from your dashboard to view details or reopen your report:\n${app.origin}/dashboard` }),
        signal: AbortSignal.timeout(10000),
      });
      const result = await response.json() as { id?: string };
      if (!response.ok || !result.id) throw new Error("Email provider did not accept delivery");
      await rpc("notification_complete", { id: job.id, claim: job.claim, state: "sent", provider_id: result.id });
      sent++;
    } catch {
      await rpc("notification_complete", { id: job.id, claim: job.claim, state: "failed", error: "Delivery failed. Retry is scheduled; inspect provider configuration." });
      failed++;
    }
  }
  return { sent, simulated, failed };
}
