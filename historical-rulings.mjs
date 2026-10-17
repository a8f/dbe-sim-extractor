import core from "./schema-3.mjs";

// Compile sourced, reviewed facts into the generic action vocabulary. Facts are
// independent of the installed script: modern errata need not match old Lua.
export function compileHistoricalRule(source, review) {
  if (review.status !== "approved" || !review.sources?.length || !review.reviewedOn || source.name !== review.name) {
    throw new Error("Historical mapping is missing its review, sources or matching card identity");
  }
  const effect = review.effect;
  if (effect?.kind !== "graveyard-ignition-banish-summon-from-deck") throw new Error("Historical effect needs a supported generic adapter: " + effect?.kind);
  if (Object.keys(effect).some(key => !["kind", "summon", "positions"].includes(key))) throw new Error("Historical effect has unsupported fields; extend the generic adapter before exporting");
  const rule = {
    id: "ygopro-" + source.passcode,
    card: { passcode: source.passcode, name: review.name },
    label: "Banish this copy; summon " + (effect.summon.passcode === source.passcode ? "another" : effect.summon.name) + " from Deck",
    requires: { sourceZone: "graveyard", ownTurn: true, phases: ["M1", "M2"] },
    activation: [{ op: "banish", card: "source" }],
    resolution: [{ op: "special-summon", from: "deck", card: structuredClone(effect.summon), positions: [...effect.positions] }]
  };
  for (const correction of review.corrections || []) {
    if (correction.kind === "activation-prohibition") {
      if (Object.keys(correction).some(key => !["kind", "card", "summary"].includes(key))) throw new Error("Historical prohibition has unsupported fields");
      (rule.requires.absentFaceUpCards ||= []).push(structuredClone(correction.card));
    } else if (correction.kind === "no-monster-zone-destroy-deck-copy") {
      if (Object.keys(correction).some(key => !["kind", "summary"].includes(key))) throw new Error("Historical no-zone correction has unsupported fields");
      rule.resolution[0].onNoMonsterZone = "destroy-to-graveyard";
    } else throw new Error("Historical correction needs a supported generic adapter: " + correction.kind);
  }
  core.validateAutomationList({ schemaVersion: 3, id: "historical", name: "Historical", version: "1.0.0", formats: ["er", "eu"], rules: [rule] });
  return rule;
}

export function describeAdaptation(simulatorRule, historicalRule, review) {
  return {
    mode: simulatorRule ? "rulings-correction" : "rulings-reconstruction",
    policy: "April 2010 historical baseline; edisonformat.com card rulings",
    sources: review.sources,
    reviewedOn: review.reviewedOn,
    changes: (review.corrections || []).map(correction => correction.summary),
    simulatorDiffers: JSON.stringify(simulatorRule) !== JSON.stringify(historicalRule),
    manualResponsibilities: review.manualResponsibilities || [],
    comparisonSources: review.comparisonSources || []
  };
}
