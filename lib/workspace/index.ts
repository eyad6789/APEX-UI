import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { WORKSPACE_ROOT, safeResolve } from "@/lib/paths";

/**
 * What Mey knows about the workspace.
 *
 * Shallow on purpose: the workspace is ~14GB across 132 projects, so this records
 * what each project IS, never what is in it. Depth is fetched per project, on demand
 * (see projectDetail), which keeps the system prompt to a few kilobytes.
 *
 * Branch comes from reading .git/HEAD rather than shelling out - 132 `git` calls
 * would take seconds. Whether a repo is dirty is a detail-level question.
 */

const CACHE = resolve(process.cwd(), "data", "workspace-index.json");
const TTL_MS = 5 * 60 * 1000;
const SKIP = new Set(["node_modules", "Library", "Applications", ".git", ".trash"]);

export type Project = {
  name: string;
  /** Relative to the workspace root, e.g. "Projects/MARSAD". */
  rel: string;
  path: string;
  /** "next", "expo", "python", … or "folder" when nothing identifies it. */
  kind: string;
  /** ISO date of the last change to the directory itself. */
  modified: string;
  branch?: string;
};

type Cache = { scannedAt: string; projects: Project[] };

/** Marker file → what kind of project this is. First match wins, so order matters. */
const MARKERS: Array<[string, string]> = [
  ["pubspec.yaml", "flutter"],
  ["Cargo.toml", "rust"],
  ["go.mod", "go"],
  ["requirements.txt", "python"],
  ["pyproject.toml", "python"],
  ["Gemfile", "ruby"],
  ["composer.json", "php"],
  ["docker-compose.yml", "docker"],
];

function detectKind(dir: string): string {
  const pkg = join(dir, "package.json");
  if (existsSync(pkg)) {
    try {
      const json = JSON.parse(readFileSync(pkg, "utf8"));
      const deps = { ...json.dependencies, ...json.devDependencies };
      if (deps.next) return "next";
      if (deps.expo) return "expo";
      if (deps["react-native"]) return "react-native";
      if (deps.react) return "react";
      if (deps.express || deps.fastify) return "node-api";
      return "node";
    } catch {
      return "node";
    }
  }
  for (const [file, kind] of MARKERS) if (existsSync(join(dir, file))) return kind;
  try {
    if (readdirSync(dir).some((f) => f.endsWith(".xcodeproj") || f.endsWith(".xcworkspace"))) return "ios";
  } catch { /* unreadable, treat as plain */ }
  return "folder";
}

/** Current branch straight out of .git/HEAD. No subprocess. */
function branchOf(dir: string): string | undefined {
  try {
    const head = readFileSync(join(dir, ".git", "HEAD"), "utf8").trim();
    const match = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    return match ? match[1] : head.slice(0, 7);   // detached: short sha
  } catch {
    return undefined;
  }
}

function describe(dir: string, rel: string): Project | null {
  let stats;
  try {
    stats = statSync(dir);
  } catch {
    return null;
  }
  if (!stats.isDirectory()) return null;
  return {
    name: rel.split("/").pop() ?? rel,
    rel,
    path: dir,
    kind: detectKind(dir),
    modified: stats.mtime.toISOString(),
    branch: branchOf(dir),
  };
}

function childDirs(parent: string): string[] {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP.has(e.name))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** One level of the workspace, plus one level of Projects/. */
export function scanWorkspace(): Project[] {
  const found: Project[] = [];

  for (const name of childDirs(WORKSPACE_ROOT)) {
    if (name === "Projects") continue;                       // enumerated below
    const project = describe(join(WORKSPACE_ROOT, name), name);
    if (project) found.push(project);
  }

  const projectsDir = join(WORKSPACE_ROOT, "Projects");
  for (const name of childDirs(projectsDir)) {
    const project = describe(join(projectsDir, name), `Projects/${name}`);
    if (project) found.push(project);
  }

  return found.sort((a, b) => b.modified.localeCompare(a.modified));
}

