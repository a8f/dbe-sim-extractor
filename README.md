# Dueling Book Enhancer simulator extractor

Optional development tool for extracting local YGOPRO behavior into data-only
schema-3 Dueling Book Enhancer rules. Requires **Node.js 22.13+** and no npm
packages. The extension does not need this repository to build, test or run.

## Repository boundary

This repository contains generic extraction/compiler code, format profiles,
source links and synthetic tests. Actual card identities, reviewed effects,
exceptions, comparison notes and generated lists belong exclusively in the
separate [db-auto-card-rules](https://github.com/a8f/db-auto-card-rules) repository.
No real-card mapping, downloaded ruling database, card JSON or source snapshot
is bundled here. Tests use fictional cards and create their data at runtime.

The Git ignore rules exclude caches, downloads, external reviews, generated
reports and database files. A repository-boundary check validates tracked paths,
format profiles and literal passcodes outside synthetic checks. Never force-add
local source data to this repository.

Run `npm run setup-hooks` once after cloning to install the included staged-data
pre-commit check. The repository's `AGENTS.md` records this boundary for future work.

## Usage

From this repository (replace the placeholders):

```powershell
# Inspect installed simulator behavior
node extract-card-rules.mjs <passcode>

# Look up a card name in the local simulator database
node extract-card-rules.mjs "Example Recruiter"

# Load reviewed mappings from the separate card-rules checkout
node extract-card-rules.mjs <passcode> --ruleset edison --reviews ../personal-rules/edison.reviews.json

# Write to any existing list; infers edison.reviews.json beside edison.json
node extract-card-rules.mjs <passcode> --ruleset edison --write ../personal-rules/edison.json

# Names work with the same historical review and write workflow
node extract-card-rules.mjs --name "Example Recruiter" --ruleset edison --write ../personal-rules/edison.json
```

As an extension submodule, prepend `card-rule-extractor/` to the command.
Destinations and `--reviews` paths are relative to the current working directory.
There is no hardcoded output list or card-rules checkout dependency. Multiple
printed passcodes can be separated by spaces or commas. Leading zeroes are
preserved in JSON; script filenames use the numerical ID.

Quoted names and printed passcodes can be mixed in one command. Quote each name
separately; comma-separated batches apply only to numeric IDs, so commas inside
card names are preserved. Repeatable `--name` explicitly forces name lookup,
including for names made entirely of digits. Name lookup uses only the selected
installation's read-only `cards.cdb`, with no catalog download or bundled data.
Matching ignores case, repeated whitespace and typographic apostrophe/dash
variants. Full names take precedence; a partial name is accepted only when unique.
Ambiguous names report candidate names/passcodes and prevent the entire batch
write. A miss also prevents writes. Name/ID duplicates resolve to one extraction;
the report and generated rules always use canonical database names and passcodes.

`--simulator <directory>` accepts an application root, YGOPRO directory or script
directory. The default is `C:\Yu-Gi-Oh! The Dawn of a New Era\YGOPRO`. The tool
reads `cards.cdb` read-only, card Lua and `script/utility.lua`. It never executes
Lua or changes the simulator. JSON reports go to stdout; errors use exit status 1.
Keep saved reports in the ignored `reports/` directory or outside this repository.

## Historical mappings

`--ruleset simulator` translates installed behavior without claiming a master
rule or historical correctness. It cannot write lists containing Edison formats.
`--ruleset edison` selects the original Master Rule era, April 2010 TCG baseline.
The generic profile records global rules and source links; it contains no cards.
Master-rule selection alone cannot restore historical errata or helper behavior.

Reviewed mappings are loaded from an **external** sidecar document:

* `schemaVersion`: 1
* `ruleset`: the selected historical profile ID
* `cards`: a map from printed passcode to reviewed effect facts/corrections

Each approved entry contains its card name, review date and source links, an
`effect`, and optional `corrections`, manual responsibilities and comparison
sources. The source-specific document itself belongs in db-auto-card-rules.
`--reviews` selects it explicitly. When writing, the default sidecar is the
output filename with `.json` replaced by `.reviews.json` in the same directory.
Missing mappings produce diagnostics and research suggestions instead of being
silently approved. Malformed or mismatched review documents stop before writing.

The generic effect vocabulary currently supports a graveyard ignition self-banish
cost followed by a Deck summon with independent source/target selectors and ATK/DEF
choices. Corrections cover face-up activation prohibitions and destruction of a
Deck copy if no monster zone remains at resolution. Historical compilation can
correct or reconstruct the effect independently of incompatible modern Lua.

Reports cite the external review and explain changes from the simulator. The
writer recompiles the external mapping and compares the result before saving;
a report's approval flag cannot bypass that check. New operation kinds need a
generic adapter and lifecycle/protocol tests. Card-specific entries never belong
in extractor code. Global priority, negation and replacement effects remain
manually adjudicated in native Edison mode.

## Automatic source downloads and permanent cache

Edison extraction automatically looks up requested cards from these sources:

* [Historical card-ruling sections](https://www.edisonformat.com/rulings)
* [Revised card search](https://edisonformat.net/card), whose public JSON source
  is `https://raw.githubusercontent.com/MikaMikaDE/mikaRulings/main/cards/{numeric-passcode}.json`

`--research` also enables source lookup for simulator-profile previews. Historical
and revised policies are returned separately, with recognized correction
suggestions. Unknown clauses stay in the report for developer review; research
never silently approves arbitrary prose as executable actions.

Missing data is downloaded on demand into **`.cache/rulings/`**, which Git ignores.
Validated cached HTML/JSON is reused indefinitely, with no TTL or background
refresh. Data is fetched again only if missing/invalid or explicitly refreshed.
Set `DBE_SIM_EXTRACTOR_CACHE` to use another local directory.

```powershell
# Replace cached source responses for the requested card(s)
node extract-card-rules.mjs <passcode> --ruleset edison --refresh-rulings

# Clear only this tool's hashed cache files (no card ID needed)
node extract-card-rules.mjs --clear-cache
```

Deleting the cache directory manually also works. Failed refreshes preserve
usable existing data and report the failure. Sources unavailable on first use
produce explicit diagnostics; reviewed external mappings can still compile.
Downloads are size-bounded, omit credentials and do not follow redirects.
No downloaded source is automatically committed or uploaded.

## Writes and checks

`--write <path>` preserves list ID, formats, version, enablement, unrelated rules
and existing source-card rule IDs. New rule IDs derive from the supplied passcode.
Repeated imports are idempotent. All requested cards must translate or reconstruct
and pass review before any write. Multiple effects for one source require manual
merging. Validated output is saved through a temporary sibling and rename with a
concurrent-edit check. The extractor does not publish Git changes or install lists.

```powershell
node --test checks/*.check.mjs

# Optional compatibility against an extension checkout
$env:DBX_EXTENSION_DIR = "C:\path\to\Dueling-Book-Enhancer"
node --test checks/*.check.mjs
```

The checks use mocked HTTP and synthetic temporary SQLite/review data, so they
need neither the simulator nor the card-rules repository. `schema-3.mjs` vendors
the extension contract to keep this repository independent. Reload the extension
after adapter changes before using new JSON fields; later list edits can flow
through the local watcher.
