# Extractor repository boundary

Keep this repository generic. Do not add real card names, passcodes, reviewed
card effects, card exceptions, card-specific source links or generated card rules
to its code, format profiles, documentation or Git history. Actual card mappings
and review sidecars belong in the separate db-auto-card-rules repository.

Format-wide rules, source database URLs, URL templates, parsing/compiler logic
and handling patterns are allowed. Tests must use fictional identities and
synthetic data; create external review documents and databases in temporary
directories. Never copy a real card into a fixture.

Download third-party JSON/HTML on demand into the ignored cache. Keep cached
rulings indefinitely until an explicit refresh/clear request. Never force-add
cache/download/report files or external review sidecars to this repository.

Run `node --test checks/*.check.mjs` before publishing. The repository-boundary
check inspects staged content and must pass before any commit. Install the
provided pre-commit hook with `npm run setup-hooks` in this repository.
