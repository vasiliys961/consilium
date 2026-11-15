import assert from "node:assert/strict";
import test from "node:test";
import { createQueue, deadlineOf, MAX_DEADLINE_MS } from "./queue.ts";

test("the case queue holds two opens and the deadline stays within five minutes", () => {
  const queue = createQueue(2);
  const first = queue.tryEnter();
  const second = queue.tryEnter();
  assert.equal(queue.tryEnter(), null);
  first?.();
  assert.ok(queue.tryEnter());
  assert.equal(deadlineOf(900_000), MAX_DEADLINE_MS);
  assert.equal(deadlineOf(12_000), 12_000);
  assert.equal(deadlineOf(undefined), MAX_DEADLINE_MS);
});
