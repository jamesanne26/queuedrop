import test from "node:test";
import assert from "node:assert/strict";
import { recalculateQueuePositions } from "../../lib/queue/positions.ts";

const ticket = (id, service, number, status = "waiting", position = null) => ({ id, service_id: service, ticket_number: number, status, position });

test("assigns positions by ticket number", () => {
  const result = recalculateQueuePositions([ticket("b", "hair", 2), ticket("a", "hair", 1), ticket("c", "hair", 3)]);
  assert.deepEqual(result.map((x) => [x.id, x.position]), [["b", 2], ["a", 1], ["c", 3]]);
});

test("calculates positions independently per service", () => {
  const result = recalculateQueuePositions([ticket("h2", "hair", 2), ticket("n1", "nails", 1), ticket("h1", "hair", 1), ticket("n3", "nails", 3)]);
  assert.deepEqual(Object.fromEntries(result.map((x) => [x.id, x.position])), { h2: 2, n1: 1, h1: 1, n3: 2 });
});

test("called and serving tickets have no waiting position", () => {
  const result = recalculateQueuePositions([ticket("a", "hair", 1, "called", 9), ticket("b", "hair", 2, "serving", 9)]);
  assert.deepEqual(result.map((x) => x.position), [null, null]);
});

test("non-waiting tickets do not consume a waiting position", () => {
  const result = recalculateQueuePositions([ticket("called", "hair", 1, "called"), ticket("waiting", "hair", 2)]);
  assert.equal(result.find((x) => x.id === "waiting")?.position, 1);
});

test("does not mutate input array or ticket objects", () => {
  const input = [ticket("b", "hair", 2), ticket("a", "hair", 1)];
  const snapshot = JSON.stringify(input);
  const result = recalculateQueuePositions(input);
  assert.equal(JSON.stringify(input), snapshot);
  assert.notEqual(result, input);
  assert.notEqual(result[0], input[0]);
});

test("empty queue remains empty", () => assert.deepEqual(recalculateQueuePositions([]), []));

test("single waiting ticket starts at one", () => assert.equal(recalculateQueuePositions([ticket("a", "hair", 99)])[0].position, 1));

test("recalculation removes stale positions", () => {
  const result = recalculateQueuePositions([ticket("a", "hair", 10, "waiting", 8), ticket("b", "hair", 20, "waiting", 9)]);
  assert.deepEqual(result.map((x) => x.position), [1, 2]);
});
