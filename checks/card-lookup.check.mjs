import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { resolveCardInputs } from "../card-lookup.mjs";
import { passcode } from "../extract-card-rules.mjs";

function database(t) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE texts (id INTEGER PRIMARY KEY, name TEXT)");
  const insert = db.prepare("INSERT INTO texts VALUES (?, ?)");
  for (const [id, name] of [
    [9000001, "Example Recruiter"], [9000002, "Example Recruiter Guard"],
    [9000003, "Example, the Wanderer"], [9000004, "Example's Scout - Dawn"],
    [9000005, "123"], [9000006, "Duplicate Example"], [9000007, "Duplicate Example"]
  ]) insert.run(id, name);
  t.after(() => db.close());
  return (inputs, options) => resolveCardInputs(inputs, db, passcode, options);
}

test("names use exact matches before unique partial matches and preserve canonical passcodes", t => {
  const resolve = database(t);
  assert.deepEqual(resolve([" example   RECRUITER "]), [{ passcode: "09000001" }]);
  assert.deepEqual(resolve(["wanderer"]), [{ passcode: "09000003" }]);
  assert.deepEqual(resolve(["Example, the Wanderer"]), [{ passcode: "09000003" }]);
  assert.deepEqual(resolve(["EXAMPLE’S SCOUT — DAWN"]), [{ passcode: "09000004" }]);
  assert.deepEqual(resolve(["9000001", "Example Recruiter", "09000001", "wanderer"]), [{ passcode: "09000001" }, { passcode: "09000003" }]);
  assert.deepEqual(resolve([{ name: "123" }]), [{ passcode: "09000005" }]);
  assert.deepEqual(resolve(["123"]), [{ passcode: "00000123" }], "unflagged numeric input remains a passcode");
});

test("optional fuzzy matching ranks typo candidates deterministically without accepting unrelated names", t => {
  const resolve = database(t);
  assert.equal(resolve(["recrutier"])[0].candidateCount, 0, "default callers retain strict matching");
  const [fuzzy] = resolve(["recrutier"], { fuzzy: true });
  assert.equal(fuzzy.candidates[0].passcode, "09000001");
  assert.equal(fuzzy.candidates[1].passcode, "09000002");
  assert.ok(fuzzy.candidates.every(card => card.score > 0 && card.score <= 1));
  assert.deepEqual(resolve(["wanderre"], { fuzzy: true }), [{ passcode: "09000003" }]);
  assert.deepEqual(resolve(["Example Recruiter"], { fuzzy: true }), [{ passcode: "09000001" }]);
  assert.equal(resolve(["zzxqqvv"], { fuzzy: true })[0].candidateCount, 0);
});

test("ambiguous, duplicate and missing names never silently choose a card", t => {
  const resolve = database(t);
  const [partial] = resolve(["recruiter"]);
  assert.equal(partial.status, "unsupported");
  assert.match(partial.reason, /Ambiguous/);
  assert.deepEqual(partial.candidates.map(card => card.passcode), ["09000001", "09000002"]);
  assert.equal(resolve(["Duplicate Example"])[0].candidateCount, 2);
  const [missing] = resolve(["not a known card"]);
  assert.match(missing.reason, /No card name matches/);
  assert.deepEqual(missing.candidates, []);
  assert.equal(resolve(["%"])[0].status, "unsupported", "SQL wildcards are treated literally");
  assert.equal(resolve(["' OR 1=1 --"])[0].candidateCount, 0);
  assert.equal(resolve([" "])[0].status, "unsupported");
  assert.equal(resolve(["x".repeat(161)])[0].status, "unsupported");
});
