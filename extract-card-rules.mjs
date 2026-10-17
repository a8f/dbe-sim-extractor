import path from "node:path";
import { readFile, writeFile, rename, unlink, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import core from "./schema-3.mjs";
import { applyRuleset, assessRuleset, assertDestination, profile, loadReviews } from "./rulesets.mjs";
import { researchRulings, clearRulingsCache } from "./research-rulings.mjs";
import { resolveCardInputs } from "./card-lookup.mjs";
import { translateSummonChoice, matchesSetcode } from "./translate-summon-choice.mjs";

export const defaultSimulator = "C:\\Yu-Gi-Oh! The Dawn of a New Era\\YGOPRO";

export function passcode(value) {
  if (!/^\d{1,8}$/.test(String(value)) || Number(value) === 0) throw new Error("Invalid printed card ID: " + value);
  return String(value).padStart(8, "0");
}

// Tokenize, never execute Lua. Matching the entire token stream prevents an
// unrecognized condition, extra effect or operation from being silently lost.
export function tokens(lua) {
  const result = [];
  let rest = lua.replace(/^\uFEFF/, "");
  while (rest) {
    const whitespace = rest.match(/^\s+/);
    if (whitespace) { rest = rest.slice(whitespace[0].length); continue; }
    const block = rest.match(/^--\[(=*)\[/);
    if (block) {
      const end = rest.indexOf("]" + block[1] + "]", block[0].length);
      if (end < 0) throw new Error("Unterminated Lua comment");
      rest = rest.slice(end + block[1].length + 2); continue;
    }
    const comment = rest.match(/^--[^\r\n]*/);
    if (comment) { rest = rest.slice(comment[0].length); continue; }
    const token = rest.match(/^(?:0[xX][a-fA-F0-9]+|[A-Za-z_][A-Za-z_0-9]*|\d+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|==|~=|<=|>=|\.\.|[.():,=<>+*/#;{}\[\]%&|~^-])/);
    if (!token) throw new Error("Unsupported Lua syntax near: " + rest.slice(0, 40));
    result.push(token[0]); rest = rest.slice(token[0].length);
  }
  return result;
}

function summonTemplate(id, target) {
  return `function c${id}.initial_effect(c)
    local e1=Effect.CreateEffect(c)
    e1:SetDescription(aux.Stringid(${id},0))
    e1:SetCategory(CATEGORY_SPECIAL_SUMMON)
    e1:SetType(EFFECT_TYPE_IGNITION)
    e1:SetRange(LOCATION_GRAVE)
    e1:SetCost(aux.bfgcost)
    e1:SetTarget(c${id}.target)
    e1:SetOperation(c${id}.operation)
    c:RegisterEffect(e1)
  end
  function c${id}.filter(c,e,sp)
    return c:IsCode(${target}) and c:IsCanBeSpecialSummoned(e,0,sp,false,false)
  end
  function c${id}.target(e,tp,eg,ep,ev,re,r,rp,chk)
    if chk==0 then return Duel.IsExistingMatchingCard(c${id}.filter,tp,LOCATION_DECK,0,1,nil,e,tp)
      and Duel.GetLocationCount(tp,LOCATION_MZONE)>0 end
    Duel.SetOperationInfo(0,CATEGORY_SPECIAL_SUMMON,nil,1,tp,LOCATION_DECK)
  end
  function c${id}.operation(e,tp,eg,ep,ev,re,r,rp)
    if Duel.GetLocationCount(tp,LOCATION_MZONE)<=0 then return end
    local sc=Duel.GetFirstMatchingCard(c${id}.filter,tp,LOCATION_DECK,0,nil,e,tp)
    if sc then Duel.SpecialSummon(sc,0,tp,tp,false,false,POS_FACEUP) end
  end`;
}

const costTemplate = `function Auxiliary.bfgcost(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then return e:GetHandler():IsAbleToRemoveAsCost() end
  Duel.Remove(e:GetHandler(),POS_FACEUP,REASON_COST)
end`;

export function translate(lua, utility, source, lookup, options = {}) {
  const input = tokens(lua);
  const choice = translateSummonChoice(input, source, { ...options, tokenize: tokens });
  if (choice) return choice;
  const candidates = [];
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "IsCode" && input[i + 1] === "(" && /^\d+$/.test(input[i + 2])) candidates.push(input[i + 2]);
  }
  if (candidates.length !== 1 || JSON.stringify(input) !== JSON.stringify(tokens(summonTemplate(Number(source.passcode), candidates[0])))) {
    throw new Error("Unsupported Lua behavior: no complete match for a supported summon-choice or graveyard ignition / self-banish cost / Deck summon translator. Extra effects, conditions, restrictions and other operations need a translator and possibly a new extension adapter.");
  }
  const helper = tokens(utility);
  const expected = tokens(costTemplate);
  const start = helper.indexOf("bfgcost") - 3;
  if (helper.filter(token => token === "bfgcost").length !== 1 || start < 0 ||
      JSON.stringify(helper.slice(start, start + expected.length)) !== JSON.stringify(expected)) {
    throw new Error("Unsupported aux.bfgcost implementation in utility.lua");
  }
  const target = lookup(passcode(candidates[0]));
  const rule = {
    id: "ygopro-" + source.passcode,
    card: { passcode: source.passcode, name: source.name },
    label: target.passcode === source.passcode ? "Banish this copy; summon another from Deck" : "Banish this copy; summon " + target.name + " from Deck",
    requires: { sourceZone: "graveyard", ownTurn: true, phases: ["M1", "M2"] },
    activation: [{ op: "banish", card: "source" }],
    resolution: [{ op: "special-summon", from: "deck", card: { passcode: target.passcode, name: target.name }, positions: ["ATK", "DEF"] }]
  };
  core.validateAutomationList({ schemaVersion: 3, id: "extracted", name: "Extracted", version: "1.0.0", formats: ["er", "eu"], rules: [rule] });
  return rule;
}

export async function extractCards(ids, simulator = defaultSimulator, ruleset = "simulator", options = {}) {
  profile(ruleset);
  // Accept the application root, YGOPRO directory, or its script directory.
  let root = path.resolve(simulator);
  if (path.basename(root).toLowerCase() === "script") root = path.dirname(root);
  try { await realpath(path.join(root, "cards.cdb")); }
  catch { root = path.join(root, "YGOPRO"); }
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(root, "cards.cdb"), { readOnly: true });
  try {
    const query = db.prepare("SELECT name, desc FROM texts WHERE id = ?");
    const lookup = id => {
      const row = query.get(Number(id));
      if (!row?.name) throw new Error("Card " + id + " not found in cards.cdb texts table");
      return { passcode: id, name: row.name, text: row.desc };
    };
    let archetypeRows;
    const resolveSetCards = setcode => {
      if (!archetypeRows) {
        const statement = db.prepare("SELECT d.id, d.setcode, d.type, t.name FROM datas d JOIN texts t ON t.id = d.id ORDER BY d.id");
        statement.setReadBigInts(true);
        archetypeRows = statement.all();
      }
      return archetypeRows.filter(row => row.id > 0n && row.id < 10n ** 8n && ((row.type ?? 0n) & 1n) !== 0n && matchesSetcode(row.setcode ?? 0n, setcode))
        .map(row => ({ passcode: passcode(String(row.id)), name: row.name }));
    };
    const results = [];
    for (const selected of resolveCardInputs(ids, db, passcode, { fuzzy: options.fuzzy })) {
      if (!selected.passcode) { results.push(selected); continue; }
      const id = selected.passcode;
      const result = { passcode: id, status: "unsupported" };
      try {
        Object.assign(result, lookup(id));
        result.scriptPath = path.join(root, "script", "c" + Number(id) + ".lua");
        try {
          result.lua = await readFile(result.scriptPath, "utf8");
          result.scriptSha256 = createHash("sha256").update(result.lua).digest("hex");
          const utility = await readFile(path.join(root, "script", "utility.lua"), "utf8");
          result.utilitySha256 = createHash("sha256").update(utility).digest("hex");
          result.rule = translate(result.lua, utility, result, lookup, { resolveSetCards });
          if (result.rule.resolution[0].op === "choose-search-or-destroy") {
            result.simulatorAnalysis = { adapter: "summon-trigger-search-or-destroy", archetypeMembership: "Printed-card snapshot from the selected cards.cdb",
              manualResponsibilities: ["Confirm a legal optional summon-trigger window, including missed timing and the Damage Step.",
                "Adjudicate IsAbleToHand, effect negation, changed names/types/archetypes, destruction protection and replacement effects manually.",
                "The opponent moves their own selected field cards; simultaneous destruction consequences are adjudicated manually."] };
          }
        } catch (error) { result.simulatorReason = error.message; }
        applyRuleset(ruleset, result, options.reviews);
        result.ruleset = assessRuleset(ruleset, result, options.reviews);
        if (!result.ruleset.writeAllowed) throw new Error(result.ruleset.reason);
        if (!result.rule) throw new Error(result.simulatorReason || "No translatable behavior or historical reconstruction is available");
        result.status = "supported";
      } catch (error) { result.reason = error.message; }
      if (result.name && (options.research ?? ruleset === "edison")) {
        result.research = await researchRulings(result, options.fetchImpl, {
          cacheDirectory: options.cacheDirectory, refresh: options.refreshRulings
        });
      }
      results.push(result);
    }
    return results;
  } finally { db.close(); }
}

export function mergeRules(list, results, ruleset, reviews = {}) {
  profile(ruleset);
  if (!results.length || results.some(result => result.status !== "supported")) throw new Error("No list written: every requested card must translate successfully. See extraction report.");
  // Recompute approval at the write boundary, even for programmatic callers.
  for (const result of results) {
    const review = assessRuleset(ruleset, result, reviews);
    if (!review.writeAllowed) throw new Error("No list written: " + review.reason);
  }
  core.validateAutomationList(list);
  assertDestination(ruleset, list);
  const next = structuredClone(list);
  for (const result of results) {
    const matches = next.rules.filter(rule => rule.card.passcode === result.passcode);
    if (matches.length > 1) throw new Error("No list written: multiple existing effects for " + result.passcode + "; merge manually.");
    if (matches.length) next.rules[next.rules.indexOf(matches[0])] = { ...result.rule, id: matches[0].id };
    else next.rules.push(result.rule);
  }
  const text = JSON.stringify(next, null, 2) + "\n";
  if (Buffer.byteLength(text) > 65536) throw new Error("No list written: merged list exceeds 64 KB");
  core.importAutomationList(text);
  return next;
}

export async function writeRules(filename, results, ruleset, reviews = {}) {
  const target = await realpath(filename);
  const original = await readFile(target, "utf8");
  const list = JSON.parse(original);
  const next = mergeRules(list, results, ruleset, reviews);
  if (JSON.stringify(next) === JSON.stringify(list)) return { path: target, changed: false };
  const temporary = target + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
    if (await readFile(target, "utf8") !== original) throw new Error("List changed during extraction; rerun to merge the latest edits");
    await rename(temporary, target);
    return { path: target, changed: true };
  } finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}

export async function main(args) {
  let simulator = defaultSimulator, output, ruleset, research, reviewsPath, refreshRulings = false, clearCache = false;
  const ids = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      console.log('Usage: node card-rule-extractor/extract-card-rules.mjs <passcode(s) or "card name(s)"> [--name "card name"] [--simulator <directory>] [--ruleset edison|simulator] [--write <existing.json>] [--reviews <external.reviews.json>] [--research] [--refresh-rulings] [--clear-cache]\nQuote each card name separately. Exact names ignore case and spacing; unique partial names also work. Ambiguous names list candidate passcodes and prevent writes. --name is repeatable and forces name lookup for numeric-only names or names containing commas. Writes require --ruleset. Edison runs cache downloaded rulings indefinitely. Requires Node 22.13+.');
      return;
    }
    if (arg === "--research") research = true;
    else if (arg === "--clear-cache") clearCache = true;
    else if (arg === "--refresh-rulings") { refreshRulings = true; research = true; }
    else if (arg === "--simulator" || arg === "--write" || arg === "--ruleset" || arg === "--reviews" || arg === "--name") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("Missing value for " + arg);
      if (arg === "--simulator") simulator = value;
      else if (arg === "--ruleset") { profile(value); ruleset = value; }
      else if (arg === "--reviews") reviewsPath = path.resolve(value);
      else if (arg === "--name") ids.push({ name: value });
      else { if (output) throw new Error("Choose one write destination"); output = path.resolve(value); }
    } else if (arg.startsWith("-")) throw new Error("Unknown option: " + arg);
    else if (/^[\d,]+$/.test(arg)) ids.push(...arg.split(",").map(passcode));
    else ids.push(arg);
  }
  if (clearCache) {
    const removed = await clearRulingsCache();
    if (!ids.length && !output && !reviewsPath && !ruleset && !research) { console.log(JSON.stringify({ cacheFilesRemoved: removed })); return; }
  }
  if (!ids.length) throw new Error("Supply at least one printed card ID or card name. Use --help for usage.");
  if (output && !ruleset) throw new Error("Writes require --ruleset edison or --ruleset simulator; the destination does not establish historical correctness.");
  const selected = ruleset || "simulator";
  if (reviewsPath && selected !== "edison") throw new Error("--reviews requires a historical ruleset");
  let reviews = {};
  if (reviewsPath) reviews = await loadReviews(reviewsPath, selected);
  else if (output && selected === "edison") {
    const parsed = path.parse(output);
    reviewsPath = path.join(parsed.dir, parsed.name + ".reviews.json");
    try { reviews = await loadReviews(reviewsPath, selected); }
    catch (error) { if (error.code !== "ENOENT") throw error; reviewsPath = undefined; }
  }
  const cards = await extractCards(ids, simulator, selected, { reviews, research, refreshRulings });
  const report = { ruleset: profile(selected), ...(reviewsPath ? { reviewsPath } : {}), cards };
  if (output) {
    try { report.write = await writeRules(output, cards, selected, reviews); }
    catch (error) { report.write = { path: output, error: error.message }; process.exitCode = 1; }
  }
  if (cards.some(card => card.status !== "supported")) process.exitCode = 1;
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
