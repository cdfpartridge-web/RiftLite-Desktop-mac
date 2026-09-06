# RiftLite maintenance implementation — 2026-09-04

Latest continuation: [Replay Coach implementation and local rebuild, 2026-09-06](./REPLAY-COACH-2026-09-06.md). The user authorized the new Coach implementation and a local installer containing this maintenance work, its follow-ups and the signed-art fixes. This supersedes the earlier installer status below; public assets and deferred live-game acceptance remain unchanged.

Subsequent source work is recorded in [the 2026-09-05 card artwork audit](./CARD-ART-AUDIT-2026-09-05.md). It adds local desktop and website fixes on top of the maintenance changes below. Existing installers and public assets remain unchanged.

## Latest source follow-up — 22:49 BST

The user requested complete generated-output cleanup and gradual modularisation of `App.tsx` and `main.ts`. These changes are **local and uncommitted after checkpoint `23893a648349ccda30ae87ee298fcab4e0be91fa`**. The 22:35 installer below remains unchanged and does **not** contain this source follow-up. No installer rebuild, installation, version change, push or publication was performed. Live gameplay validation remains explicitly deferred.

- `npm run build` now runs `build:clean` before Electron, game-preload and renderer compilation. `scripts/clean-build-output.mjs` derives the checkout from its own location, verifies the project and fixed `dist` boundary, and rejects symlinks/junctions before any removal. Standalone compiler commands remain available. Tests exercise complete output removal, protected adjacent files, missing output, unexpected paths, links and a foreign working directory.
- The real clean build removed `dist/main/services/replayVideoOrganizer.js` and its map, and `dist/shared/privateHubReplayLibrary.js` and its map. Current Electron/preload/shared/renderer output was regenerated successfully.
- `src/renderer/deckComparison.ts` now owns saved/community deck comparison, inclusion averages, labels and row ordering. App retains its state and UI. About 214 lines moved, with direct tests of parsing, aggregation, rounding, labels, sorting, stable ties and input preservation.
- `src/main/services/replayMp4RenderPlan.ts` now owns MP4 geometry, clipping, overlay/voice timing and SVG generation. Main retains export I/O and lifecycle orchestration. 317 lines moved, with direct tests of crop/clip boundaries, timing fallbacks, escaping and invalid coordinates. Existing edge behaviour is preserved.
- Independent comparison found **all 7 deck-comparison and 20 MP4 function bodies unchanged**. Cleanup and extraction reviews found no actionable concerns.

Validation completed at **22:49 BST**: TypeScript check, the account-sync gate (**5 files / 82 tests**), the complete suite (**192 files / 1,903 tests**), the full clean production build and isolated startup of the fresh compiled main/preloads/renderer all passed. The startup check used the development Electron executable with `NODE_ENV=production` and the production `dist/renderer/index.html`, isolated data paths and blocked external networking. It is unpackaged startup evidence, not installer or live-game acceptance. The known blocked-guest IPC messages and Vite large-chunk warning remain.

Evidence is under `output/maintenance-modules-20260904-2250`: `source-manifest.json`, stage logs, `validation-evidence.json` and the isolated startup snapshot/logs. Source hashes stayed unchanged throughout validation. Both the canonical public installer and the earlier local candidate retained their recorded hashes. The five historical untracked entries remain untouched; no files were staged.

## Earlier maintenance checkpoint and installer — 22:35 BST

The remaining sections preserve the earlier checkpoint and candidate evidence. Their package audit and installer hashes apply to that checkpoint, not the later uncommitted source above.

This continues the Atlas Player-field checkpoint in [HANDOVER-2026-09-04.md](./HANDOVER-2026-09-04.md). The user authorized the reviewed improvements, local Windows rebuilds, renderer-output cleanup and a Git checkpoint. This document accompanies the checkpoint of the intended source, tests and handovers on `hotfix/atlas-shell-recovery`, following `e6b5a79001efe1b63cf93f39d95094ac65052f53`. Use the read-only handover snapshot for the exact current commit. No version bump, installation, push, tag, publication, website deployment or production-data change was performed.

