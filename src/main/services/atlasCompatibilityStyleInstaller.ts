interface AtlasCompatibilityStyleInstallerOptions {
  isDestroyed: () => boolean;
  cssForCurrentUrl: () => string;
  insertCss: (css: string) => Promise<string>;
  removeCss: (key: string) => Promise<void>;
  reportFailure: (error: unknown) => void;
}

/** Installs the baseline compatibility CSS; this is not the Player-field repair. */
export class AtlasCompatibilityStyleInstaller {
  private generation = 0;
  private cssKey = "";
  private pendingGeneration: number | null = null;
  private attemptCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(private readonly options: AtlasCompatibilityStyleInstallerOptions) {}

  invalidate(): void {
    this.generation += 1;
    this.cssKey = "";
    this.pendingGeneration = null;
    this.attemptCount = 0;
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  install(): void {
    if (this.disposed || this.options.isDestroyed()) return;
    const css = this.options.cssForCurrentUrl();
    const generation = this.generation;
    if (!css || this.cssKey || this.pendingGeneration === generation || this.attemptCount >= 3) return;
    this.pendingGeneration = generation;
    this.attemptCount += 1;
    void this.options.insertCss(css).then((cssKey) => {
      if (this.disposed || this.options.isDestroyed() || generation !== this.generation || !this.options.cssForCurrentUrl()) {
        if (!this.options.isDestroyed()) void this.options.removeCss(cssKey).catch(() => undefined);
        return;
      }
      this.cssKey = cssKey;
    }).catch((error) => {
      this.options.reportFailure(error);
      if (!this.disposed && !this.options.isDestroyed() && generation === this.generation &&
          this.attemptCount < 3 && this.options.cssForCurrentUrl()) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = undefined;
          this.install();
        }, 150);
      }
    }).finally(() => {
      if (this.pendingGeneration === generation) this.pendingGeneration = null;
    });
  }

  dispose(): void {
    this.disposed = true;
    this.invalidate();
  }
}
