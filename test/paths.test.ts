import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isInsideWorkspace, safeResolve, WORKSPACE_ROOT, OutsideWorkspaceError } from "../lib/paths.ts";

test("the workspace itself is inside the workspace", () => {
  assert.equal(safeResolve(WORKSPACE_ROOT), safeResolve(WORKSPACE_ROOT));
  assert.ok(isInsideWorkspace(WORKSPACE_ROOT));
});

test("a real project resolves", () => {
  assert.ok(isInsideWorkspace("Projects/APEX-UI"));
});

test("paths outside the workspace are refused", () => {
  for (const bad of ["/etc", "/etc/passwd", "~", "/", "/Users"]) {
    assert.equal(isInsideWorkspace(bad), false, `${bad} should be refused`);
  }
});

test("traversal out of the workspace is refused", () => {
  assert.equal(isInsideWorkspace("Projects/../../.."), false);
  assert.equal(isInsideWorkspace("../../../etc"), false);
});

test("a path that does not exist is refused rather than assumed", () => {
  assert.equal(isInsideWorkspace("Projects/definitely-not-a-real-project-xyz"), false);
});

test("safeResolve throws the typed error", () => {
  assert.throws(() => safeResolve("/etc/passwd"), OutsideWorkspaceError);
});
