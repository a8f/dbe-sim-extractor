import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assessEffectCoverage, validateEffectInventory } from "../effect-coverage.mjs";
import { compileHistoricalRule } from "../historical-rulings.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const source = { passcode: "09000001", name: "Example Sender", text: "Example summon procedure. Example ignition effect.", lua: "-- synthetic unsupported Lua" };
function reviewFixture() {
  return { name: source.name, status: "approved", sources: ["https://example.test/review"], reviewedOn: "2026-10-17",
    effect: { kind: "field-ignition-discard-send-from-deck", attribute: "DARK" },
    effectInventory: { textSha256: hash(source.text), scriptSha256: hash(source.lua), effects: [
      { id: "summon", label: "Example summon procedure", status: "unsupported", reason: "A summon procedure adapter needs implementation; play manually." },
      { id: "ignition", label: "Example ignition effect", status: "implemented", kind: "field-ignition-discard-send-from-deck" }
    ] } };
}

test("partial effect inventory lists the missing implementation without blocking a supported action", () => {
  const review = reviewFixture(), result = assessEffectCoverage(source, review);
  assert.equal(result.status, "partial"); assert.equal(result.implemented, 1); assert.equal(result.total, 2);
  assert.match(result.warnings[0], /Effect not implemented: Example summon procedure.*needs implementation/);
  const rule = compileHistoricalRule(source, review);
  assert.equal(rule.action.resolution[0].op, "send-to-graveyard");
  const without = structuredClone(review); delete without.effectInventory;
  assert.deepEqual(compileHistoricalRule(source, without), rule, "coverage metadata is not an executable action");
  result.effects[0].label = "Changed";
  assert.equal(review.effectInventory.effects[0].label, "Example summon procedure");
});

test("complete coverage requires matching reviewed sources; missing or stale inventories stay unverified", () => {
  const review = reviewFixture(); review.effectInventory.effects.shift();
  assert.equal(assessEffectCoverage(source, review).status, "complete");
  assert.deepEqual(assessEffectCoverage(source, review).warnings, []);
  for (const patch of [{ text: source.text + " Another effect." }, { lua: source.lua + " changed" }, { text: undefined }, { lua: undefined }]) {
    const result = assessEffectCoverage({ ...source, ...patch }, review);
    assert.equal(result.status, "unverified"); assert.match(result.warnings[0], /review all effects again/);
  }
  const missing = assessEffectCoverage(source, {});
  assert.equal(missing.status, "unverified"); assert.match(missing.warnings[0], /no reviewed effect inventory/);
  assert.equal(assessEffectCoverage(source).status, "unverified");
  const stalePartial = assessEffectCoverage({ ...source, text: "changed" }, reviewFixture());
  assert.equal(stalePartial.warnings.length, 2, "known gaps remain visible even when sources change");
});

test("inventories reject unsupported implementation claims, missing reasons and ambiguous effect mappings", () => {
  for (const mutate of [
    inventory => inventory.textSha256 = "invalid", inventory => inventory.scriptSha256 = "invalid",
    inventory => inventory.extra = true, inventory => inventory.effects = [],
    inventory => inventory.effects[0].status = "implemented", inventory => delete inventory.effects[0].reason,
    inventory => inventory.effects[0].kind = "field-ignition-discard-send-from-deck",
    inventory => inventory.effects[1].kind = "unknown-adapter", inventory => inventory.effects[1].extra = true,
    inventory => inventory.effects[1].reason = "not really implemented", inventory => inventory.effects[0].id = "ignition",
    inventory => inventory.effects.push(structuredClone(inventory.effects[1])),
    inventory => inventory.effects = [inventory.effects[0]]
  ]) {
    const review = reviewFixture(); mutate(review.effectInventory);
    assert.throws(() => validateEffectInventory(review));
    assert.throws(() => compileHistoricalRule(source, review), "compiler also rejects malformed coverage at the write boundary");
  }
});
