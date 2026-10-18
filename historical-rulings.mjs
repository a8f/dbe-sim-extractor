import core from "./schema-4.mjs";

// Compile sourced, reviewed facts into the generic action vocabulary. Facts are
// independent of the installed script: modern errata need not match old Lua.
export function compileHistoricalRule(source, review) {
  if (review.status !== "approved" || !review.sources?.length || !review.reviewedOn || source.name !== review.name) {
    throw new Error("Historical mapping is missing its review, sources or matching card identity");
  }
  const effect = review.effect;
  if (effect?.kind === "summon-trigger-search-or-destroy") {
    if (Object.keys(effect).some(key => !["kind", "monsterNamePrefixes", "monsterCards", "destructionMinimum", "searchAbsentFaceUpCards"].includes(key)) || review.corrections?.length) {
      throw new Error("Historical choice effect has unsupported fields or corrections");
    }
    const rule = {
      id: "ygopro-" + source.passcode,
      card: { passcode: source.passcode, name: review.name },
      label: "On summon: search a monster or destroy Spells/Traps",
      action: core.summonChoiceAction(effect)
    };
    core.validateAutomationList({ schemaVersion: 4, id: "historical", name: "Historical", version: "1.0.0", formats: ["er", "eu"], rules: [rule] });
    return rule;
  }
  if (effect?.kind !== "graveyard-ignition-banish-summon-from-deck") throw new Error("Historical effect needs a supported generic adapter: " + effect?.kind);
  if (Object.keys(effect).some(key => !["kind", "summon", "positions"].includes(key))) throw new Error("Historical effect has unsupported fields; extend the generic adapter before exporting");
  const rule = {
    id: "ygopro-" + source.passcode,
    card: { passcode: source.passcode, name: review.name },
    label: "Banish this copy; summon " + (effect.summon.passcode === source.passcode ? "another" : effect.summon.name) + " from Deck",
    action: core.banishSummonAction({ card: structuredClone(effect.summon), positions: [...effect.positions] })
  };
  for (const correction of review.corrections || []) {
    if (correction.kind === "activation-prohibition") {
      if (Object.keys(correction).some(key => !["kind", "card", "summary"].includes(key))) throw new Error("Historical prohibition has unsupported fields");
      if (!rule.action.activation.checks.length) rule.action.activation.checks.push({ check: "absent-face-up", cards: [] });
      rule.action.activation.checks[0].cards.push(structuredClone(correction.card));
    } else if (correction.kind === "no-monster-zone-destroy-deck-copy") {
      if (Object.keys(correction).some(key => !["kind", "summary"].includes(key))) throw new Error("Historical no-zone correction has unsupported fields");
      rule.action.resolution[0].onNoMonsterZone = { op: "destroy", reason: "effect" };
    } else throw new Error("Historical correction needs a supported generic adapter: " + correction.kind);
  }
  core.validateAutomationList({ schemaVersion: 4, id: "historical", name: "Historical", version: "1.0.0", formats: ["er", "eu"], rules: [rule] });
  return rule;
}

export function describeAdaptation(simulatorRule, historicalRule, review) {
  const changes = (review.corrections || []).map(correction => correction.summary);
  if (simulatorRule?.action.timing.kind === "optional-trigger" && historicalRule.action.timing.kind === "optional-trigger") {
    const installed = simulatorRule.action, historical = historicalRule.action;
    const before = installed.resolution[0].cases, after = historical.resolution[0].cases;
    if (before.destroy[0].selection.minimum !== after.destroy[0].selection.minimum) changes.push("Historical review changes the destruction selection minimum from " + before.destroy[0].selection.minimum + " to " + after.destroy[0].selection.minimum + ".");
    if (JSON.stringify(installed.filters) !== JSON.stringify(historical.filters)) changes.push("Use the historically reviewed monster selector instead of the simulator archetype snapshot.");
    if (JSON.stringify(before.search[0].checks) !== JSON.stringify(after.search[0].checks)) changes.push("Apply historically reviewed face-up search prohibitions.");
  }
  return {
    mode: simulatorRule ? "rulings-correction" : "rulings-reconstruction",
    policy: "April 2010 historical baseline; edisonformat.com card rulings",
    sources: review.sources,
    reviewedOn: review.reviewedOn,
    changes,
    simulatorDiffers: JSON.stringify(simulatorRule) !== JSON.stringify(historicalRule),
    manualResponsibilities: review.manualResponsibilities || [],
    comparisonSources: review.comparisonSources || []
  };
}
