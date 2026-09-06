# RiftLite Beta v0.9.73 - Atlas deck editing and signed artwork

Edit Atlas decks inside RiftLite, return to Play when you're ready, and see the missing signed Vendetta artwork. This update also improves Atlas Player-name recovery and includes replay, backup and build maintenance.

## Atlas deck editing

- **Edit decks inside the client.** Atlas Edit Deck and New Deck stay in RiftLite's existing Atlas session.
- **Back to Play.** Return from the editor to the Atlas lobby using the new toolbar button. Save your changes in Atlas first; Back to Play does not save the deck itself.
- **Unsaved-change handling.** When Atlas reports unsaved edits, RiftLite offers Stay or Leave without saving.
- **Deck copying.** Atlas deck code and decklist copying remain available inside the editor.

## Atlas Player-name recovery

- Fixes the collapsed Player-name field that could remain hidden after the v0.9.72 recovery attempt.
- Uses a dedicated layout repair while preserving the existing field and room controls.
- Recovery retains the existing safeguards around navigation, matchmaking and capture, and does not read or change your Player name.

## Card artwork

- Adds all nine signed Vendetta prints missing from the previous registry: Akali, Renekton, Zed, Nasus, Shen, Jayce, Mel, Ambessa and Kennen.
- Preserves selected alternate and signed artwork more consistently in desktop card and replay views.
- Updates the default Shadowblade Lurker artwork while retaining recognition of its earlier image.

## Reliability and maintenance

- Improves replay-cache consistency and cloud-backup preparation.
- Tightens cleanup and lifecycle handling for replay voice playback, MP4 exports, floating panels and embedded Atlas recovery.
- Removes accumulated obsolete build files from new installers and cleans the full build output before compilation.

## Good to know

- Existing profiles, matches, decks, replays, settings, media paths and `riftlite:` links are preserved.
- Replay Coach remains Coming Soon; Deck Insights remains available. Search Rules remains hidden.
- Your Move's local website demo and the newly researched training ideas are separate work and are not introduced by this desktop update.
- macOS installers remain ad-hoc signed and are not Apple-notarized, so macOS may show its standard first-open warning.

## Validation scope

The release process checks TypeScript, automated behaviour tests, fresh packaging, updater manifests and isolated packaged startup. Signed-in Atlas deck saving and live gameplay acceptance remain pending; these automated checks do not establish completed-match validation.