/** The index, rescanning only when the cache has gone stale. */
export function loadIndex(maxAgeMs = TTL_MS): Project[] {
  try {
    const cache: Cache = JSON.parse(readFileSync(CACHE, "utf8"));
    if (Date.now() - new Date(cache.scannedAt).getTime() < maxAgeMs && cache.projects?.length) {
      return cache.projects;
    }
  } catch { /* no cache yet, or unreadable - rescan */ }

  const projects = scanWorkspace();
  try {
    mkdirSync(resolve(process.cwd(), "data"), { recursive: true });
    writeFileSync(CACHE, JSON.stringify({ scannedAt: new Date().toISOString(), projects } satisfies Cache, null, 2));
  } catch (e) {
    console.warn("[workspace] could not cache the index:", (e as Error).message);
  }
  return projects;
}

/**
 * Find what the user meant. Exact name first, then prefix, then substring - so
 * "marsad" finds MARSAD without "ar" matching half the workspace.
 * Returns every candidate; one match is an answer, several is a question.
 */
export function findProjects(query: string, projects = loadIndex()): Project[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const exact = projects.filter((p) => p.name.toLowerCase() === q);
  if (exact.length) return exact;

  const normalised = (s: string) => s.toLowerCase().replace(/[-_ ]/g, "");
  const exactLoose = projects.filter((p) => normalised(p.name) === normalised(q));
  if (exactLoose.length) return exactLoose;

  const prefix = projects.filter((p) => p.name.toLowerCase().startsWith(q));
  if (prefix.length) return prefix;

  return projects.filter((p) => normalised(p.name).includes(normalised(q)));
}

function sinceWords(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/** The compact list that goes in the system prompt. */
export function compactList(projects = loadIndex(), limit = 60): string {
  const lines = projects.slice(0, limit).map((p) => {
    const branch = p.branch ? `, ${p.branch}` : "";
    return `- ${p.name} (${p.kind}${branch}) touched ${sinceWords(p.modified)}`;
  });
  const rest = projects.length - lines.length;
  if (rest > 0) lines.push(`- …and ${rest} older projects; ask for a detail if you need one.`);
  return lines.join("\n");
}

/** Depth for one project: readme opening, recent commits, what is at the top level. */
export function projectDetail(name: string): string {
  const matches = findProjects(name);
  if (!matches.length) return `No project called "${name}" is in the workspace.`;
  if (matches.length > 1) return `Several projects match "${name}": ${matches.map((m) => m.name).join(", ")}.`;

  const project = matches[0];
  const dir = safeResolve(project.path);
  const parts = [`${project.name} — ${project.kind}, at ${project.rel}, last touched ${sinceWords(project.modified)}.`];

  for (const readme of ["README.md", "readme.md", "README.txt"]) {
    const file = join(dir, readme);
    if (existsSync(file)) {
      try {
        const head = readFileSync(file, "utf8").split("\n").slice(0, 12).join(" ").replace(/[#*`>]/g, "").replace(/\s+/g, " ").trim();
        if (head) parts.push(`Readme: ${head.slice(0, 400)}`);
      } catch { /* unreadable readme is not worth failing over */ }
      break;
    }
  }

  if (project.branch) {
    try {
      const log = execFileSync("git", ["-C", dir, "log", "-3", "--pretty=%s"], { encoding: "utf8", timeout: 3000 }).trim();
      if (log) parts.push(`Recent commits: ${log.split("\n").join("; ")}`);
      const status = execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8", timeout: 3000 }).trim();
      parts.push(status ? `Working tree has ${status.split("\n").length} uncommitted changes.` : "Working tree is clean.");
    } catch { /* not a healthy repo; the rest of the detail still stands */ }
  }

  const top = childDirs(dir).slice(0, 12);
  if (top.length) parts.push(`Contains: ${top.join(", ")}.`);

  return parts.join("\n");
}
