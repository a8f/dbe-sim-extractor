import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, mkdir, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { passcode, translate, extractCards as extractImpl, mergeRules as mergeImpl, writeRules as writeImpl } from "../extract-card-rules.mjs";
import core from "../schema-3.mjs";
import { profile, assessRuleset, assertDestination, applyRuleset, loadReviews } from "../rulesets.mjs";
import { compileHistoricalRule } from "../historical-rulings.mjs";
import { researchRulings } from "../research-rulings.mjs";
const mergeRules = (list, results, ruleset = "simulator", reviews) => mergeImpl(list, results, ruleset, reviews);
const writeRules = (filename, results, ruleset = "simulator", reviews) => writeImpl(filename, results, ruleset, reviews);
const extractCards = (ids, simulator, ruleset = "simulator", options = {}) => extractImpl(ids, simulator, ruleset, { research: false, ...options });

const lua = await readFile(new URL("./fixtures/ygopro/c9000001.lua", import.meta.url), "utf8");
const utility = `Auxiliary={} aux=Auxiliary
function Auxiliary.bfgcost(e,tp,eg,ep,ev,re,r,rp,chk)
 if chk==0 then return e:GetHandler():IsAbleToRemoveAsCost() end
 Duel.Remove(e:GetHandler(),POS_FACEUP,REASON_COST)
end`;
const source = { passcode: "09000001", name: "Example Recruiter" };
const lookup = id => ({ passcode: id, name: id === source.passcode ? source.name : "Example Target" });
const translateFixture = (script = lua, helper = utility) => translate(script, helper, source, lookup);
const supported = () => ({ passcode: source.passcode, status: "supported", rule: translateFixture() });
const list = () => ({ schemaVersion: 3, id: "test.edison", name: "Test Edison", version: "1.0.0", formats: ["ar", "au"], rules: [{ ...translateFixture(), id: "existing-recruiter" }] });

function reviewFixture() {
  return { status: "approved", name: source.name, reviewedOn: "2026-10-17", sources: ["https://example.test/historical"],
    effect: { kind: "graveyard-ignition-banish-summon-from-deck", summon: lookup("09000002"), positions: ["ATK", "DEF"] },
    corrections: [{ kind: "activation-prohibition", card: { passcode: "09000004", name: "Example Prohibition" }, summary: "Example prerequisite" },
      { kind: "no-monster-zone-destroy-deck-copy", summary: "Example conditional resolution" }],
    manualResponsibilities: ["Example timing remains manual"] };
}

test("external summon-choice review compiles generically, passes schema, and is rechecked at merge", () => {
  const review = { status: "approved", name: source.name, reviewedOn: "2026-10-17", sources: ["https://example.test/historical"],
    effect: { kind: "summon-trigger-search-or-destroy", monsterNamePrefixes: ["Example Family "],
      searchAbsentFaceUpCards: [{ passcode: "09000009", name: "Example Blocker" }] } };
  const rule = compileHistoricalRule(source, review);
  assert.equal(rule.requires.sourceZone, "monster"); assert.equal(rule.requires.ownTurn, false);
  assert.deepEqual(rule.activation, []); assert.equal(rule.resolution[0].op, "choose-search-or-destroy");
  const result = { ...source, status: "supported", rule };
  const destination = { ...list(), formats: ["er", "eu"] };
  assert.doesNotThrow(() => mergeRules(destination, [result], "edison", { [source.passcode]: review }));
  result.rule.resolution[0].monsterNamePrefixes.push("Unreviewed ");
  assert.throws(() => mergeRules(destination, [result], "edison", { [source.passcode]: review }), /does not match/);
  for (const patch of [{ extra: true }, { monsterNamePrefixes: [] }, { monsterNamePrefixes: ["Without boundary"] }]) {
    assert.throws(() => compileHistoricalRule(source, { ...review, effect: { ...review.effect, ...patch } }));
  }
  assert.throws(() => compileHistoricalRule(source, { ...review, corrections: reviewFixture().corrections }), /unsupported/);
});

