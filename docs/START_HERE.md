# Start here — RiftLite engineering

Last updated: 2026-09-06

**v0.9.73 release preparation, 2026-09-06:** The user has now authorized a version bump and publication for Windows and macOS. Source identity and customer notes are updated to 0.9.73; validation/publication are in progress. Follow [the release record](./RELEASE-2026-09-06.md) for the new checkpoint. The earlier local and public status paragraphs below describe their dated artifacts. Replay Coach stays hidden, website work remains separate, and live gameplay acceptance remains pending.

**Latest local installer — Atlas deck editing, 2026-09-06:** Edit Deck stays in the client with **Back to Play** and native unsaved-change handling. The user-authorized candidate completed at **15:01 BST** in `output/local-atlas-deck-20260906-1456`. **200 files / 2,052 tests**, TypeScript, clean build, packaging, artifact verification, isolated startup and the **282-file package audit** passed. Installer: **159,349,611 bytes**, SHA-256 `4B34447A525680CE68C4C715FF72C47D8DE3DBF5E2AF4249D7E8D271AD3EE1A0`. It retains v0.9.72, includes all earlier local desktop fixes, keeps Coach hidden, and is neither installed nor published. See [Atlas deck navigation continuation](./ATLAS-DECK-NAVIGATION-2026-09-06.md).

**Latest checkpoint — Coach parked, 2026-09-06:** At the user's request, Replay Coach is hidden again behind Coming Soon. Its implementation, saved journal, practice trials and session state are preserved. The replacement local candidate completed at **11:33 BST** in `output/local-coach-hidden-20260906-1130`, with **197 files / 1,995 tests**, TypeScript, clean build, packaging, artifact checks, isolated startup and the 278-file package audit passing. The 159,347,244-byte installer has SHA-256 `0F63A420DDA0F83C1E639554B13D83FB4E7865C4B1C70C3D1C6CF856A55A91BB`. It retains version 0.9.72 and is not installed or published. The earlier **10:54 BST installer still contains enabled Coach** and is preserved separately. See [Replay Coach continuation](./REPLAY-COACH-2026-09-06.md).

**Earlier implementation and local build checkpoint:** Replay Coach was implemented with real evidence, player reflections, persistent practice trials and a journal. The user-authorized local Windows candidate completed at **10:54 BST** in `output/local-replay-coach-20260906-1035`, including all earlier desktop maintenance and signed-artwork changes. **197 files / 1,995 tests**, clean production build, packaging, artifact checks, isolated startup and a 278-file package audit passed for that candidate. The 159,365,771-byte installer has SHA-256 `A5E7CC6112E4C91C70150337DB4CCBAA830AEBC19BAA37E4D6C805F868CD0988`. It retains version 0.9.72, is not installed or published, and supersedes the earlier local candidates below. Public assets and website deployments remain unchanged; live gameplay validation remains pending.

**Earlier artwork checkpoint:** [Card artwork audit, 2026-09-05](./CARD-ART-AUDIT-2026-09-05.md). Local desktop and website changes add all nine missing signed Vendetta prints, correct the default Shadowblade Lurker image, and preserve alternate/signed artwork through rendering and website ingestion. The registry matches all 1,189 prints / 45 signed variants in the audited Riot gallery. Desktop changes are included in the new local Coach candidate above; website changes remain undeployed. All source changes remain uncommitted and must be preserved.

Public release, 2026-09-04: Windows **v0.9.72** and macOS **mac-v0.9.72** remain live and Latest from immutable source commit `1926772`. Maintenance checkpoint `23893a6` contains the dedicated Atlas Player-name fallback, reviewed maintenance improvements and renderer-output cleanup. A subsequent **uncommitted source follow-up** adds complete build-output cleanup and extracts deck-comparison/MP4 render logic; its **192 files / 1,903 tests**, clean production build and isolated production startup passed at **22:49 BST**. [The maintenance record](./MAINTENANCE-2026-09-04.md) distinguishes both checkpoints. The latest **local Windows installer** is still the 159 MB candidate completed at **22:35 BST** in `output/local-maintenance-clean-20260904-2232`; it does not include the later source follow-up. Live gameplay validation remains explicitly pending. The canonical `release/` installer and public assets remain unchanged. Preserve the current source changes and five separate historical untracked entries.

This is the shortest safe entry point for a new Codex chat. Read the 2026-09-06 Atlas deck navigation continuation above first; the dated Coach, maintenance and artwork paragraphs describe earlier checkpoints.

## Read in this order

1. [Maintenance continuation checkpoint](./MAINTENANCE-2026-09-04.md) — current local changes, successful candidate build, hashes, validation and remaining acceptance. Read completely.
2. [Atlas continuation handover](./HANDOVER-2026-09-04.md) — tester evidence and the earlier source-only Player-field checkpoint. Its maintenance link takes precedence for current local status.
3. [Detailed project handover](./HANDOVER-2026-08-30.md) — architecture, implemented features, public artifact hashes and historical acceptance work. Dated sections describe their own checkpoints.
4. [v0.9.72 release notes](./release-notes-v0.9.72.md) — original public release record. The Player-field repair claim has a known limitation established by log 76; use the Atlas handover for that issue.
5. [Web Replay system handover](./WEB_REPLAY_SYSTEM_HANDOVER.md) — when working on Web Replays, raw capture, or replay upload/delivery.
6. [Long-form engineering history](./CURRENT_STATE.md) — historical architecture and release history; its older status sections are not current operational truth.

