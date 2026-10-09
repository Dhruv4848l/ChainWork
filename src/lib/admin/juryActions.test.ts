import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  F2 as a test. The voting server actions are callable from any browser, so a juror id
  among their parameters would let one console login vote as somebody else. The juror
  must come from the session (`currentJuror()`), never from the caller. Static check —
  no database needed.
*/
const ACTIONS = readFileSync(join(process.cwd(), "src", "features", "admin", "actions.ts"), "utf8");

for (const name of ["commitVoteAction", "revealVoteAction", "finalizeVerdictAction", "appealCaseAction"]) {
  test(`${name} takes no juror id from the browser`, () => {
    const m = ACTIONS.match(new RegExp(`export async function ${name}\\(([^)]*)\\)`));
    assert.ok(m, `${name} not found`);
    assert.doesNotMatch(m[1], /juror/i);
  });
}

test("commit and reveal resolve the juror from the session", () => {
  for (const name of ["commitVoteAction", "revealVoteAction"]) {
    const body = ACTIONS.slice(ACTIONS.indexOf(`export async function ${name}`)).split("\nexport ")[0];
    assert.match(body, /await currentJuror\(\)/, `${name} must call currentJuror()`);
  }
});