The latest local Windows candidate completed successfully on **2026-09-04 at 22:35 BST**. The earlier 22:15 candidate is preserved as build history. The user explicitly chose to **leave live gameplay validation pending**.

## Implemented changes

- **Replay cache:** `RiftLiteStore` uses a generation counter and promise ownership. A payload read that began before a committed mutation can finish for its original caller, but cannot repopulate the shared cache or clear a newer load's promise. Tests pause real payload hydration across save, update, delete and restore, and exercise both overlapping completion orders.
- **Cloud backup projection:** account sync requests `includeReplays: false` before reading/hydrating/sanitizing replay payloads. Local backups still include replay and recycle-bin payloads by default. Tests check actual cloud content/redaction, skipped hydration and local backup/restore round trips.
- **Settings defaults:** `createDefaultSettings()` replaces parallel store/renderer definitions and returns fresh nested values. All 72 previous top-level defaults and their nested values were compared with the former store definition. The renderer explicitly retains its boot-only `firstRunComplete` and `lastSeenVersion` overrides.
- **Voice playback:** video and slideshow use one runtime with owned audio, timers and request identity. Rejected start/resume, media errors, replacement, replay changes and unmount release resources. Existing video seeking, audio volume/mute and annotation timing remain in the UI adapter.
- **Floating-panel gestures:** deck tracker and matchup prep share pointer-listener/capture ownership. Unmount/lost capture cancels without a pill action or persistence callback; ordinary pointer completion/cancellation retains the existing clamping, position and pill behavior.
- **MP4 export:** both formats use `ReplayMp4ExportLifecycle` for their shared lock, request identity, progress/diagnostics, last successful output and terminal handling. Main retains the actual encoding/validation/staging logic and deferred-close/updater integration. The lock is released before terminal notification, with no success event on dialog cancellation.
- **Mutation queue:** `SerialMutationQueue` makes the existing save/clear ordering and rejection recovery directly executable in tests. Existing store/capture/restore queues retain their separate responsibilities.
- **Atlas recovery:** `AtlasGuestRecoveryLifecycle` shares committed URL/epoch identity without merging the independent recovery budgets. A prevented navigation cancels stale callbacks but retains the surviving lobby. Pending replacement navigation blocks outgoing readiness; a committed document can report readiness while subresources load. `AtlasCompatibilityStyleInstaller` owns baseline insertion, retries and stale-insertion cleanup. The dedicated Player-field fallback and capture/game-entry fences remain intact.
- **Renderer build output:** Vite now empties only `dist/renderer` before building. Repeated builds no longer accumulate obsolete hashed assets that electron-builder would package. A real two-build fixture verifies stale-file removal, current HTML/public assets and preservation of the sibling main, preload, game-preload and shared output. No runtime source was changed in this cleanup follow-up.

Critical lifecycle tests now execute production modules instead of VM-extracting selected `main.ts` fragments or inferring ordering from code strings. Narrow wiring assertions remain where they check application integration.

## Validation

