/**
 * Behavioral unit tests for the pure research-task lifecycle helper.
 * Run via `node --import tsx --test` (the `pnpm test` suite).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedNextStatuses,
  isValidTaskTransition,
  TASK_DONE_NOTES_MIN,
} from "@/lib/operations/taskLifecycle";

test("legal forward transitions are allowed", () => {
  assert.equal(isValidTaskTransition("todo", "in_progress"), true); // claim
  assert.equal(isValidTaskTransition("in_progress", "done"), true); // complete
  assert.equal(isValidTaskTransition("in_progress", "todo"), true); // release
  assert.equal(isValidTaskTransition("in_progress", "blocked"), true); // block
  assert.equal(isValidTaskTransition("blocked", "in_progress"), true); // unblock
  assert.equal(isValidTaskTransition("done", "in_progress"), true); // reopen
});

test("self-transitions and illegal jumps are rejected", () => {
  assert.equal(isValidTaskTransition("todo", "todo"), false);
  assert.equal(isValidTaskTransition("done", "done"), false);
  assert.equal(isValidTaskTransition("done", "blocked"), false);
});

test("allowedNextStatuses reflects the transition map", () => {
  assert.deepEqual([...allowedNextStatuses("todo")].sort(), ["blocked", "done", "in_progress"]);
  assert.deepEqual([...allowedNextStatuses("done")].sort(), ["in_progress", "todo"]);
});

test("done notes floor is the agent-quality-gate floor", () => {
  assert.equal(TASK_DONE_NOTES_MIN, 20);
});
