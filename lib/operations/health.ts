export async function probeReadiness(probe: () => PromiseLike<{ error: unknown }>) {
  try {
    const result = await probe();
    return { status: result.error ? "degraded" : "ok", database: result.error ? "unavailable" : "ok" };
  } catch {
    return { status: "degraded", database: "unavailable" };
  }
}
