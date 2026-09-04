import { canStartAtlasAutomaticRecovery } from "./atlasAutomaticRecoverySafetyFence.js";
import { AtlasLobbyPlayerFieldRepair } from "./atlasLobbyPlayerFieldRepair.js";
import type { AtlasEmptyShellMainRecoveryGuard } from "./atlasEmptyShellMainRecovery.js";
import type { AtlasLobbyPlayerFieldState } from "../../shared/atlasLobbyPlayerField.js";

interface AtlasRecoveryGuest {
  id: number;
  getURL(): string;
  isDestroyed(): boolean;
  isLoadingMainFrame(): boolean;
}

interface AtlasGuestRecoveryLifecycleOptions {
  guest: AtlasRecoveryGuest;
  platform: string;
  emptyShellRecovery: AtlasEmptyShellMainRecoveryGuard;
  currentAtlasGuestId: () => number | null;
  platformSwitchAllowed: () => boolean;
  protectedByGameEntry: (url: string) => boolean;
  readField: () => Promise<AtlasLobbyPlayerFieldState>;
  applyCss: () => Promise<void>;
  report: (outcome: "repaired" | "failed") => void;
  delay?: (ms: number) => Promise<void>;
}

/**
 * Shared document identity for the Atlas recovery controllers. Starting a
 * navigation cancels pending work, but only a committed navigation replaces
 * the URL or renews the Player-field budget. A prevented external link leaves
 * the original lobby eligible once Electron stops loading it.
 *
 * The empty-shell app-session budget remains owned by its existing guard.
 */
export class AtlasGuestRecoveryLifecycle {
  private committedUrl: string;
  private epoch = 0;
  private disposed = false;
  private navigationPending = false;
  private readonly playerFieldRepair: AtlasLobbyPlayerFieldRepair;

  constructor(private readonly options: AtlasGuestRecoveryLifecycleOptions) {
    this.committedUrl = options.guest.getURL();
    options.emptyShellRecovery.beginNavigation(options.guest.id, this.committedUrl);
    this.playerFieldRepair = new AtlasLobbyPlayerFieldRepair({
      isSafe: () => this.isSafeForAutomaticRecovery(),
      readField: options.readField,
      applyCss: options.applyCss,
      report: options.report,
      delay: options.delay
    });
  }

  get documentEpoch(): number {
    return this.epoch;
  }

  isCurrentDocument(expectedEpoch = this.epoch): boolean {
    return this.matchesCommittedDocument(expectedEpoch) && !this.options.guest.isLoadingMainFrame();
  }

  /** Read-only readiness can arrive before slow subresources finish loading. */
  matchesCommittedDocument(expectedEpoch = this.epoch): boolean {
    const { guest } = this.options;
    return !this.disposed && expectedEpoch === this.epoch &&
      !guest.isDestroyed() && guest.getURL() === this.committedUrl &&
      (!this.navigationPending || !guest.isLoadingMainFrame());
  }

  isSafeForAutomaticRecovery(): boolean {
    if (this.options.platform !== "atlas" || !this.isCurrentDocument()) return false;
    const { guest } = this.options;
    const currentUrl = guest.getURL();
    return canStartAtlasAutomaticRecovery({
      targetGuestId: guest.id,
      currentGuestId: this.options.currentAtlasGuestId(),
      currentUrl,
      navigationCurrent: true,
      platformSwitchAllowed: this.options.platformSwitchAllowed(),
      protectedByGameEntry: this.options.protectedByGameEntry(currentUrl)
    });
  }

  navigationStarted(isInPlace: boolean, isMainFrame: boolean): void {
    if (this.disposed || !isMainFrame || isInPlace) return;
    this.epoch += 1;
    this.navigationPending = true;
    this.playerFieldRepair.navigationChanged(false);
    this.options.emptyShellRecovery.navigationStarted(this.options.guest.id);
  }

  navigationCommitted(url: string): void {
    if (this.disposed) return;
    this.epoch += 1;
    this.navigationPending = false;
    this.committedUrl = url;
    this.options.emptyShellRecovery.beginNavigation(this.options.guest.id, url);
    this.playerFieldRepair.navigationChanged(true);
  }

  inPageNavigationCommitted(url: string, isMainFrame: boolean): void {
    if (this.disposed || !isMainFrame || this.options.platform !== "atlas") return;
    this.epoch += 1;
    this.navigationPending = false;
    this.committedUrl = url;
    this.options.emptyShellRecovery.beginNavigation(this.options.guest.id, url);
    this.playerFieldRepair.navigationChanged(false);
    void this.check();
  }

  check(): Promise<void> {
    return this.playerFieldRepair.check();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch += 1;
    this.playerFieldRepair.dispose();
    this.options.emptyShellRecovery.forgetGuest(this.options.guest.id);
  }
}