async function sandbox(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "dbx-extract-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("passcodes retain zeroes; invalid IDs cannot become script paths", () => {
  assert.equal(passcode("9000001"), "09000001");
  assert.equal(passcode("09000001"), "09000001");
  for (const id of ["0", "00000000", "123456789", "../123", "1e3", "-1", ""]) assert.throws(() => passcode(id));
});

test("full script translation derives selectors and matches the runtime contract", () => {
  const rule = translateFixture();
  assert.deepEqual(rule.card, source);
  assert.deepEqual(rule.requires, { sourceZone: "graveyard", ownTurn: true, phases: ["M1", "M2"] });
  assert.deepEqual(rule.activation, [{ op: "banish", card: "source" }]);
  assert.deepEqual(rule.resolution, [{ op: "special-summon", from: "deck", card: { passcode: "09000002", name: "Example Target" }, positions: ["ATK", "DEF"] }]);
  assert.doesNotThrow(() => core.validateAutomationList(list()));
  assert.deepEqual(translateFixture("--[=[ ignored fake SetCountLimit(1) ]=]\n" + lua.replaceAll("\n", "\n\t")), rule);
});

test("never drops restrictions, extra effects, changed operations or altered costs", () => {
  const changes = [
    lua.replace("e1:SetCost", "e1:SetCountLimit(1) e1:SetCost"),
    lua.replace("LOCATION_GRAVE", "LOCATION_HAND"),
    lua.replace("LOCATION_DECK", "LOCATION_GRAVE"),
    lua.replace("POS_FACEUP", "POS_FACEUP_DEFENSE"),
    lua.replace("return c:IsCode", "return c:IsLevelBelow(4) and c:IsCode"),
    lua + "\nfunction c9000001.extra(c) c:RegisterEffect(Effect.CreateEffect(c)) end",
    lua.replace("false,false,POS_FACEUP", "true,false,POS_FACEUP"),
    lua.replace("and Duel.GetLocationCount(tp,LOCATION_MZONE)>0", ""),
    lua + "\n--[=[ unterminated"
  ];
  for (const script of changes) assert.throws(() => translateFixture(script));
  assert.throws(() => translateFixture(lua, utility.replace("REASON_COST", "REASON_EFFECT")), /bfgcost/);
  assert.throws(() => translateFixture(lua, utility + "\naux.bfgcost=other"), /bfgcost/);
});

test("upsert preserves rule IDs and list preferences; adds new cards without duplication", () => {
  const previous = { ...list(), enabled: true, formats: ["so"], version: "2.3.4" };
  previous.rules[0].label = "Old behavior";
  const next = mergeRules(previous, [supported()]);
  assert.equal(previous.rules[0].label, "Old behavior");
  assert.equal(next.rules[0].id, "existing-recruiter");
  assert.equal(next.enabled, true);
  assert.deepEqual(next.formats, ["so"]);
  assert.equal(next.version, "2.3.4");
  const other = { passcode: "09000003", status: "supported", rule: { ...translateFixture(), id: "ygopro-09000003", card: { passcode: "09000003", name: "Another Recruiter" } } };
  const added = mergeRules(next, [other]);
  assert.equal(added.rules.length, 2);
  assert.deepEqual(mergeRules(added, [other]), added);
  assert.throws(() => mergeRules(next, [supported(), { status: "unsupported" }]), /every requested/);
  assert.throws(() => mergeRules({ ...list(), rules: [...list().rules, { ...list().rules[0], id: "other-effect" }] }, [supported()]), /multiple existing effects/);
  assert.throws(() => mergeRules({ ...list(), rules: [other.rule] }, [{ ...supported(), rule: { ...supported().rule, id: other.rule.id } }]), /Invalid rules list/);
});

test("failed batches leave file bytes intact; successful writes are validated and idempotent", async t => {
  const dir = await sandbox(t);
  const filename = path.join(dir, "edison.json");
  const old = list(); old.rules[0].label = "Old behavior";
  const bytes = JSON.stringify(old);
  await writeFile(filename, bytes);
  await assert.rejects(writeRules(filename, [supported(), { status: "unsupported" }]), /every requested/);
  assert.equal(await readFile(filename, "utf8"), bytes);
  assert.equal((await writeRules(filename, [supported()])).changed, true);
  const updated = await readFile(filename, "utf8");
  assert.doesNotThrow(() => core.importAutomationList(updated));
  assert.equal((await writeRules(filename, [supported()])).changed, false);
  assert.equal(await readFile(filename, "utf8"), updated);
  assert.deepEqual(await readdir(dir), ["edison.json"]);
});

