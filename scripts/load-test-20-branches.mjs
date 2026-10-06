import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Disposable fixtures must be provisioned in the dedicated TEST database.
// Never print their device tokens or run against a production URL.
const fixtures = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
assert.equal(fixtures.length, 20);
assert.equal(new Set(fixtures.map(f => f.branch_id)).size, 20);
const base = 'https://queuedrop-test.vercel.app';
const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(30000) });
const readiness = await health.json();
assert.equal(health.status, 200);
assert.equal(readiness.environment, 'preview');
assert.equal(readiness.database, 'ok');
const timings = [];
const tickets = new Set();
const started = performance.now();
for (let round = 0; round < 5; round++) {
  await Promise.all(fixtures.map(async fixture => {
    const requestId = randomUUID();
    const issue = async () => {
      const before = performance.now();
      const response = await fetch(`${base}/api/kiosk/${fixture.device_token}/ticket`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: fixture.service_id, requestId }),
        signal: AbortSignal.timeout(30000),
      });
      const body = await response.json();
      timings.push(performance.now() - before);
      assert.equal(response.status, 200, `Branch response ${response.status}: ${body.error ?? ''}`);
      return body;
    };
    const [first, duplicate] = await Promise.all([issue(), issue()]);
    const id = first.ticket_id ?? first.id;
    assert.ok(id, 'Ticket ID required');
    assert.equal(id, duplicate.ticket_id ?? duplicate.id, 'Duplicate request issued a second ticket');
    assert.equal(first.display_number, duplicate.display_number);
    assert.ok(String(first.display_number).endsWith(String(fixture.expectedStart + round)));
    assert.ok(!tickets.has(id), 'Different requests reused a ticket');
    tickets.add(id);
  }));
}
timings.sort((a,b) => a-b);
const result = {
  revision: readiness.revision, branches: 20, concurrentRequestsPerWave: 40,
  requests: timings.length, uniqueTickets: tickets.size, duplicatePairs: 100,
  totalSeconds: Number(((performance.now()-started)/1000).toFixed(2)),
  latencyMs: { p50: Math.round(timings[Math.floor(timings.length*.5)]), p95: Math.round(timings[Math.floor(timings.length*.95)]), max: Math.round(timings.at(-1)) },
  passed: true,
};
assert.equal(result.requests, 200);
assert.equal(result.uniqueTickets, 100);
console.log(JSON.stringify(result, null, 2));
