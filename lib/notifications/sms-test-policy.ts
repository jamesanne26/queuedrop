export function smsEnvFlag(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function shouldForceSmsFailure(env: NodeJS.ProcessEnv = process.env) {
  // Safety invariant: failure injection is opt-in twice and only works in dry-run mode.
  // This prevents a stale SMS_FORCE_FAILURE=true inherited from a shell, CI runner,
  // or machine-level environment variable from breaking normal local SMS testing.
  return (
    smsEnvFlag(env.SMS_DRY_RUN) &&
    smsEnvFlag(env.SMS_ENABLE_FAILURE_INJECTION) &&
    smsEnvFlag(env.SMS_FORCE_FAILURE)
  );
}

export function smsRetryDelaySeconds(attemptNumber: number) {
  return Math.min(15 * 60, 30 * 2 ** Math.max(0, attemptNumber - 1));
}
