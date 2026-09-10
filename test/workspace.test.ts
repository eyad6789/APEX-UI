import { strict as assert } from "node:assert";
import { test } from "node:test";
import { findProjects, scanWorkspace, compactList, type Project } from "../lib/workspace/index.ts";

const fake = (name: string, rel = `Projects/${name}`): Project => ({
  name, rel, path: `/w/${rel}`, kind: "folder", modified: new Date().toISOString(),
});

test("the real workspace scans and finds APEX-UI", () => {
  const projects = scanWorkspace();
  assert.ok(projects.length > 10, "expected a populated workspace");
  assert.ok(projects.some((p) => p.name === "APEX-UI"));
});

test("APEX-UI is detected as a next project", () => {
  const apex = scanWorkspace().find((p) => p.name === "APEX-UI");
  assert.equal(apex?.kind, "next");
});

test("exact name wins over substring", () => {
  const projects = [fake("MARSAD"), fake("MARSAD-wt")];
  assert.deepEqual(findProjects("MARSAD", projects).map((p) => p.name), ["MARSAD"]);
});

test("case and separators do not matter", () => {
  const projects = [fake("APEX-UI")];
  assert.equal(findProjects("apex ui", projects).length, 1);
  assert.equal(findProjects("apexui", projects).length, 1);
});

test("an ambiguous query returns every candidate so the caller can ask", () => {
  const projects = [fake("Geo_Erp"), fake("Geo_Landing")];
  assert.equal(findProjects("geo", projects).length, 2);
});

test("a short query does not match everything by accident", () => {
  const projects = [fake("MARSAD"), fake("Branding"), fake("Foundation")];
  assert.deepEqual(findProjects("mars", projects).map((p) => p.name), ["MARSAD"]);
});

test("the compact list stays small enough for a prompt", () => {
  const text = compactList();
  assert.ok(text.length < 8000, `prompt list was ${text.length} chars`);
});
