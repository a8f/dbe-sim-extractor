import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { compileHistoricalRule, describeAdaptation } from "./historical-rulings.mjs";

const edison = JSON.parse(readFileSync(new URL("./rulesets/edison.json", import.meta.url), "utf8"));
const simulator = {
  id: "simulator", name: "Installed simulator behavior (historical correctness unverified)",
  masterRule: "unknown: not established by card Lua or default_rule configuration",
  historical: false
};

export function profile(id) {
  if (id === "edison") {
    return structuredClone(edison);
  }
  if (id === "simulator") return structuredClone(simulator);
  throw new Error("Choose an explicit ruleset: edison or simulator. Unsupported ruleset: " + id);
}

export async function loadReviews(filename, ruleset) {
  const document = JSON.parse((await readFile(filename, "utf8")).replace(/^\uFEFF/, ""));
  if (document.schemaVersion !== 1 || document.ruleset !== ruleset || !document.cards ||
      typeof document.cards !== "object" || Array.isArray(document.cards)) throw new Error("Invalid external reviews document or ruleset mismatch");
  for (const [passcode, review] of Object.entries(document.cards)) {
    if (!/^\d{8}$/.test(passcode) || passcode === "00000000") throw new Error("Invalid review passcode");
    if (review?.status === "approved") compileHistoricalRule({ passcode, name: review.name }, review);
    else if (review?.status !== "blocked" || !review.reason) throw new Error("Invalid external review status");
  }
  return document.cards;
}

export function assessRuleset(id, card, reviews = {}) {
  profile(id);
  if (id === "simulator") return { id, writeAllowed: true, historical: false, scope: "Translated installed script only; master rule and errata are unverified." };
  const review = Object.hasOwn(reviews, card.passcode) ? reviews[card.passcode] : null;
  if (!review) return { id, writeAllowed: false, reason: "No Edison historical review for " + card.passcode + ". A matching modern script is insufficient." };
  if (review.status !== "approved") return { id, writeAllowed: false, reason: review.reason, sources: review.sources, gaps: review.gaps };
  let expected;
  try { expected = compileHistoricalRule(card, review); }
  catch (error) { return { id, writeAllowed: false, reason: error.message }; }
  const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  if (digest(expected) !== digest(card.rule)) {
    return { id, writeAllowed: false, reason: "Generated rule does not match the sourced historical corrections for " + card.passcode };
  }
  return { id, writeAllowed: true, historical: true, sources: review.sources };
}

export function applyRuleset(id, card, reviews = {}) {
  profile(id);
  if (id !== "edison") return;
  const review = Object.hasOwn(reviews, card.passcode) ? reviews[card.passcode] : null;
  if (!review || review.status !== "approved") return;
  const historicalRule = compileHistoricalRule(card, review);
  card.adaptation = describeAdaptation(card.rule, historicalRule, review);
  if (card.rule) card.simulatorRule = card.rule;
  card.rule = historicalRule;
}

export function assertDestination(id, list) {
  profile(id);
  const hasEdison = list.formats.some(format => ["er", "eu"].includes(format));
  if (hasEdison && id !== "edison") throw new Error("No list written: Edison formats require --ruleset edison and an approved historical review.");
  if (id === "edison" && list.formats.some(format => !["er", "eu", "so"].includes(format))) {
    throw new Error("No list written: an Edison-reviewed rule cannot be exported into other duel formats. Use Edison and/or Solo formats.");
  }
}
