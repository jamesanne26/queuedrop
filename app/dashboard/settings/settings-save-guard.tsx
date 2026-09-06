"use client";

import { useEffect, useRef, useState } from "react";

type Change = {
  field: string;
  label: string;
  before: string;
  after: string;
  kind?: "added" | "updated" | "removed" | "normal";
};

type Props = {
  branchName: string;
};

type Rule = {
  position: string;
  sms: string;
  browser: string;
};

const LABELS: Record<string, string> = {
  starting_number: "Starting number",
  no_show_minutes: "No-show grace period",
  timezone: "Branch timezone",
  is_active: "Queue active",
  show_branch_contact: "Show branch contact",
};

function prettyField(name: string) {
  if (LABELS[name]) return LABELS[name];

  const dayMatch = name.match(/^day_(\d+)_(open|open_time|close_time)$/);
  if (dayMatch) {
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    const suffix =
      dayMatch[2] === "open"
        ? "availability"
        : dayMatch[2] === "open_time"
          ? "open time"
          : "close time";

    return `${days[Number(dayMatch[1])] ?? "Day"} ${suffix}`;
  }

  return name
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formSnapshot(form: HTMLFormElement) {
  const result = new Map<string, string>();

  const elements = Array.from(form.elements) as Array<
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | HTMLButtonElement
  >;

  for (const element of elements) {
    const name = element.name;

    if (!name || name === "branch_id") continue;
    if (element instanceof HTMLButtonElement) continue;

    if (
      element instanceof HTMLInputElement &&
      (element.type === "checkbox" || element.type === "radio")
    ) {
      result.set(name, element.checked ? "Yes" : "No");
      continue;
    }

    result.set(name, element.value ?? "");
  }

  return result;
}

function ruleCount(snapshot: Map<string, string>) {
  const explicit = Number(snapshot.get("position_rule_count") ?? "0");
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  return 0;
}

function rulesFrom(snapshot: Map<string, string>) {
  const count = ruleCount(snapshot);
  const rules: Rule[] = [];

  for (let index = 0; index < count; index += 1) {
    rules.push({
      position: snapshot.get(`position_rule_${index}_position`) ?? "",
      sms: snapshot.get(`position_rule_${index}_sms`) ?? "No",
      browser: snapshot.get(`position_rule_${index}_browser`) ?? "No",
    });
  }

  return rules;
}

function ruleText(rule: Rule) {
  return `Position ${rule.position || "-"} - SMS ${rule.sms} - Browser ${rule.browser}`;
}

function isPositionRuleField(name: string) {
  return name === "position_rule_count" || name.startsWith("position_rule_");
}

export function SettingsSaveGuard({ branchName }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const initialRef = useRef<Map<string, string> | null>(null);
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<Change[]>([]);

  useEffect(() => {
    const form = buttonRef.current?.closest("form");
    if (!form) return;

    // Capture after the controlled PositionRules component has mounted.
    requestAnimationFrame(() => {
      initialRef.current = formSnapshot(form);
    });
  }, []);

  useEffect(() => {
    document.body.dataset.qdModalOpen = open ? "true" : "false";

    return () => {
      delete document.body.dataset.qdModalOpen;
    };
  }, [open]);

  const hasChanges = changes.length > 0;

  function reviewChanges() {
    const form = buttonRef.current?.closest("form");
    if (!form) return;

    const initial = initialRef.current ?? formSnapshot(form);
    const current = formSnapshot(form);
    const next: Change[] = [];

    // First: summarize position rules semantically, not field-by-field.
    const beforeRules = rulesFrom(initial);
    const afterRules = rulesFrom(current);
    const sharedCount = Math.min(beforeRules.length, afterRules.length);

    for (let index = 0; index < sharedCount; index += 1) {
      const before = beforeRules[index];
      const after = afterRules[index];

      if (
        before.position !== after.position ||
        before.sms !== after.sms ||
        before.browser !== after.browser
      ) {
        next.push({
          field: `position_rule_${index}`,
          label: "Updated position rule",
          before: ruleText(before),
          after: ruleText(after),
          kind: "updated",
        });
      }
    }

    for (let index = sharedCount; index < afterRules.length; index += 1) {
      next.push({
        field: `position_rule_${index}`,
        label: "Added position rule",
        before: "No rule",
        after: ruleText(afterRules[index]),
        kind: "added",
      });
    }

    for (let index = sharedCount; index < beforeRules.length; index += 1) {
      next.push({
        field: `position_rule_${index}`,
        label: "Removed position rule",
        before: ruleText(beforeRules[index]),
        after: "Removed",
        kind: "removed",
      });
    }

    // Then: all non-position-rule settings are listed independently.
    const names = new Set([...initial.keys(), ...current.keys()]);

    for (const name of names) {
      if (isPositionRuleField(name)) continue;

      const before = initial.get(name) ?? "";
      const after = current.get(name) ?? "";

      if (before === after) continue;

      next.push({
        field: name,
        label: prettyField(name),
        before: before || "-",
        after: after || "-",
        kind: "normal",
      });
    }

    setChanges(next);
    setOpen(true);
  }

  function confirmSave() {
    const form = buttonRef.current?.closest("form");
    if (!form) return;

    setOpen(false);
    form.requestSubmit();
  }

  return (
    <>
      <button
        ref={buttonRef}
        className="button button-primary"
        type="button"
        style={{ flexShrink: 0 }}
        onClick={reviewChanges}
      >
        Save branch settings
      </button>

      {open ? (
        <div className="qd-modal-backdrop" role="presentation">
          <section
            className="qd-modal qd-settings-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-review-title"
          >
            <div className="qd-modal-header">
              <div>
                <p className="eyebrow">Review changes</p>
                <h2 id="settings-review-title">{branchName}</h2>
              </div>
            </div>

            {hasChanges ? (
              <div className="qd-settings-change-list">
                {changes.map((change, index) => (
                  <article
                    className={`qd-settings-change-row qd-settings-change-${change.kind ?? "normal"}`}
                    key={`${change.field}:${index}`}
                  >
                    <strong>{change.label}</strong>
                    <div>
                      <span>{change.before}</span>
                      <b>→</b>
                      <span>{change.after}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="notice qd-no-changes-notice">
                No changes were made to the branch settings.
              </div>
            )}

            <div className="qd-modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setOpen(false)}
              >
                {hasChanges ? "Cancel" : "Close"}
              </button>

              {hasChanges ? (
                <button
                  className="button button-primary"
                  type="button"
                  onClick={confirmSave}
                >
                  Confirm save
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
