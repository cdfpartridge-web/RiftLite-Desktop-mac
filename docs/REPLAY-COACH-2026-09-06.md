# Replay Coach implementation — 2026-09-06

## Latest source checkpoint — Coach parked

After trying the implementation, the user requested that Replay Coach be hidden again and revisited later. The Insights hub now shows the existing Coming Soon screen in Coach mode; it does not mount the active workflow, including when a previous session remembered Coach mode. Deck Insights remains available. Current availability copy has been restored to Coming Soon / returning later.

The implementation, journal and practice storage, evidence capture, and saved session state remain intact. No user data was cleared. All six Coach implementation/model/storage/style files were checked against the earlier candidate's source fingerprint and remain byte-identical. No installation or publication was performed.

The replacement local candidate completed at **11:33 BST** in `output/local-coach-hidden-20260906-1130`. It shows Coming Soon and does not include the active Coach interface in its renderer bundle. TypeScript, the account-sync gate, the full suite (**197 files / 1,995 tests**), clean production build, NSIS packaging, Windows artifact verification, isolated packaged startup and the complete **278-file package audit** passed. The audit also verified the Atlas fallback and current card registry. Source hashes and public artifacts stayed unchanged throughout the build. The known Vite chunk warning and isolated-smoke background IPC rejections remain as documented below; live gameplay acceptance is still pending.

| Current local artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `output/local-coach-hidden-20260906-1130/RiftLiteBetaInstall.exe` | 159,347,244 | `0F63A420DDA0F83C1E639554B13D83FB4E7865C4B1C70C3D1C6CF856A55A91BB` |
| `output/local-coach-hidden-20260906-1130/win-unpacked/resources/app.asar` | 93,975,341 | `CCF9B584D1541F2CDBDC19FB40E4A5DA803355304F5FEF8F80266BAF9C777D1A` |

Build evidence, source fingerprints and the package audit are in that candidate directory. The earlier **10:54 BST candidate below still contains the enabled Coach** and is preserved unchanged. Use the new 11:33 candidate for the hidden state. Both retain version 0.9.72; neither has been installed or published by this work.

Focused copy and integration validation passed: **3 files / 21 tests** (`homeSurfaceIntegration`, `enhancedInsightsIntro`, `enhancedInsightsSurfaceIntegration`).

## Earlier implementation checkpoint

The user approved implementing the clickable Replay Coach concept and rebuilding the Windows installer locally. This work is in the canonical desktop repository on `hotfix/atlas-shell-recovery`, after HEAD `23893a648349ccda30ae87ee298fcab4e0be91fa`. It preserves the existing maintenance, full-build cleanup, module extractions and signed-artwork changes. No version bump, installation, commit, push, tag, publication, website deployment or production-data change was performed.

## Implemented flow

In the earlier implementation and 10:54 BST local candidate, Replay Coach is available in **Insights → Replay Coach**. Deck Insights remains the first mode in a fresh app session; selecting Coach is remembered during navigation. Search Rules remains hidden. The latest source instead shows Coming Soon as described above.

- A real decision or review marker leads into recorded evidence, exact card artwork, a replay/time/event link and the frozen match-time Notebook plan. Basic replays can be reviewed manually. The UI never inserts the mockup's example data or treats a current Notebook plan as historical evidence.
- Intentional, Forced, Missed something and Unsure reflections change the question and response. Save just a note or choose an editable When / I'll practice cue, optionally linked to an existing Notebook goal.
- New practice requires a captured deck version, opponent, initiative and game stage. Only completed games captured after the trial started and matching that scope can be checked in. Edited/imported old games, incomplete games, source games, duplicate check-ins, merged/hidden/deleted sources and explicit capture opt-outs are excluded as appropriate.
- Targets are three or five opportunities. Used it, Adapted it, Didn't use it and No opportunity are stored separately; no opportunity does not consume the target. Legacy four-game trials remain readable.
- Continue and resume preserve trial identity, start time and check-ins. A completed trial accepts a conclusion, then Keep practising, Adjust cue or Finish practice. Another trial archives the previous cue and all check-ins. Finishing practice does not silently mark a linked Notebook goal Done; the UI directs the player to update that goal in Notebook.
- Capture is wrong saves a local correction note and excludes the moment from Coach without rewriting the replay. Later source corrections and opt-outs also block an existing practice, while its journal remains readable.
- The journal uses the existing local v1 coaching store with additive fields. Writes succeed before the UI reports success. Corrupt/future journals and failed or stale writes are preserved. Session storage keeps the selected moment, stage and unfinished draft when opening evidence and returning.

