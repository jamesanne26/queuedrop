"use client";

import { useState } from "react";

type Rule = { position: number; send_sms_once: boolean; browser_notification: boolean };

export function PositionRules({ initialRules }: { initialRules: Rule[] }) {
  const [rules, setRules] = useState<Rule[]>(initialRules.length ? initialRules : [1, 2, 3].map((position) => ({ position, send_sms_once: false, browser_notification: false })));

  function update(index: number, patch: Partial<Rule>) {
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  return (
    <div className="position-rules-list">
      {rules.map((rule, index) => (
        <div className="position-rule-row" key={`${index}-${rule.position}`}>
          <label>
            Position
            <input name={`position_rule_${index}_position`} type="number" min={1} max={9999} value={rule.position} onChange={(e) => update(index, { position: Number(e.target.value) })} />
          </label>
          <label className="compact-check"><input name={`position_rule_${index}_browser`} type="checkbox" checked={rule.browser_notification} onChange={(e) => update(index, { browser_notification: e.target.checked })} /><span>Browser notification</span></label>
          <label className="compact-check"><input name={`position_rule_${index}_sms`} type="checkbox" checked={rule.send_sms_once} onChange={(e) => update(index, { send_sms_once: e.target.checked })} /><span>Enable automatic SMS</span></label>
          <button className="button button-danger button-small" type="button" onClick={() => setRules((current) => current.filter((_, i) => i !== index))}>Remove</button>
        </div>
      ))}
      <input type="hidden" name="position_rule_count" value={rules.length} />
      <button className="button button-secondary button-small" type="button" onClick={() => setRules((current) => [...current, { position: Math.max(1, ...current.map((r) => r.position)) + 1, send_sms_once: false, browser_notification: false }])}>+ Add position rule</button>
      <p className="muted">Choose browser and SMS delivery separately for every queue position. Automatic SMS is off by default.</p>
    </div>
  );
}
