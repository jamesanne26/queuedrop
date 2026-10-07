export const REPORT_STATUSES = ["all", "waiting", "called", "serving", "completed", "cancelled", "no_show", "not_completed"] as const;

export function parseReportStatus(value: string | null | undefined) {
  return REPORT_STATUSES.find((status) => status === value) ?? "all";
}
