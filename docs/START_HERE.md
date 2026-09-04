# Start here — RiftLite engineering

Last updated: 2026-09-04

Public release, 2026-09-04: Windows **v0.9.72** and macOS **mac-v0.9.72** remain live and Latest from immutable source commit `1926772`. The maintenance Git checkpoint contains the dedicated Atlas Player-name fallback, reviewed maintenance improvements and renderer-output cleanup. The latest authorized **local Windows candidate** completed at **22:35 BST** in `output/local-maintenance-clean-20260904-2232`; it retains version 0.9.72 and has not been installed, pushed or published. [The maintenance checkpoint](./MAINTENANCE-2026-09-04.md) records 189 passing test files / 1,861 tests, exact hashes and the installer reduction from 265 MB to 159 MB. The user left live gameplay validation pending. The canonical `release/` installer and public assets remain unchanged. Preserve the five separate historical untracked entries.

This is the shortest safe entry point for a new Codex chat.

## Read in this order

1. [Maintenance continuation checkpoint](./MAINTENANCE-2026-09-04.md) — current local changes, successful candidate build, hashes, validation and remaining acceptance. Read completely.
2. [Atlas continuation handover](./HANDOVER-2026-09-04.md) — tester evidence and the earlier source-only Player-field checkpoint. Its maintenance link takes precedence for current local status.
3. [Detailed project handover](./HANDOVER-2026-08-30.md) — architecture, implemented features, public artifact hashes and historical acceptance work. Dated sections describe their own checkpoints.
4. [v0.9.72 release notes](./release-notes-v0.9.72.md) — original public release record. The Player-field repair claim has a known limitation established by log 76; use the Atlas handover for that issue.
5. [Web Replay system handover](./WEB_REPLAY_SYSTEM_HANDOVER.md) — when working on Web Replays, raw capture, or replay upload/delivery.
6. [Long-form engineering history](./CURRENT_STATE.md) — historical architecture and release history; its older status sections are not current operational truth.

Task-specific references:

- [Account onboarding](./account-onboarding.md) and [account cloud sync](./account-cloud-sync.md)
- [Replay V2 desktop](./replay-v2-desktop.md), [Web Replay system](./WEB_REPLAY_SYSTEM_HANDOVER.md), and [TCGA Web Replay monitor](./TCGA_WEB_REPLAY_MONITOR.md)

## Active desktop repository

```text
C:\Users\cdfpa\OneDrive\Documents\Claude\Projects\Riftlite Beta 0.6\desktop-v06
```

Branch: `hotfix/atlas-shell-recovery`

Current source: the maintenance Git checkpoint on this branch, following `e6b5a79001efe1b63cf93f39d95094ac65052f53`. Run the snapshot below for the exact current HEAD. The successful local candidate's source fingerprint is in `output/local-maintenance-clean-20260904-2232/source-manifest.json`; `checkpoint-evidence.json` links those source bytes to the resulting commit.

Release source: `19267728332ebb9c946d7a61d03715c149400589` / public v0.9.72

If the new chat opens in `C:\Users\cdfpa\OneDrive\Documents\Claude\Projects\RiftLite`, change to the active desktop path above before running desktop commands. The legacy folder is not the Electron repository.

## Three things not to get wrong

1. Preserve the checkpointed Atlas and maintenance work, and any subsequent local changes. Five separate historical untracked entries remain: three v0.9.70 documents, `tmp-app-diff.txt`, and `tmp/`. Do not reset, checkout, clean, stage, publish, or overwrite those historical entries; `tmp/` may contain sensitive browser state.
2. Search Rules remains hidden behind a disabled release flag. Windows `v0.9.72` and macOS `mac-v0.9.72` are immutable project releases at `1926772`; never move their tags, replace their assets, or rerun the successful tagged Mac workflow.
3. The website worktree is clean at live commit `135d239`, including sideboard-choice recovery and X0TCG's YouTube rotation. The older primary website checkout is still not the right place to resume replay work without first synchronising it.

## Verify the handover has not drifted

From the active desktop repository, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\print-handover-state.ps1
```

The script is read-only. It prints the current desktop branch, commit, dirty files, package version, local installer hash, relevant website worktree state, and common development ports.

Compare its output with `docs/MAINTENANCE-2026-09-04.md`. The snapshot deliberately hashes the canonical public `release/` installer; the new local candidate is under `output/`. Trust live repository state if it differs materially. The script's final link still points to the detailed historical handover; current continuation checkpoints are linked above.

## New-chat prompt

> Continue RiftLite from `C:\Users\cdfpa\OneDrive\Documents\Claude\Projects\Riftlite Beta 0.6\desktop-v06`. Read `AGENTS.md`, `docs/START_HERE.md`, `docs/HANDOVER-2026-09-04.md` and its latest maintenance checkpoint, then run the read-only handover snapshot and inspect Git status. Preserve all existing changes and the five historical untracked entries. The Atlas Player-name fallback, maintenance improvements and renderer build cleanup are checkpointed in Git and included in the verified local candidate under `output/local-maintenance-clean-20260904-2232`; the canonical installer and public v0.9.72 remain unchanged. Live gameplay validation is explicitly pending. Do not rebuild again, install, bump versions or publish until I ask. Summarize the current state briefly, then continue with my next request.
