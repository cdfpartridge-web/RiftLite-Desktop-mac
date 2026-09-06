# Card artwork audit — 2026-09-05

The user reported missing alternate artwork, particularly signed variants, and requested a completeness check. This work updates local desktop and website source. It does not rebuild an installer, install, change versions, commit, publish, deploy or modify production data. Preserve the existing maintenance/modularisation changes and the five historical untracked entries described in `START_HERE.md`.

## Coverage and source evidence

The complete [official English Riot gallery](https://playriftbound.com/en-us/card-gallery/) was fetched on 2026-09-05. Its 1,189 distinct prints were compared by normalized collector identity and Riot image hash against the packaged desktop registry and the live, fully paginated RiftCodex API. The previous 1,180-print registry matched RiftCodex, but both lacked nine prints already published in Riot's gallery.

| Set | Official prints | Previous desktop prints | Signed prints now |
| --- | ---: | ---: | ---: |
| Origins (OGN) | 352 | 352 | 12 |
| Proving Grounds (OGS) | 24 | 24 | 0 |
| Spiritforged (SFD) | 288 | 288 | 12 |
| Unleashed (UNL) | 288 | 288 | 12 |
| Vendetta (VEN) | 237 | 228 | 9 |
| Total | 1,189 | 1,180 | 45 |

The missing signed Vendetta prints are `VEN-189*` Akali, `VEN-190*` Renekton, `VEN-191*` Zed, `VEN-192*` Nasus, `VEN-193*` Shen, `VEN-194*` Jayce, `VEN-195*` Mel, `VEN-196*` Ambessa and `VEN-197*` Kennen. Riot uses `*` in collector codes and `-star` in gallery slugs; Atlas image filenames use `S`.

All 1,189 unique official artwork URLs returned HTTP 200 with image content types. No other print IDs were missing or extra. This coverage is relative to those five sets in the official English gallery on the audit date; it is not a claim about every regional/event promotional printing outside that gallery or future releases.

The only existing image asset that changed was `VEN-096`: Riot corrected the printed title from **Shadowcloaked Lurker** to **Shadowblade Lurker**. Visual comparison found the illustration, cost/might, rules and collector number unchanged. The updated registry uses the corrected image and retains the old image hash as an alias so existing captures still resolve.

## Local changes

- Add the nine signed prints through the existing official-gallery overlay, including distinct artwork, artist attribution and provenance. Preserve their unsigned counterparts' gameplay identities and metadata.
- Raise Vendetta validation floors to 237 prints, 27 Legends and nine signed prints, and explicitly require all nine signed IDs. A successful upstream refresh alone previously failed to expose this gap.
- Preserve exact alternate/signed artwork in desktop presentation and accept Atlas's `S` spelling when a corresponding signed print exists. Keep gameplay keys, counts and grouping unchanged.
- Repair website collector parsing for signed `*`, encoded `%2A` and `-star` forms; carry supported token/special codes through TCGA ingestion. Keep the existing Atlas `S` artwork convention.
- Synchronize the website's derived card metadata and complete the explicit Vendetta signed-art mappings.

The website worktree is `C:\Users\cdfpa\OneDrive\Documents\Claude\Projects\RiftLite\.codex-worktrees\zelonius-web-20260826`, branch `codex/public-cards-up-combiner`, HEAD `135d239`. Its source changes are local and undeployed. Desktop remains on `hotfix/atlas-shell-recovery` at `23893a6` with earlier uncommitted work preserved. Existing installers and the public v0.9.72 releases do not contain these updates.

## Validation and evidence

Audit evidence is under ignored `output/card-art-audit-20260905/`: the complete official gallery response, before/after catalogue comparisons, RiftCodex per-set responses and comparison, all-image HTTP checks, and the VEN-096 visual comparison. The after-comparison confirms 1,189 matching print IDs and image hashes, no removed existing cards, and preserved historical image hashes.

Final validation:

- Desktop TypeScript passed. The full suite passed **193 files / 1,924 tests**. The live `cards:registry:check` passed with 1,189 prints, 1,191 recognized image hashes (including historical aliases) and seven special battlefields.
- Website full suite passed **137 files / 1,031 tests**, with one file / nine tests skipped by the existing configuration. The successful run used `node node_modules/vitest/vitest.mjs run --maxWorkers=2`; all assertions and timeouts were retained. Earlier default-worker runs hit intermittent existing replay-player timing failures. Two fixed catalogue-count assertions were updated from 1,180 to 1,189.
- Website targeted ESLint passed. Its complete TypeScript check still reports ten existing test-fixture diagnostics. A read-only compiler-host comparison against HEAD reproduced exactly the same paths, lines and messages; no new diagnostics were introduced. Unrelated test fixtures were left unchanged.
- Independent catalogue, renderer and website review found no remaining actionable concern. Imported explicitly selected artwork remains preserved, including an explicitly imported old VEN-096 image; default artwork uses the corrected title. Image-hash aliases can represent legitimate alternate art and are not treated as automatic replacement instructions.
- Git whitespace checks passed. Existing source changes and historical untracked entries were preserved. The canonical public installer retains SHA-256 `7E27AA6E2EAC45F25A9F94C8D2223B2B191AB173B3A6775602E537747D0ED5D4`; the earlier local installer retains `B862DEB46A7B13C8A0B6E5AB4FA83420ABA92FC982956F3488C9B9C76BB1ABAC`.

Desktop logs are `desktop-tests.log`, `desktop-typecheck.log` and `registry-check.log` in the audit output directory. Website full-suite evidence is also copied there as `website-tests.log`; its original is in the website worktree at `output/card-art-full-tests-direct-20260905-092145.log`. `website-typescript-baseline.json` records the completed comparison against HEAD. `source-manifest.json` fingerprints the modified/new source and test files in both worktrees, including the preserved earlier desktop changes; `validation-evidence.json` summarizes the final checks.

No production build, installed-app check or signed-in gameplay acceptance is implied by these checks. These changes remain source-only and uncommitted in their respective worktrees.
