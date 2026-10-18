import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { tokens, translate, extractCards, mergeRules } from "../extract-card-rules.mjs";
import { matchesSetcode } from "../translate-summon-choice.mjs";
import core from "../schema-4.mjs";

const lua = await readFile(new URL("./fixtures/ygopro/c9000005.lua", import.meta.url), "utf8");
const source = { passcode: "09000005", name: "Example Scout" };
const member = { passcode: "09000006", name: "Example Family Member" };
const other = { passcode: "09000007", name: "Unrelated Card" };
const run = (script = lua, resolveSetCards = code => {
  assert.equal(code, 0x321); return [member];
}) => translate(script, "", source, () => { throw new Error("No fixed-card lookup expected"); }, { resolveSetCards });

test("complete summon-choice Lua derives a database-backed selector and selection minimum", () => {
  assert.deepEqual(tokens("c:IsSetCard(0x321)"), ["c", ":", "IsSetCard", "(", "0x321", ")"]);
  const rule = run();
  assert.deepEqual(rule.card, source);
  assert.deepEqual(rule.action.timing.events, ["normal-summon", "special-summon"]);
  assert.deepEqual(rule.action.activation.costs, []);
  assert.deepEqual(rule.action.filters.monsters, { cardType: "monster", cards: [member] });
  assert.equal(rule.action.resolution[0].op, "branch");
  assert.equal(rule.action.resolution[0].cases.destroy[0].op, "destroy");
  assert.equal(rule.action.resolution[0].cases.destroy[0].selection.minimum, 1);
  assert.deepEqual(run(lua.replaceAll("0x321", "801").replaceAll("countFamily", "countOthers").replaceAll("amount", "total")), rule);
  assert.equal(run(lua.replace("chosen=cards:Select(player,1,amount,nil)", "chosen=cards:Select(player,0,amount,nil)")).action.resolution[0].cases.destroy[0].selection.minimum, 0);
  assert.throws(() => run(lua, () => []), /Invalid rules list/);
  assert.throws(() => translate(lua, "", source, () => member), /archetype membership/);
});

test("unknown conditions, costs, extra effects and altered choice semantics are never partially translated", () => {
  const changes = [
    lua.replace("normal:SetTarget", "normal:SetCountLimit(1) normal:SetTarget"),
    lua.replace("normal:SetTarget", "normal:SetCost(aux.bfgcost) normal:SetTarget"),
    lua.replace("normal:SetTarget", "normal:SetCondition(aux.SomeCondition) normal:SetTarget"),
    lua.replace("EVENT_SPSUMMON_SUCCESS", "EVENT_FLIP_SUMMON_SUCCESS"),
    lua.replace("EFFECT_FLAG_DAMAGE_STEP", "EFFECT_FLAG_CARD_TARGET"),
    lua.replace("subject:IsAbleToHand()", "subject:IsAbleToHand() and subject:IsLevelBelow(4)"),
    lua.replace("subject:IsType(TYPE_SPELL+TYPE_TRAP)", "subject:IsType(TYPE_SPELL)"),
    lua.replace("LOCATION_MZONE,0,handler", "LOCATION_MZONE,0,nil"),
    lua.replace("chosen=cards:Select(player,1,amount,nil)", "chosen=cards:Select(player,2,amount,nil)"),
    lua.replace("Duel.Destroy(chosen,REASON_EFFECT)", "Duel.Remove(chosen,POS_FACEUP,REASON_EFFECT)"),
    lua.replace("Duel.ConfirmCards(1-player,cards)", ""),
    lua.replace("mode=mode+2", "mode=mode+1"),
    lua.replace("LOCATION_DECK,0,1,1,nil", "LOCATION_GRAVE,0,1,1,nil"),
    lua.replace("return subject:IsSetCard(0x321)", "return subject:IsSetCard(0x322)"),
    lua + "\nfunction c9000005.extra(subject) subject:RegisterEffect(Effect.CreateEffect(subject)) end",
    lua + "\nunknownGlobal()"
  ];
  for (const changed of changes) assert.throws(() => run(changed), /Unsupported Lua behavior/);
});

