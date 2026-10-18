import { createHash } from "node:crypto";

const text = (value, maximum) => typeof value === "string" && /\S/.test(value) && value.length <= maximum;
const hash = value => createHash("sha256").update(value).digest("hex");
const keys = (value, allowed) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));

// An inventory is reviewed semantic data, not a count of Lua registrations:
// several registrations may implement one effect or a summon procedure.
export function validateEffectInventory(review) {
  const inventory = review.effectInventory;
  if (inventory === undefined) return;
  if (!keys(inventory, ["textSha256", "scriptSha256", "effects"]) || typeof inventory.textSha256 !== "string" || !/^[a-f0-9]{64}$/.test(inventory.textSha256) ||
      (inventory.scriptSha256 !== undefined && (typeof inventory.scriptSha256 !== "string" || !/^[a-f0-9]{64}$/.test(inventory.scriptSha256))) ||
      !Array.isArray(inventory.effects) || !inventory.effects.length || inventory.effects.length > 20) {
    throw new Error("Invalid reviewed effect inventory or source fingerprints");
  }
  const ids = new Set();
  let implemented = 0;
  for (const effect of inventory.effects) {
    if (!keys(effect, ["id", "label", "status", "kind", "reason"]) || !text(effect.id, 80) || !/^[a-z0-9][a-z0-9._-]*$/.test(effect.id) ||
        ids.has(effect.id) || !text(effect.label, 300)) throw new Error("Invalid or duplicate effect inventory entry");
    ids.add(effect.id);
    if (effect.status === "implemented") {
      if (effect.kind !== review.effect?.kind || effect.reason !== undefined) throw new Error("Implemented inventory entry must match the exported historical effect kind");
      implemented++;
    } else if (effect.status !== "unsupported" || !text(effect.reason, 500) || effect.kind !== undefined) {
      throw new Error("Unsupported inventory entry needs a reason and cannot claim an implemented kind");
    }
  }
  // The current historical compiler emits exactly one action per card.
  if (implemented !== 1) throw new Error("Effect inventory must identify exactly one exported historical effect");
}

export function assessEffectCoverage(source, review) {
  const inventory = review?.effectInventory;
  const warnings = [];
  if (!inventory) return { status: "unverified", basis: "no-reviewed-inventory", effects: [],
    warnings: ["Full-card effect coverage is unverified: no reviewed effect inventory. A supported exported action does not establish that every effect is implemented."] };
  validateEffectInventory(review);
  const effects = structuredClone(inventory.effects);
  if (typeof source.text !== "string" || hash(source.text) !== inventory.textSha256) {
    warnings.push("Effect inventory does not match the current card text (or text is unavailable); review all effects again.");
  }
  if (inventory.scriptSha256 && (typeof source.lua !== "string" || hash(source.lua) !== inventory.scriptSha256)) {
    warnings.push("Effect inventory does not match the current Lua script (or script is unavailable); review all effects again.");
  }
  const verified = warnings.length === 0;
  const omitted = effects.filter(effect => effect.status === "unsupported");
  for (const effect of omitted) warnings.push("Effect not implemented: " + effect.label + " - " + effect.reason);
  return { status: verified ? omitted.length ? "partial" : "complete" : "unverified", basis: "reviewed-inventory",
    implemented: effects.filter(effect => effect.status === "implemented").length, total: effects.length, effects, warnings };
}
