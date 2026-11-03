export async function probeReadiness(probe: () => PromiseLike<{ error: unknown }>) {
  try {
    const result = await probe();
    if (result.error) {
      const error = result.error as { code?: string; name?: string; status?: number };
      console.error("Database readiness probe failed", {
        code: typeof error.code === "string" ? error.code : null,
        name: typeof error.name === "string" ? error.name : null,
        status: typeof error.status === "number" ? error.status : null,
      });
      return { status: "degraded", database: "unavailable" };
    }
    return { status: "ok", database: "ok" };
  } catch (error) {
    console.error("Database readiness probe threw", {
      name: error instanceof Error ? error.name : "Unknown",
    });
    return { status: "degraded", database: "unavailable" };
  }
}