test("archetype decoding handles packed integers, subtypes, all lanes and modern database blobs", () => {
  assert.equal(matchesSetcode(0x1321n, 0x321), true);
  assert.equal(matchesSetcode(0x1321n, 0x1321), true);
  assert.equal(matchesSetcode(0x1321n, 0x2321), false);
  assert.equal(matchesSetcode(0x1234n | (0x1321n << 48n), 0x321), true);
  assert.equal(matchesSetcode(BigInt.asIntN(64, 0xf321n << 48n), 0x321), true);
  assert.equal(matchesSetcode(0x322n, 0x321), false);
  assert.equal(matchesSetcode(new Uint8Array([0x34, 0x12, 0x21, 0x13]), 0x321), true);
  assert.equal(matchesSetcode(new Uint8Array([0x22, 0x03]), 0x321), false);
  assert.throws(() => matchesSetcode(new Uint8Array([1]), 0x321), /blob/);
  assert.throws(() => matchesSetcode(Number.MAX_SAFE_INTEGER + 1, 0x321), /Unsafe/);
});

test("SQLite extraction discovers similar effects without reviews; Edison still requires and applies historical review", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "dbx-choice-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "script"));
  const db = new DatabaseSync(path.join(root, "cards.cdb"));
  db.exec("CREATE TABLE texts (id INTEGER PRIMARY KEY, name TEXT, desc TEXT); CREATE TABLE datas (id INTEGER PRIMARY KEY, setcode, type INTEGER)");
  const insertText = db.prepare("INSERT INTO texts VALUES (?, ?, ?)");
  const insertData = db.prepare("INSERT INTO datas VALUES (?, ?, ?)");
  for (const card of [source, member, other]) insertText.run(Number(card.passcode), card.name, "Synthetic card text");
  insertData.run(Number(source.passcode), null, 1);
  insertData.run(Number(member.passcode), new Uint8Array([0x21, 0x13]), 1);
  insertData.run(Number(other.passcode), 0x322, 1);
  insertText.run(9000008, "Example Family Spell", "Synthetic spell"); insertData.run(9000008, 0x321, 2);
  insertText.run(9000009, "Example Packed Member", "Synthetic monster"); insertData.run(9000009, (0x1321n << 48n) | 0x1234n, 1);
  db.close();
  await writeFile(path.join(root, "script", "c9000005.lua"), lua);
  await writeFile(path.join(root, "script", "utility.lua"), "");
  const [simulator] = await extractCards([source.passcode], root, "simulator", { research: false });
  assert.equal(simulator.status, "supported");
  assert.equal(simulator.simulatorReason, undefined);
  assert.deepEqual(simulator.rule.action.filters.monsters.cards, [member, { passcode: "09000009", name: "Example Packed Member" }]);
  const destination = { schemaVersion: 4, id: "example", name: "Example", version: "1.0.0", formats: ["so"], rules: [simulator.rule] };
  assert.doesNotThrow(() => core.importAutomationList(JSON.stringify(mergeRules(destination, [simulator], "simulator"))));
  const [missing] = await extractCards([source.passcode], root, "edison", { research: false });
  assert.equal(missing.status, "unsupported"); assert.match(missing.reason, /No Edison historical review/);
  const reviews = { [source.passcode]: { name: source.name, status: "approved", reviewedOn: "2026-10-17", sources: ["https://example.test/historical"],
    effect: { kind: "summon-trigger-search-or-destroy", monsterNamePrefixes: ["Example Family "], searchAbsentFaceUpCards: [] } } };
  const [historical] = await extractCards([source.passcode], root, "edison", { reviews, research: false });
  assert.equal(historical.status, "supported"); assert.equal(historical.adaptation.mode, "rulings-correction");
  assert.equal(historical.simulatorRule.action.resolution[0].cases.destroy[0].selection.minimum, 1);
  assert.deepEqual(historical.rule.action.filters.monsters.namePrefixes, ["Example Family "]);
  assert.equal(historical.rule.action.resolution[0].cases.destroy[0].selection.minimum, 0, "historical default permits zero selections");
  assert.match(historical.adaptation.changes.join(" "), /minimum from 1 to 0/);
  assert.equal(simulator.simulatorAnalysis.adapter, "summon-trigger-search-or-destroy");
});