test("SQLite + Lua extraction and CLI batch writing work without the installed simulator", async t => {
  const dir = await sandbox(t);
  const sim = path.join(dir, "YGOPRO");
  await mkdir(path.join(sim, "script"), { recursive: true });
  const db = new DatabaseSync(path.join(sim, "cards.cdb"));
  db.exec("CREATE TABLE texts (id INTEGER PRIMARY KEY, name TEXT, desc TEXT)");
  const insert = db.prepare("INSERT INTO texts VALUES (?, ?, ?)");
  insert.run(9000001, source.name, "Example source text");
  insert.run(9000002, "Example Target", "Example target text");
  insert.run(9000003, "Unsupported Example", "Other effect");
  db.close();
  await writeFile(path.join(sim, "script", "c9000001.lua"), lua);
  await writeFile(path.join(sim, "script", "c9000003.lua"), "function c9000003.initial_effect(c) end");
  await writeFile(path.join(sim, "script", "utility.lua"), utility);
  const results = await extractCards(["09000001", "9000001", "9000003", "9000002", "99999999"], dir);
  assert.equal(results.length, 4, "deduplicate normalized IDs");
  assert.equal(results[0].status, "supported");
  assert.equal(results[0].text, "Example source text");
  assert.match(results[0].scriptSha256, /^[a-f0-9]{64}$/);
  assert.equal(results[1].status, "unsupported");
  assert.equal(results[1].lua, "function c9000003.initial_effect(c) end");
  assert.match(results[2].reason, /ENOENT/);
  assert.match(results[3].reason, /not found/);
  assert.equal((await extractCards(["9000001"], path.join(sim, "script")))[0].status, "supported");
  const filename = path.join(dir, "edison.json");
  const old = list(); old.rules[0].label = "Old behavior";
  const original = JSON.stringify(old);
  await writeFile(filename, original);
  const cli = fileURLToPath(new URL("../extract-card-rules.mjs", import.meta.url));
  const run = args => spawnSync(process.execPath, [cli, ...args, "--simulator", sim, "--ruleset", "simulator"], { encoding: "utf8" });
  const preview = run(["09000001"]);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).cards[0].status, "supported");
  assert.equal(await readFile(filename, "utf8"), original);
  for (const args of [["example recruiter"], ["--name", "Example Recruiter"], ["Example Recruiter", "09000001"]]) {
    const named = run(args);
    assert.equal(named.status, 0, named.stderr);
    const report = JSON.parse(named.stdout);
    assert.equal(report.cards.length, 1);
    assert.equal(report.cards[0].passcode, source.passcode);
    assert.equal(report.cards[0].name, source.name);
  }
  for (const name of ["Example", "Unknown Example"]) {
    const rejected = run(["09000001", "--name", name, "--write", filename]);
    assert.equal(rejected.status, 1);
    const report = JSON.parse(rejected.stdout);
    assert.equal(report.cards[1].status, "unsupported");
    assert.match(report.write.error, /every requested/);
    assert.equal(await readFile(filename, "utf8"), original, "ambiguous or missing names prevent every batch write");
  }
  const failed = run(["09000001,09000003", "--write", filename]);
  assert.equal(failed.status, 1);
  assert.match(JSON.parse(failed.stdout).write.error, /every requested/);
  assert.equal(await readFile(filename, "utf8"), original);
  const written = run(["09000001", "--write", filename]);
  assert.equal(written.status, 0, written.stderr);
  assert.equal(JSON.parse(written.stdout).write.changed, true);
  assert.equal(JSON.parse(await readFile(filename, "utf8")).rules[0].id, "existing-recruiter");
  const historical = { ...old, formats: ["er", "eu"] };
  await writeFile(filename, JSON.stringify(historical));
  const blocked = run(["09000001", "--write", filename]);
  assert.equal(blocked.status, 1);
  assert.match(JSON.parse(blocked.stdout).write.error, /Edison formats/);
  assert.deepEqual(JSON.parse(await readFile(filename, "utf8")), historical);
  const noProfile = spawnSync(process.execPath, [cli, "09000001", "--write", filename, "--simulator", sim], { encoding: "utf8" });
  assert.equal(noProfile.status, 1);
  assert.match(noProfile.stderr, /Writes require --ruleset/);
  const unreviewed = await extractCards(["09000001"], sim, "edison");
  assert.equal(unreviewed[0].status, "unsupported");
  assert.match(unreviewed[0].reason, /No Edison historical review/);
  assert.ok(unreviewed[0].rule, "retain candidate rule for review even when historical export is blocked");
  assert.deepEqual(profile("edison").duelRequirements, {
    ignitionEffectPriority: true, firstTurnDraw: true,
    fieldSpellPolicy: "One face-up Field Spell across both players", modernTriggerLocationRules: false
  });
});