The former hidden `LearningInsightsView` and analysis modules remain in source for compatibility. The enabled candidate uses `ReplayCoachView`; the parked source keeps that implementation without mounting it from the hub. This flow does not auto-select a strategic rule, prescribe a redraw from late play, claim optimal decisions or infer improved win rate from a short trial.

## Source boundaries

`ReplayCoachView.tsx` and `styles/replayCoach.css` own the interface. `replayCoachModel.ts` adapts evidence, exclusions, frozen plans, exact art and scoped games. `replayCoachStorage.ts`, `replayCoachSession.ts` and `insightsModeSession.ts` handle durable journal and temporary navigation state. Shared `replayCoaching.ts` preserves trial, progress, eligibility, conclusion and archive behavior.

App supplies the full authoritative match collection separately to Coach, while Deck Insights retains its filtered collection. This prevents hidden merged originals reappearing through stale replay snapshots.

## Validation and local candidate

Independent review found and resolved default-moment identity drift on save, journal navigation mismatch, goal unlinking, merged-source revival, later source correction bypass and incomplete-game eligibility.

The actual React component was bundled with the app stylesheet and tested in an isolated browser using synthetic fixture records. The final browser run passed save/resume/restart, opening evidence and returning with the same draft, goal linking/unlinking, no-opportunity counting, quota failure, source correction, completed-trial archival, conclusions and journal navigation. Check-in, practice and reflection layouts passed at 1100, 736, 360 and 320 pixel widths; there were no browser page errors. Screenshots and executable fixture/check scripts are under `output/playwright/replay-coach/`.

The isolated pipeline is `output/local-replay-coach-20260906-1035/run-build.cjs`. It runs the full release gate, full clean production build, local NSIS packaging with `--publish never`, Windows artifact verification, isolated packaged startup and exact inventory/hash checks of every packaged `dist` file plus registry resources. It also requires unchanged source hashes and canonical public artifacts.

The candidate completed successfully at **10:54 BST on 2026-09-06**. TypeScript, the account-sync gate (82 tests), the full suite (**197 files / 1,995 tests**), the clean production build, NSIS packaging, Windows artifact verification and isolated packaged startup passed. The package audit verified all **278 packaged dist files** byte-for-byte against the fresh output, including the Coach bundle and dedicated Atlas fallback; all three registry resources also matched. Source fingerprints and canonical public artifact hashes remained unchanged throughout the build.

| Local artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `output/local-replay-coach-20260906-1035/RiftLiteBetaInstall.exe` | 159,365,771 | `A5E7CC6112E4C91C70150337DB4CCBAA830AEBC19BAA37E4D6C805F868CD0988` |
| `output/local-replay-coach-20260906-1035/win-unpacked/resources/app.asar` | 94,061,191 | `D26FD3E12F6A4EDFBF030CCFD396C32E093BAA6704CBD0AF947F35A105D06A6B` |

`build-evidence.json`, `source-manifest.json`, `package-audit.json` and stage logs in that directory record the exact source and artifacts. This candidate includes the earlier Atlas fallback, maintenance, full-output cleanup, module extractions and desktop signed-art fixes. It is local only and is not installed. The prior candidates and canonical public installer remain intact.

The existing Vite large-chunk warning remains. Packaged smoke passed with the known rejected background capture/TCGA IPC calls while external guest navigation was blocked; this is not an error-free live gameplay run.

## Remaining acceptance

Live signed-in gameplay validation remains explicitly pending at the user's request. Browser fixtures and isolated packaged startup are not a controlled real match or installed-app acceptance. Before public release, validate the real Atlas display/player-field flow, capture/replay playback, and Coach on actual saved games. No public release version has been selected.

The canonical `release/RiftLiteBetaInstall.exe` remains public v0.9.72 with SHA-256 `7E27AA6E2EAC45F25A9F94C8D2223B2B191AB173B3A6775602E537747D0ED5D4`. Local candidates retain version 0.9.72; distinguish them by full path and hash. Website artwork changes remain uncommitted and undeployed in their separate worktree. Preserve the five historical untracked desktop entries, especially `tmp/`.
