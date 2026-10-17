import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, stat, mkdir, rename, unlink, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const defaultCacheDirectory = process.env.DBE_SIM_EXTRACTOR_CACHE || fileURLToPath(new URL("./.cache/rulings/", import.meta.url));

export async function clearRulingsCache(directory = defaultCacheDirectory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return 0; throw error; }
  let removed = 0;
  for (const entry of entries) {
    // Only this tool's cache files; never recursively delete a supplied directory.
    if (entry.isFile() && /^[a-f0-9]{64}\.json$/.test(entry.name)) {
      await unlink(path.join(directory, entry.name)); removed++;
    }
  }
  return removed;
}

const normalize = text => text.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toUpperCase();
function decode(text) {
  return text.replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|quot|apos|nbsp|lt|gt));/gi, (all, decimal, hex, named) => {
    if (decimal || hex) {
      const number = parseInt(decimal || hex, hex ? 16 : 10);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "";
    }
    return { amp: "&", quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">" }[named.toLowerCase()];
  });
}

export function historicalSection(html, name) {
  const lines = decode(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\b[^>]*>|<\/(?:p|div|li|h[1-6])\s*>/gi, "\n").replace(/<[^>]*>/g, ""))
    .split(/\n+/).map(line => line.trim()).filter(Boolean);
  const start = lines.findIndex(line => normalize(line) === normalize(name));
  if (start < 0) throw new Error("Historical card section not found for " + name);
  const selected = [];
  for (const line of lines.slice(start + 1)) {
    if (line.length < 120 && /[A-Z]/.test(line) && line === line.toUpperCase() && !/^\(?\d|[●•]/.test(line)) break;
    selected.push(line);
  }
  if (!selected.length) throw new Error("Historical card section is empty for " + name);
  return selected.join("\n");
}

// Recognized clauses produce research suggestions, never an unreviewed write.
// Unknown text remains alongside them so the developer can supply the missing
// mapping or adapter without having to reverse-engineer the simulator again.
export function suggestCorrections(text) {
  const suggestions = [];
  for (const match of text.matchAll(/cannot activate while\s+["“]([^"”]+)["”]\s+is in play/gi)) {
    suggestions.push({ kind: "activation-prohibition", cardName: match[1] });
  }
  if (/no open Monster Card Zones[\s\S]*?resolves[\s\S]*?destroyed and sent to (?:the )?(?:Graveyard|GY)/i.test(text)) {
    suggestions.push({ kind: "no-monster-zone-destroy-deck-copy" });
  }
  return suggestions;
}

async function download(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error("Rulings lookup failed (HTTP " + response.status + ")");
  if (Number(response.headers.get("content-length")) > 2 * 1024 * 1024) throw new Error("Rulings source exceeds 2 MB");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Rulings source has no readable body");
  const chunks = []; let bytes = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    bytes += next.value.byteLength;
    if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("Rulings source exceeds 2 MB"); }
    chunks.push(Buffer.from(next.value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readSource(url, fetchImpl, { cacheDirectory = defaultCacheDirectory, refresh = false }, parse) {
  const filename = cacheDirectory ? path.join(cacheDirectory, createHash("sha256").update(url).digest("hex") + ".json") : null;
  let cached;
  if (filename) {
    try {
      if ((await stat(filename)).size > 3 * 1024 * 1024) throw new Error("Oversized cache");
      const candidate = JSON.parse(await readFile(filename, "utf8"));
      if (candidate.url !== url || typeof candidate.body !== "string" || !Number.isFinite(candidate.fetchedAt) || candidate.fetchedAt > Date.now()) throw new Error("Invalid cache");
      cached = { ...candidate, parsed: parse(candidate.body) };
    } catch { /* Missing, corrupt or incompatible cache: fetch the source. */ }
    if (cached && !refresh) return { ...cached.parsed, cache: "cached" };
  }
  let body, parsed;
  try { body = await download(url, fetchImpl); parsed = parse(body); }
  catch (error) {
    if (cached) return { ...cached.parsed, cache: "cached", warning: "Using existing cached rulings because refresh failed: " + error.message };
    throw error;
  }
  if (filename) {
    const temporary = filename + "." + randomUUID() + ".tmp";
    try {
      await mkdir(cacheDirectory, { recursive: true });
      await writeFile(temporary, JSON.stringify({ url, fetchedAt: Date.now(), body }), { flag: "wx" });
      await rename(temporary, filename);
    } catch (error) { parsed.cacheWarning = "Could not cache rulings: " + error.message; }
    finally { await unlink(temporary).catch(() => {}); }
  }
  return { ...parsed, cache: filename ? "downloaded" : "disabled" };
}

export async function researchRulings(card, fetchImpl = globalThis.fetch, cacheOptions = {}) {
  if (!/^\d{8}$/.test(card.passcode) || !card.name) throw new Error("Rulings lookup requires a card name and passcode");
  const groups = ["a-c", "d-e", "f-h", "i-k", "l-o", "p-r", "s-t", "u-z"];
  const letter = normalize(card.name)[0]?.toLowerCase();
  const group = groups.find(group => letter >= group[0] && letter <= group[2]);
  const historicalUrl = group ? "https://www.edisonformat.com/rulings/individual-rulings-" + group : null;
  const revisedUrl = "https://raw.githubusercontent.com/MikaMikaDE/mikaRulings/main/cards/" + Number(card.passcode) + ".json";
  const requests = [
    async () => {
      if (!historicalUrl) throw new Error("No alphabetical historical section for this card name");
      return readSource(historicalUrl, fetchImpl, cacheOptions, html => {
        const text = historicalSection(html, card.name);
        return { policy: "historical", url: historicalUrl, sha256: createHash("sha256").update(text).digest("hex"), text, suggestions: suggestCorrections(text) };
      });
    },
    async () => {
      return readSource(revisedUrl, fetchImpl, cacheOptions, body => {
      const data = JSON.parse(body);
      if (Number(data.id) !== Number(card.passcode) || normalize(data.name) !== normalize(card.name)) throw new Error("Revised ruling identity mismatch");
      const text = data.Rulings?.Edison;
      if (typeof text !== "string" || !text || /No rulings found/i.test(text)) throw new Error("No revised Edison rulings available");
      return { policy: "revised", url: "https://edisonformat.net/card?name=" + encodeURIComponent(card.name), dataUrl: revisedUrl,
        sha256: createHash("sha256").update(text).digest("hex"), text, psct: data.PSCT?.Edison, suggestions: suggestCorrections(text) };
      });
    }
  ];
  return Promise.all(requests.map(async (request, index) => {
    try { return await request(); } catch (error) { return {
      policy: index === 0 ? "historical" : "revised", url: index === 0 ? historicalUrl : revisedUrl, error: error.message
    }; }
  }));
}