test("ruleset is enforced at the write boundary and cannot be spoofed by report fields", () => {
  assert.throws(() => mergeImpl(list(), [supported()]), /explicit ruleset/);
  assert.throws(() => profile("mr5"), /Unsupported ruleset/);
  const historical = { ...list(), formats: ["er", "eu"] };
  assert.throws(() => mergeRules(historical, [supported()]), /Edison formats/);
  const forged = { ...supported(), ruleset: { id: "edison", writeAllowed: true } };
  assert.throws(() => mergeRules(historical, [forged], "edison"), /No Edison historical review/);
  assert.throws(() => assertDestination("edison", list()), /other duel formats/);
  assert.doesNotThrow(() => assertDestination("edison", historical));
  const reviews = { [source.passcode]: reviewFixture() };
  const candidate = { ...supported(), name: source.name };
  const review = assessRuleset("edison", candidate, reviews);
  assert.equal(review.writeAllowed, false);
  assert.match(review.reason, /does not match/);
  applyRuleset("edison", candidate, reviews);
  assert.equal(assessRuleset("edison", candidate, reviews).writeAllowed, true);
  assert.ok(candidate.rule.requires.absentFaceUpCards.some(card => card.name === "Example Prohibition"));
  assert.equal(candidate.rule.resolution[0].onNoMonsterZone, "destroy-to-graveyard");
  assert.doesNotThrow(() => mergeRules(historical, [candidate], "edison", reviews));
  candidate.rule.resolution[0].onNoMonsterZone = undefined;
  assert.throws(() => mergeRules(historical, [candidate], "edison", reviews), /does not match/);
});

test("sourced historical compilation is generic and never silently skips unknown clauses", () => {
  const review = { status: "approved", name: source.name, reviewedOn: "2026-10-17", sources: ["https://example.test/historical"],
    effect: { kind: "graveyard-ignition-banish-summon-from-deck", summon: lookup("09000002"), positions: ["DEF"] },
    corrections: [{ kind: "activation-prohibition", card: { passcode: "09000004", name: "Example Prohibition" } },
      { kind: "no-monster-zone-destroy-deck-copy" }] };
  const rule = compileHistoricalRule(source, review);
  assert.equal(rule.card.passcode, "09000001");
  assert.equal(rule.resolution[0].card.passcode, "09000002");
  assert.deepEqual(rule.resolution[0].positions, ["DEF"]);
  assert.equal(rule.requires.absentFaceUpCards[0].passcode, "09000004");
  assert.throws(() => compileHistoricalRule(source, { ...review, corrections: [{ kind: "unimplemented-replacement" }] }), /generic adapter/);
  assert.throws(() => compileHistoricalRule(source, { ...review, effect: { ...review.effect, extraRestriction: true } }), /unsupported fields/);
  assert.throws(() => compileHistoricalRule(source, { ...review, sources: [] }), /sources/);
  assert.throws(() => compileHistoricalRule({ ...source, name: "Wrong card" }, review), /identity/);
});

