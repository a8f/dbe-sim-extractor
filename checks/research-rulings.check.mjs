import { test } from "node:test";
import assert from "node:assert/strict";
import { historicalSection, researchRulings, suggestCorrections, clearRulingsCache } from "../research-rulings.mjs";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const card = { passcode: "09000001", name: "Example Recruiter" };
const paragraph = 'This effect cannot activate while "Example Prohibition" is in play.';
const overflow = "No open Monster Card Zones at the point the effect resolves: a copy is destroyed and sent to the GY.";
const html = `<script>bad()</script><div>EXAMPLE RECRUITER<br>${paragraph}<br>${overflow}</div><div>EXAMPLE TARGET<br>Unrelated clause</div>`;

test("extracts the requested historical section without swallowing neighboring cards", () => {
  const text = historicalSection(html, card.name);
  assert.ok(text.includes(paragraph));
  assert.ok(text.includes(overflow));
  assert.ok(!text.includes("Unrelated"));
  assert.ok(!text.includes("bad()"));
  assert.deepEqual(suggestCorrections(text), [
    { kind: "activation-prohibition", cardName: "Example Prohibition" },
    { kind: "no-monster-zone-destroy-deck-copy" }
  ]);
  assert.throws(() => historicalSection(html, "Not present"), /not found/);
});

test("ruling research fetches bounded sources with identity checks and separate policies", async () => {
  const urls = [];
  const research = await researchRulings(card, async (url, options) => {
    urls.push(url);
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    if (url.includes("edisonformat.com")) return new Response(html);
    return new Response(JSON.stringify({ id: 9000001, name: card.name, Rulings: { Edison: "A revised priority ruling" }, PSCT: { Edison: "Revised card text" } }));
  }, { cacheDirectory: false });
  assert.equal(research[0].policy, "historical");
  assert.equal(research[0].suggestions.length, 2);
  assert.equal(research[1].policy, "revised");
  assert.equal(research[1].psct, "Revised card text");
  assert.match(research[0].sha256, /^[a-f0-9]{64}$/);
  assert.ok(urls.some(url => url.endsWith("individual-rulings-d-e")));
  assert.ok(urls.some(url => url.endsWith("9000001.json")));
});

test("missing, mismatched, failed and oversized ruling sources remain explicit diagnostics", async () => {
  for (const response of [
    () => new Response("", { status: 404 }),
    () => new Response("{}", { headers: { "content-length": String(3 * 1024 * 1024) } }),
    () => new Response(new Uint8Array(2 * 1024 * 1024 + 1)),
    () => new Response(JSON.stringify({ id: 9000002, name: card.name, Rulings: { Edison: "Wrong card" } }))
  ]) {
    const results = await researchRulings(card, async () => response(), { cacheDirectory: false });
    assert.ok(results.every(result => result.error));
  }
  await assert.rejects(researchRulings({ ...card, passcode: "../9000001" }), /passcode/);
});

test("rulings cache persists indefinitely, refreshes explicitly and clears only owned files", async t => {
  const cacheDirectory = await mkdtemp(path.join(tmpdir(), "dbx-ruling-cache-"));
  t.after(() => rm(cacheDirectory, { recursive: true, force: true }));
  let requests = 0;
  const fetchImpl = async url => {
    requests++;
    return url.includes("edisonformat.com") ? new Response(html) : new Response(JSON.stringify({
      id: 9000001, name: card.name, Rulings: { Edison: "Example revised ruling" }
    }));
  };
  const first = await researchRulings(card, fetchImpl, { cacheDirectory });
  assert.equal(requests, 2);
  assert.ok(first.every(result => result.cache === "downloaded"));
  for (const file of await readdir(cacheDirectory)) {
    const filename = path.join(cacheDirectory, file);
    const cached = JSON.parse(await readFile(filename, "utf8"));
    cached.fetchedAt = 1; // An arbitrarily old valid cache must never expire.
    await writeFile(filename, JSON.stringify(cached));
  }
  const reused = await researchRulings(card, async () => assert.fail("Cache hit must not download"), { cacheDirectory });
  assert.ok(reused.every(result => result.cache === "cached"));
  assert.equal(requests, 2);
  const refreshed = await researchRulings(card, fetchImpl, { cacheDirectory, refresh: true });
  assert.ok(refreshed.every(result => result.cache === "downloaded"));
  assert.equal(requests, 4);
  const failedRefresh = await researchRulings(card, async () => { throw new Error("Offline"); }, { cacheDirectory, refresh: true });
  assert.ok(failedRefresh.every(result => result.cache === "cached" && result.warning.includes("Offline")));
  const files = await readdir(cacheDirectory);
  await writeFile(path.join(cacheDirectory, files[0]), "corrupt cache");
  const recovered = await researchRulings(card, fetchImpl, { cacheDirectory });
  assert.equal(requests, 5, "only corrupt source is downloaded again");
  assert.ok(recovered.every(result => !result.error));
  await writeFile(path.join(cacheDirectory, "unrelated.txt"), "keep");
  assert.equal(await clearRulingsCache(cacheDirectory), 2);
  assert.deepEqual(await readdir(cacheDirectory), ["unrelated.txt"]);
  assert.equal(await clearRulingsCache(cacheDirectory), 0);
  const afterClear = await researchRulings(card, fetchImpl, { cacheDirectory });
  assert.ok(afterClear.every(result => result.cache === "downloaded"));
  assert.equal(requests, 7);
});
