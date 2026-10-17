const normalize = value => value.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
const words = value => normalize(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/);

function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
  }
  return rows[a.length][b.length];
}

export function fuzzyScore(query, name) {
  const q = words(query).join(" "), tokens = words(name), full = tokens.join(" ");
  if (!q || !full) return 0;
  if (q === full) return 1;
  if (full.includes(q)) {
    const wholeWords = (" " + full + " ").includes(" " + q + " ");
    return (wholeWords ? 0.9 : 0.85) + 0.05 * q.length / full.length;
  }
  if (q.length < 4) return 0;
  const width = words(query).length;
  let similarity = 0;
  for (let i = 0; i <= Math.max(0, tokens.length - width); i++) {
    const window = tokens.slice(i, i + width).join(" ");
    similarity = Math.max(similarity, 1 - distance(q, window) / Math.max(q.length, window.length));
  }
  return similarity >= 0.65 ? 0.5 + similarity * 0.35 : 0;
}

// Names resolve only against the selected installation, never a bundled catalog.
// Exact names take precedence; partial names must identify exactly one passcode.
export function resolveCardInputs(inputs, db, normalizePasscode, options = {}) {
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
      const matches = exact.length ? exact.map(card => ({ ...card, score: 1 })) : options.fuzzy ? catalog
        .map(card => ({ ...card, score: fuzzyScore(query, card.name) })).filter(card => card.score > 0)
        .sort((a, b) => b.score - a.score || a.normalized.localeCompare(b.normalized, "en") || a.passcode.localeCompare(b.passcode)) :
        catalog.filter(card => card.normalized.includes(query));
      if (options.fuzzy) matches.sort((a, b) => b.score - a.score || a.normalized.localeCompare(b.normalized, "en") || a.passcode.localeCompare(b.passcode));
      if (matches.length !== 1) {
        resolved.push({ input: value, status: "unsupported",
          reason: matches.length ? "Ambiguous card name: " + value + ". Supply a full name or choose a printed passcode from candidates." : "No card name matches " + value + " in the simulator database.",
          candidates: matches.slice(0, 20).map(({ passcode, name, score }) => ({ passcode, name, ...(options.fuzzy ? { score } : {}) })), candidateCount: matches.length });
        continue;
      }
      passcode = matches[0].passcode;
    }
    if (!seen.has(passcode)) { seen.add(passcode); resolved.push({ passcode }); }
  }
  return resolved;
}