test("historical reconstruction survives incompatible modern Lua and writes corrected behavior", async t => {
  const dir = await sandbox(t);
  const sim = path.join(dir, "YGOPRO");
  await mkdir(path.join(sim, "script"), { recursive: true });
  const db = new DatabaseSync(path.join(sim, "cards.cdb"));
  db.exec("CREATE TABLE texts (id INTEGER PRIMARY KEY, name TEXT, desc TEXT)");
  db.prepare("INSERT INTO texts VALUES (?, ?, ?)").run(9000001, "Example Recruiter", "Modern text not used as historical authority");
  db.close();
  await writeFile(path.join(sim, "script", "c9000001.lua"), "function c9000001.initial_effect(c) modern_logic(c) end");
  await writeFile(path.join(sim, "script", "utility.lua"), utility);
  const [modern] = await extractCards(["09000001"], sim);
  assert.equal(modern.status, "unsupported");
  const reviews = { [source.passcode]: reviewFixture() };
  const [historical] = await extractCards(["09000001"], sim, "edison", { reviews });
  assert.equal(historical.status, "supported", historical.reason);
  assert.equal(historical.adaptation.mode, "rulings-reconstruction");
  assert.match(historical.simulatorReason, /Unsupported Lua behavior/);
  assert.equal(historical.adaptation.changes.length, 2);
  assert.ok(historical.adaptation.manualResponsibilities.length);
  const filename = path.join(dir, "edison.json");
  const previous = list(); previous.formats = ["er", "eu"];
  await writeFile(filename, JSON.stringify(previous));
  assert.equal((await writeRules(filename, [historical], "edison", reviews)).changed, true);
  const saved = core.importAutomationList(await readFile(filename, "utf8"));
  assert.equal(saved.rules.length, 1);
  assert.equal(saved.rules[0].requires.absentFaceUpCards[0].passcode, "09000004");
  assert.equal(saved.rules[0].resolution[0].onNoMonsterZone, "destroy-to-graveyard");
  assert.equal((await writeRules(filename, [historical], "edison", reviews)).changed, false);
  const reviewFile = path.join(dir, "edison.reviews.json");
  await writeFile(reviewFile, JSON.stringify({ schemaVersion: 1, ruleset: "edison", cards: reviews }));
  assert.deepEqual(await loadReviews(reviewFile, "edison"), reviews);
  await assert.rejects(loadReviews(reviewFile, "simulator"), /mismatch/);
  const cacheDirectory = path.join(dir, "cache");
  await researchRulings(source, async url => url.includes("edisonformat.com") ?
    new Response("<div>EXAMPLE RECRUITER<br>Example historical ruling</div><div>EXAMPLE TARGET</div>") :
    new Response(JSON.stringify({ id: 9000001, name: source.name, Rulings: { Edison: "Example revised ruling" } })), { cacheDirectory });
  const cli = fileURLToPath(new URL("../extract-card-rules.mjs", import.meta.url));
  const invoked = spawnSync(process.execPath, [cli, "--name", source.name.toLowerCase(), "--simulator", sim, "--ruleset", "edison", "--write", filename], {
    encoding: "utf8", env: { ...process.env, DBE_SIM_EXTRACTOR_CACHE: cacheDirectory }
  });
  assert.equal(invoked.status, 0, invoked.stderr);
  const report = JSON.parse(invoked.stdout);
  assert.equal(report.reviewsPath, reviewFile, "infer external sidecar from destination");
  assert.equal(report.write.changed, false);
  assert.ok(report.cards[0].research.every(result => result.cache === "cached"), "Edison automatically consults downloaded sources");
});

test("optional compatibility with a separately selected extension checkout", { skip: !process.env.DBX_EXTENSION_DIR }, async () => {
  const { default: extension } = await import(pathToFileURL(path.join(process.env.DBX_EXTENSION_DIR, "enhancer-core.js")));
  const fixture = list();
  const text = JSON.stringify(fixture);
  assert.deepEqual(extension.importAutomationList(text), core.importAutomationList(text));
  assert.equal(extension.exportAutomationList(core.importAutomationList(text)), core.exportAutomationList(core.importAutomationList(text)));
});
