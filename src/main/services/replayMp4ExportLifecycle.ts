import type { ReplayMp4ExportProgress } from "../../shared/types.js";

interface ReplayMp4ExportSender {
  isDestroyed(): boolean;
  send(channel: string, progress: ReplayMp4ExportProgress): void;
}

export interface ActiveReplayMp4Export {
  exportId: string;
  requestId: number;
  replayId: string;
  kind: ReplayMp4ExportProgress["kind"];
  sender: ReplayMp4ExportSender;
  stage: ReplayMp4ExportProgress["stage"];
  percent?: number;
  lastDiagnosticStage?: ReplayMp4ExportProgress["stage"];
}

interface ReplayMp4ExportRequest {
  replayId: string;
  kind: ReplayMp4ExportProgress["kind"];
  requestId: number;
  sender: ReplayMp4ExportSender;
}

interface ReplayMp4ExportLifecycleOptions {
  createId(): string;
  recordProgress(progress: ReplayMp4ExportProgress): void;
  onReleased(): void;
  logFailure(label: string, details: string): Promise<void>;
}

export function assertReplayMp4ExportRequestId(requestId: number): void {
  if (!Number.isSafeInteger(requestId) || requestId <= 0) {
    throw new Error("MP4 export request identity is invalid.");
  }
}

/** Owns one export across both formats, independent of Electron window lifetime. */
export class ReplayMp4ExportLifecycle {
  private current: ActiveReplayMp4Export | null = null;
  lastCompletedPath = "";

  constructor(private readonly options: ReplayMp4ExportLifecycleOptions) {}

  get active(): ActiveReplayMp4Export | null {
    return this.current;
  }

  async run(
    request: ReplayMp4ExportRequest,
    operation: (context: ActiveReplayMp4Export) => Promise<string>
  ): Promise<string> {
    assertReplayMp4ExportRequestId(request.requestId);
    if (this.current) {
      throw new Error("Another MP4 export is already running. Wait for it to finish before starting another export.");
    }
    const context: ActiveReplayMp4Export = {
      ...request,
      exportId: this.options.createId(),
      stage: "preparing"
    };
    this.current = context;
    try {
      const outputPath = await operation(context);
      this.release(context);
      if (outputPath) {
        this.lastCompletedPath = outputPath;
        this.emit(context, {
          stage: "completed",
          percent: 100,
          message: request.kind === "presentation" ? "Full Voiceover MP4 export complete." : "MP4 export complete.",
          outputPath
        });
      }
      return outputPath;
    } catch (error) {
      const message = replayMp4ExportErrorMessage(error);
      this.release(context);
      this.emit(context, { stage: "failed", percent: context.percent, message, error: message });
      await this.options.logFailure(
        request.kind === "presentation" ? "Replay presentation MP4 export failed" : "Replay MP4 export failed",
        JSON.stringify({ exportId: context.exportId, replayId: request.replayId, error: message })
      );
      throw error;
    }
  }

  emit(
    context: ActiveReplayMp4Export,
    patch: Omit<ReplayMp4ExportProgress, "exportId" | "requestId" | "replayId" | "kind">
  ): void {
    context.stage = patch.stage;
    context.percent = patch.percent;
    const progress: ReplayMp4ExportProgress = {
      exportId: context.exportId,
      requestId: context.requestId,
      replayId: context.replayId,
      kind: context.kind,
      ...patch
    };
    if (!context.sender.isDestroyed()) {
      try {
        context.sender.send("replay:mp4-export-progress", progress);
      } catch {
        // Closing/replacing a renderer must not cancel a main-process export.
      }
    }
    if (context.lastDiagnosticStage !== progress.stage) {
      context.lastDiagnosticStage = progress.stage;
      this.options.recordProgress(progress);
    }
  }

  private release(context: ActiveReplayMp4Export): void {
    if (this.current !== context) return;
    this.current = null;
    this.options.onReleased();
  }
}

export function replayMp4ExportErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.replace(/\s+/g, " ").trim().slice(0, 1_000) || "MP4 export failed.";
}
