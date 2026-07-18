import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/*
  Phase 13 — the two-database boundary, enforced as a test.

  Admin-surface code must reach Platform data ONLY through the bridge
  (src/lib/admin/bridge.ts). This scans every admin file and fails if any of them
  imports the Platform Prisma client directly — the exact regression the boundary
  is meant to prevent. Static analysis, so it needs no database.
*/

const SRC = join(process.cwd(), "src");
// Admin-surface trees. bridge.ts is the ONE sanctioned platform-DB importer.
const ADMIN_DIRS = [join(SRC, "app", "admin"), join(SRC, "features", "admin"), join(SRC, "lib", "admin")];
const BRIDGE = join(SRC, "lib", "admin", "bridge.ts");
const FORBIDDEN = /from\s+["'](@\/lib\/platformDb|.*\/platformDb)["']/;

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // dir may not exist in every layout
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

test("no admin-surface file imports the Platform DB directly (only the bridge may)", () => {
  const offenders: string[] = [];
  for (const dir of ADMIN_DIRS) {
    for (const file of walk(dir)) {
      if (file === BRIDGE) continue;
      if (FORBIDDEN.test(readFileSync(file, "utf8"))) {
        offenders.push(relative(SRC, file).split(sep).join("/"));
      }
    }
  }
  assert.deepEqual(offenders, [], `Admin files bypassing the bridge: ${offenders.join(", ")}`);
});

test("the bridge itself DOES import the Platform DB (guards against a false-negative scan)", () => {
  assert.match(readFileSync(BRIDGE, "utf8"), /platformDb/, "bridge should import platformDb");
});
