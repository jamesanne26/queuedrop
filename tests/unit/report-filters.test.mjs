import test from "node:test";
import assert from "node:assert/strict";
import { parseReportStatus } from "../../lib/reports/filters.ts";

test("unfinished end-of-day tickets retain their export status filter", () => {
  assert.equal(parseReportStatus("not_completed"), "not_completed");
});
test("report status parsing preserves every supported queue state", () => {
  for (const state of ["all", "waiting", "called", "serving", "completed", "cancelled", "no_show"]) assert.equal(parseReportStatus(state), state);
});
test("missing or unknown report statuses safely use the all-status view", () => {
  for (const value of [undefined, null, "", "invalid", "completed&status=all"]) assert.equal(parseReportStatus(value), "all");
});
