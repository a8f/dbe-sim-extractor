const normalize = value => value.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

// Names resolve only against the selected installation, never a bundled catalog.
// Exact names take precedence; partial names must identify exactly one passcode.
export function resolveCardInputs(inputs, db, normalizePasscode) {
  let catalog;
  const seen = new Set();
  const resolved = [];
  for (const input of inputs) {
    const explicitName = input !== null && typeof input === "object" && typeof input.name === "string";
    const value = explicitName ? input.name : String(input);
    let passcode;
    if (!explicitName && /^\d+$/.test(value)) {
      passcode = normalizePasscode(value);
    } else {
      const query = normalize(value);
      if (!query || query.length > 160) {
        resolved.push({ input: value, status: "unsupported", reason: "Supply a card name between 1 and 160 characters." });
        continue;
      }
      catalog ||= db.prepare("SELECT id, name FROM texts WHERE id > 0 AND id < 1e8").all()
        .filter(card => typeof card.name === "string" && card.name.trim())
        .map(card => ({ passcode: normalizePasscode(card.id), name: card.name, normalized: normalize(card.name) }));
      const exact = catalog.filter(card => card.normalized === query);
      const matches = exact.length ? exact : catalog.filter(card => card.normalized.includes(query));
      if (matches.length !== 1) {
        resolved.push({ input: value, status: "unsupported",
          reason: matches.length ? "Ambiguous card name: " + value + ". Supply a full name or choose a printed passcode from candidates." : "No card name matches " + value + " in the simulator database.",
          candidates: matches.slice(0, 20).map(({ passcode, name }) => ({ passcode, name })), candidateCount: matches.length });
        continue;
      }
      passcode = matches[0].passcode;
    }
    if (!seen.has(passcode)) { seen.add(passcode); resolved.push({ passcode }); }
  }
  return resolved;
}