- TypeScript check passed.
- Account-sync gate: **5 files / 82 tests passed**.
- Latest complete suite: **189 files / 1,861 tests passed**. The added renderer-output regression also passed independently; the latest full gate passed on its first run.
- Independent reviews found no remaining actionable issue in the data/export, renderer or Atlas changes. An outgoing-readiness budget issue caught in review was fixed and covered by a regression.
- The first full run passed 1,859 tests but hit the previously documented five-second packaging-config timeout. The real electron-builder config integration test now has a scoped 20-second timeout; its behavior assertions and ordinary unit-test timeout remain unchanged. Isolation and the complete gate then passed.
- Hidden native Electron probes use the actual lifecycle and CSS adapters against the public signed-out Atlas lobby. At **1690 × 945, DPR 1**, a same-URL reload reproduced the collapsed field, and the fallback restored it to about **391 × 44**, focusable. At **DPR 2**, the host limited the actual viewport to **952 × 498**; healthy field safety passed. Both runs observed and prevented a real navigation start, retained the lobby, and passed protected-guest, duplicate/SPA-budget, reload, focus and zoom checks.
- Native logs remain in `output/local-maintenance-20260904-2155` as `native-atlas-dpr1.log` and `native-atlas-dpr2.log`. These are signed-out layout/lifecycle checks, not completed-match acceptance. They were not repeated for the output-only cleanup; packaged active renderer and Electron code remained byte-identical.
- Electron/game-preload/Vite production builds, Windows NSIS packaging, installer/blockmap/updater/executable verification and isolated packaged startup all passed. The existing Vite large-chunk warning remains. Packaged smoke still prints the previously documented rejected background `capture:debug-enabled`, `capture:tcga-replay-research-active` and `capture:renderer-event` calls while external guest navigation is blocked; do not describe it as error-free or signed-in game acceptance.
- The latest ASAR audit verified **15 active packaged files** byte-for-byte against fresh `dist/` output, including the new services/defaults and dedicated Atlas fallback. It additionally checked the **entire packaged renderer file set and hashes**, with no missing or extra files. The source manifest was unchanged throughout the successful build.
- Renderer output fell from **891 files / 658,270,299 bytes** to **3 files / 2,823,692 bytes**. All **888 obsolete renderer files** were removed. The surviving renderer files and **277 Electron sibling files** were byte-identical before and after the build. The installer shrank from **264,688,336** to **159,347,347 bytes** (39.8%).
- Cleanup was deliberately limited to renderer output. Four small pre-existing orphan TypeScript output files outside that directory remain; this is not a claim that every historical `dist/` artifact was removed.

## Local candidate

The established Windows pipeline is run with `--publish never` and its output redirected to:

```text
C:\Users\cdfpa\OneDrive\Documents\Claude\Projects\Riftlite Beta 0.6\desktop-v06\output\local-maintenance-clean-20260904-2232
```

`run-build.cjs` runs the release gate, production builds, Windows NSIS packaging, installer/updater/executable verification and isolated packaged smoke. It removes `ELECTRON_RUN_AS_NODE` from the child environment and refuses success if source hashes change during the run. `source-manifest.json`, step logs and `build-evidence.json` identify the local source and artifact bytes. `dist-before.json` and `dist-after.json` record the cleanup and preserved sibling output. `audit-package.cjs` verifies active packaged code and the complete renderer contents. The build preceded the Git checkpoint; `checkpoint-evidence.json` links its unchanged source manifest to the resulting commit.

| Local artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `RiftLiteBetaInstall.exe` | 159,347,347 | `B862DEB46A7B13C8A0B6E5AB4FA83420ABA92FC982956F3488C9B9C76BB1ABAC` |
| `win-unpacked/resources/app.asar` | 93,976,375 | `C1867FB073581B2AB6ED508724513A65925955ABC299B24B28F627F3E68A524B` |

Blockmap, updater manifest and executable hashes are also recorded in [build-evidence.json](../output/local-maintenance-clean-20260904-2232/build-evidence.json). The [package audit](../output/local-maintenance-clean-20260904-2232/package-audit.json) records the verified active files, renderer cleanup and preserved public installer hash. The earlier candidate and its hashes remain in `output/local-maintenance-20260904-2155/build-evidence.json`.

The candidate retains version **0.9.72**, so version text alone cannot distinguish it from public v0.9.72. Use its full path and artifact hashes. The canonical `release/RiftLiteBetaInstall.exe` remains the public installer with SHA-256 `7E27AA6E2EAC45F25A9F94C8D2223B2B191AB173B3A6775602E537747D0ED5D4`.

The earlier five historical untracked entries remain untouched: the three v0.9.70 documents, `tmp-app-diff.txt`, and `tmp/`. Do not stage or clean them.

## Remaining acceptance

The user explicitly deferred live gameplay validation during this continuation. Before a public release, exercise the candidate in a signed-in disposable session on the tester's actual display: Player-name typing, Home/Play and alt-tab transitions, Find Match/Host Room, a controlled match with capture/replay off and on, and replay playback/export. Native interaction checks for voice playback and panel dragging across view changes remain useful. Existing isolated behavioral and packaged-startup checks do not establish end-to-end match acceptance.

No next release version has been selected. Public Windows/macOS v0.9.72 tags and assets remain immutable and unchanged.