Task-specific references:

- [Your Move local creator workspace](./YOUR-MOVE-2026-09-06.md) — complete local creation, preview, sharing and embed sequence at port 4180, corrected RiftLite branding, saved examples and restart instructions. Local implementation is authorized; production deployment remains unrequested.
- [Account onboarding](./account-onboarding.md) and [account cloud sync](./account-cloud-sync.md)
- [Replay V2 desktop](./replay-v2-desktop.md), [Web Replay system](./WEB_REPLAY_SYSTEM_HANDOVER.md), and [TCGA Web Replay monitor](./TCGA_WEB_REPLAY_MONITOR.md)

## Active desktop repository

```text
C:\Users\cdfpa\OneDrive\Documents\Claude\Projects\Riftlite Beta 0.6\desktop-v06
```

Branch: `hotfix/atlas-shell-recovery`

Current HEAD: `23893a648349ccda30ae87ee298fcab4e0be91fa`, plus the uncommitted cleanup/modularisation and card-artwork follow-ups. The earlier maintenance source fingerprint is in `output/maintenance-modules-20260904-2250/source-manifest.json`; the later artwork audit and validation are in `output/card-art-audit-20260905/`. The older successful local installer's fingerprint is in `output/local-maintenance-clean-20260904-2232/source-manifest.json`; its `checkpoint-evidence.json` links that candidate to `23893a6`.

Release source: `19267728332ebb9c946d7a61d03715c149400589` / public v0.9.72

If the new chat opens in `C:\Users\cdfpa\OneDrive\Documents\Claude\Projects\RiftLite`, change to the active desktop path above before running desktop commands. The legacy folder is not the Electron repository.

## Three things not to get wrong

1. Preserve the checkpointed Atlas work and the uncommitted cleanup/modularisation follow-up, including its new modules, cleanup script and tests. Five separate historical untracked entries remain: three v0.9.70 documents, `tmp-app-diff.txt`, and `tmp/`. Do not reset, checkout, clean, stage, publish, or overwrite those historical entries; `tmp/` may contain sensitive browser state.
2. Replay Coach is parked behind Coming Soon in the latest source; keep its implementation and data intact for later work. Search Rules remains hidden behind a disabled release flag. Windows `v0.9.72` and macOS `mac-v0.9.72` are immutable project releases at `1926772`; never move their tags, replace their assets, or rerun the successful tagged Mac workflow.
3. The deployed website remains at `135d239`, including sideboard-choice recovery and X0TCG's YouTube rotation. Its correct worktree now has uncommitted, undeployed card-artwork fixes described in the 2026-09-05 audit. Preserve those changes. The older primary website checkout is still not the right place to resume replay work without first synchronising it.

## Verify the handover has not drifted

From the active desktop repository, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\print-handover-state.ps1
```

The script is read-only. It prints the current desktop branch, commit, dirty files, package version, local installer hash, relevant website worktree state, and common development ports.

Compare its output with `docs/MAINTENANCE-2026-09-04.md`. The snapshot deliberately hashes the canonical public `release/` installer; the new local candidate is under `output/`. Trust live repository state if it differs materially. The script's final link still points to the detailed historical handover; current continuation checkpoints are linked above.

## New-chat prompt

> Continue RiftLite from `C:\Users\cdfpa\OneDrive\Documents\Claude\Projects\Riftlite Beta 0.6\desktop-v06`. Read `AGENTS.md`, `docs/START_HERE.md` and `docs/ATLAS-DECK-NAVIGATION-2026-09-06.md`, then run the read-only snapshot and inspect Git status. Preserve all uncommitted Atlas deck navigation, signed-art, maintenance, cleanup, module extraction and hidden-Coach changes, plus historical untracked entries. HEAD remains `23893a6`. The latest local candidate is `output/local-atlas-deck-20260906-1456/RiftLiteBetaInstall.exe`, completed at 15:01 BST, SHA-256 `4B34447A525680CE68C4C715FF72C47D8DE3DBF5E2AF4249D7E8D271AD3EE1A0`. It passed 200 files / 2,052 tests, TypeScript, clean build, packaging, artifact checks, isolated startup and the 282-file package audit. It includes in-client Atlas deck editing and Back to Play; Replay Coach remains hidden. It is not installed or published. Preserve earlier candidates and the separate website worktree's artwork and Your Move work. Public v0.9.72 is unchanged; signed-in deck saving and live gameplay acceptance remain pending. Do not rebuild again, install, bump versions, publish or deploy until I ask. Briefly confirm state, then continue with my next request.
