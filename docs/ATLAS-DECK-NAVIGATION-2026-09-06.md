# Atlas deck editing inside the client — 2026-09-06

Local continuation on `hotfix/atlas-shell-recovery`, HEAD `23893a6`. Preserve all earlier maintenance, artwork, parked Coach and Your Move work. The user subsequently authorized a local Windows rebuild, completed at **15:01 BST on 2026-09-06**. No installation, version change or publication was performed.

## Latest local installer

`output/local-atlas-deck-20260906-1456/RiftLiteBetaInstall.exe` includes the Atlas deck navigation changes and all earlier local desktop maintenance/artwork work. Replay Coach remains hidden behind Coming Soon. Version remains **0.9.72**; use the full path and hash to distinguish this candidate from the public installer.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `RiftLiteBetaInstall.exe` | 159,349,611 | `4B34447A525680CE68C4C715FF72C47D8DE3DBF5E2AF4249D7E8D271AD3EE1A0` |
| `win-unpacked/resources/app.asar` | 93,985,632 | `9C5498A402663F502D016F27A5161782E00D060E62E7D156867C4C5D18CEC55C` |

The established local pipeline passed TypeScript, the 82-test account-sync gate, **200 files / 2,052 tests**, a clean production build, Windows NSIS packaging, artifact verification and isolated packaged startup. The audit matched all **282 packaged dist files** byte-for-byte with fresh output, verified the new deck navigation/return/unsaved-dialog code, kept Coach hidden, and matched all three card-registry resources. Source fingerprints and canonical public artifact hashes remained unchanged. `build-evidence.json`, `source-manifest.json`, `package-audit.json` and stage logs are beside the installer.

The existing Vite large-chunk warning and expected rejected background capture/TCGA IPC calls in the isolated smoke remain. Startup passed; it is not signed-in gameplay acceptance. Earlier local candidates and canonical `release/` artifacts are preserved, and the candidate has not been installed or published. The Your Move website workspace is separate and is not packaged into this desktop installer.

## Behavior

- Atlas Play's Edit Deck and New Deck navigation remains in the existing client webview and persistent Atlas session.
- A **Back to Play** button appears in RiftLite's Play toolbar. It loads the Atlas lobby in the same guest, allowing Atlas to resolve the current saved deck revision. It does not itself save a deck.
- The return action remains available during sign-in redirects and failed loads, including a Home → Play round trip. Subframe events cannot change it; guest replacement removes stale listeners.
- Atlas's own unsaved-deck `beforeunload` signal opens a native **Stay / Leave without saving** dialog. Stay is the default and cancellation choice. Choosing Stay leaves the editor open without a false navigation-error toast.
- Deck copy/export can write text to the clipboard. Deck pages do not gain gameplay/capture trust, clipboard read, media or other permissions. Unrelated links retain their existing handling.

## Implementation

- `src/shared/atlasDeckNavigation.ts`: exact HTTPS apex origin, localized deck and sign-in/up routes. Credentials, nondefault ports, lookalike hosts and unrelated paths are rejected.
- `src/shared/embeddedContentSecurity.ts`: narrow main-frame/popup workflow navigation and text-copy permission; gameplay identity remains restricted to the Play origin.
- `src/main/main.ts`: deck popup links use the same guest; native unsaved-deck confirmation; existing exact-guest/top-frame permission checks retained.
- `src/main/services/atlasDeckDeparture.ts`: explicit-leave handling, with cancellation on dialog failure.
- `src/renderer/AtlasDeckNavigation.tsx`: return control, per-guest navigation lifecycle, cancellation and error handling.
- `src/renderer/App.tsx`: persistent toolbar integration and a URL/platform guard before editor preload messages can affect match/lobby state.

The current public [Atlas lobby bundle](https://play.riftatlas.com/_next/static/immutable/chunks/3z6t9n72ajzcq.js) uses `window.location.assign` to `https://riftatlas.com/decks/<savedDeckId>?clearDraft=1`, with optional locale prefix. New Deck uses `/decks/new?clearDraft=1`. The same bundle persists the selected saved-deck ID and resolves the latest saved revision on lobby hydration. The [editor bundle](https://riftatlas.com/_next/static/immutable/chunks/0hzhempbjhfvz.js) uses clipboard text writes for Copy Deck Code and Copy Decklist. These describe the public site observed on this date.

## Validation

- Full suite: **200 files / 2,052 tests passed** at 14:47 BST.
- Renderer and Electron TypeScript checks passed; `git diff --check` passed.
- Added navigation/security, controller and unsaved-departure tests cover URL scope, capture isolation, sign-in/failure handling, stale guests, subframes, double clicks, cancellation, retries and text-copy permissions.
- Isolated native evidence is under ignored `output/atlas-deck-navigation-20260906/`; it uses a temporary profile, the actual return component and source policy helpers. No production profile or account data was used.
- Native check passed against the fully rendered public signed-out `/decks/new?clearDraft=1` editor: the same guest/session was retained, Back to Play returned to the lobby, and the button disappeared. The probe used the verified route because the public lobby's New Deck button was unavailable in that run; it did not edit a signed-in user's saved deck.
- A popup fixture stayed in the same guest. An isolated dirty-editor fixture exercised the production departure helper with injected Stay and Leave choices: Stay preserved the editor and enabled retry without an error toast; Leave returned to Play. The native dialog itself was not clicked by automation. Clipboard policy was checked without reading or writing the system clipboard. Screenshots and source hashes accompany `native-probe-results.json`.
- Independent final review found no remaining actionable issue after fixing the Home toolbar lifetime, native unsaved confirmation and serialized cancellation handling.

The earlier hidden-Coach candidate at `output/local-coach-hidden-20260906-1130/RiftLiteBetaInstall.exe` remains unchanged and does **not** include this follow-up. Use the new 15:01 candidate above. Signed-in saving and subsequent deck selection still require acceptance; live gameplay validation remains pending as previously requested.
