import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

test("extractor tracks no actual card mappings, downloaded sources or generated data", async () => {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const git = args => execFileSync("git", ["-c", "safe.directory=" + root.replaceAll("\\", "/"), "-C", root, ...args], { encoding: "utf8" });
  const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  for (const file of files) {
    assert.ok(!/^(?:\.cache|data|downloads|reviews|reports)\//.test(file), "Generated/downloaded data tracked: " + file);
    assert.ok(!/\.(?:cdb|har|html|reviews\.json|extraction\.json)$/.test(file), "External data tracked: " + file);
    const text = git(["show", ":" + file]);
    if (!file.startsWith("checks/")) assert.ok((text.match(/\b\d{7,8}\b/g) || []).every(value => /^0+$/.test(value)), "Literal card identifier outside synthetic fixtures: " + file);
    if (file.endsWith(".json")) {
      assert.ok(file === "package.json" || /^rulesets\/[a-z0-9-]+\.json$/.test(file) ||
        /^schemas\/card-(action-v3|rule-list-v4)\.schema\.json$/.test(file), "Non-contract/format JSON tracked: " + file);
      if (file.startsWith("rulesets/")) assert.equal(Object.hasOwn(JSON.parse(text), "cards"), false, "Format profile must not embed card mappings");
    }
  }
  const ignored = execFileSync("git", ["-c", "safe.directory=" + root.replaceAll("\\", "/"), "-C", root,
    "check-ignore", ".cache/rulings/example.json", "downloads/source.json", "reviews/example.reviews.json", "reports/example.json"], { encoding: "utf8" });
  assert.equal(ignored.trim().split(/\r?\n/).length, 4);
});
