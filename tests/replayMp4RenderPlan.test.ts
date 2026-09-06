import { describe, expect, it } from "vitest";
import {
  clampReplayMp4TimeMs,
  replayMp4AnnotationSvg,
  replayMp4AnnotationTimeMs,
  replayMp4ClipRange,
  replayMp4ClipTimestamp,
  replayMp4ExportLabel,
  replayMp4FlagSvg,
  replayMp4FlagTimeMs,
  replayMp4GeometryFilterBody,
  replayMp4OverlayTiming,
  replayMp4RenderGeometry,
  replayMp4VoiceNoteDelayMs
} from "../src/main/services/replayMp4RenderPlan.js";
import type {
  ReplayAnnotation, ReplayFlag, ReplayMp4ExportOptions, ReplayVideoAsset, ReplayVoiceNote
} from "../src/shared/types.js";

const startedAt = "2026-09-04T12:00:00.000Z";
const video: ReplayVideoAsset = {
  path: "recording.webm", url: "file:///recording.webm", filename: "recording.webm", directory: ".",
  mimeType: "video/webm", source: "game-frame-direct", platform: "atlas",
  startedAt, endedAt: "2026-09-04T12:01:00.000Z", durationMs: 60_000, sizeBytes: 100,
  width: 1920, height: 1080, fps: 24, captureIntervalMs: 0, bitrateKbps: 3000,
  codec: "vp9", quality: "sharp", hasAudio: true
};
const options: ReplayMp4ExportOptions = {
  includeFlags: true, includeDrawings: true, includeVoiceNotes: true, includeOriginalAudio: true
};
const flag: ReplayFlag = {
  id: "flag-1", targetType: "video-time", targetId: "video-1", targetLabel: "Turn 2",
  type: "key-turn", label: "Saved label", note: "", capturedAt: "2026-09-04T12:00:06.000Z",
  createdAt: startedAt, timeMs: 10_000
};
const annotation: ReplayAnnotation = {
  id: "drawing-1", targetType: "video-time", targetId: "video-1", targetLabel: "Turn 2",
  capturedAt: "2026-09-04T12:00:05.000Z", tool: "pen", color: "#6feeff", width: 2,
  points: [{ x: 0.1, y: 0.2 }, { x: 0.75, y: 0.8 }], createdAt: startedAt
};
const voice: ReplayVoiceNote = {
  id: "voice-1", flagId: flag.id, mimeType: "audio/webm", dataUrl: "data:audio/webm;base64,AA==",
  durationMs: 8000, sizeBytes: 1, createdAt: startedAt
};

describe("MP4 output geometry", () => {
  it("keeps landscape dimensions and the exact padding filter", () => {
    const geometry = replayMp4RenderGeometry(video, options);
    expect(geometry).toEqual({
      sourceWidth: 1920, sourceHeight: 1080, outputWidth: 1920, outputHeight: 1080, layout: "landscape"
    });
    expect(replayMp4GeometryFilterBody(geometry)).toBe(
      "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"
    );
  });

  it("retains even dimensions, minimum sizes and missing-size defaults", () => {
    expect(replayMp4RenderGeometry({ ...video, width: 641, height: 361 }, options))
      .toMatchObject({ sourceWidth: 640, sourceHeight: 360, outputWidth: 640, outputHeight: 360 });
    expect(replayMp4RenderGeometry({ ...video, width: 320, height: 180 }, options))
      .toMatchObject({ sourceWidth: 640, sourceHeight: 360 });
    expect(replayMp4RenderGeometry({ ...video, width: 0, height: 0 }, options))
      .toMatchObject({ sourceWidth: 1920, sourceHeight: 1080 });
  });

  it("centres vertical output and ignores custom focus/zoom in centre mode", () => {
    const geometry = replayMp4RenderGeometry(video, {
      ...options, layout: "vertical-center", cropFocusX: 1, cropFocusY: 1, cropZoom: 2
    });
    expect(geometry).toEqual({
      sourceWidth: 1920, sourceHeight: 1080, outputWidth: 1080, outputHeight: 1920,
      layout: "vertical-center", crop: { x: 656, y: 0, width: 608, height: 1080 }
    });
    expect(replayMp4GeometryFilterBody(geometry)).toBe("crop=608:1080:656:0,scale=1080:1920");
    expect(replayMp4RenderGeometry({ ...video, width: 720, height: 1920 }, {
      ...options, layout: "vertical-center"
    }).crop).toEqual({ x: 0, y: 320, width: 720, height: 1280 });
  });

  it("clamps custom focus and zoom while keeping pixel-aligned crops", () => {
    expect(replayMp4RenderGeometry(video, {
      ...options, layout: "vertical-custom", cropFocusX: 3, cropFocusY: -1, cropZoom: 2
    }).crop).toEqual({ x: 1616, y: 0, width: 304, height: 540 });
    const limited = replayMp4RenderGeometry(video, {
      ...options, layout: "vertical-custom", cropFocusX: Number.NaN, cropFocusY: Number.POSITIVE_INFINITY, cropZoom: 99
    });
    expect(limited.crop).toEqual({ x: 838, y: 324, width: 242, height: 430 });
    expect(replayMp4RenderGeometry(video, { ...options, layout: "vertical-custom", cropZoom: -2 }).crop)
      .toEqual({ x: 656, y: 0, width: 608, height: 1080 });
  });
});

describe("MP4 clip and overlay boundaries", () => {
  it("leaves full exports untrimmed and defaults clips to fifteen seconds", () => {
    expect(replayMp4ClipRange(video, options)).toBeNull();
    expect(replayMp4ClipRange(video, { ...options, mode: "clip" }))
      .toEqual({ startMs: 0, endMs: 15_000, durationMs: 15_000 });
    expect(replayMp4ClipRange(video, { ...options, mode: "clip", clipStartMs: Number.NaN, clipDurationMs: Number.NaN }))
      .toEqual({ startMs: 0, endMs: 15_000, durationMs: 15_000 });
  });

  it("bounds clips to one second through five minutes and the available recording", () => {
    expect(replayMp4ClipRange(video, { ...options, mode: "clip", clipStartMs: 99_000, clipDurationMs: 0 }))
      .toEqual({ startMs: 59_000, endMs: 60_000, durationMs: 1000 });
    expect(replayMp4ClipRange(video, { ...options, mode: "clip", clipStartMs: -200, clipDurationMs: 90_000 }))
      .toEqual({ startMs: 0, endMs: 60_000, durationMs: 60_000 });
    expect(replayMp4ClipRange({ ...video, durationMs: 600_000 }, { ...options, mode: "clip", clipDurationMs: 600_000 }))
      .toEqual({ startMs: 0, endMs: 300_000, durationMs: 300_000 });
    expect(replayMp4ClipRange({ ...video, durationMs: 500 }, { ...options, mode: "clip" }))
      .toEqual({ startMs: 0, endMs: 1000, durationMs: 1000 });
  });

  it("intersects overlays with the clip and rebases retained times", () => {
    const clip = { startMs: 10_000, endMs: 20_000, durationMs: 10_000 };
    expect(replayMp4OverlayTiming(8000, 12_000, clip)).toEqual({ startSec: 0, endSec: 2 });
    expect(replayMp4OverlayTiming(12_000, 25_000, clip)).toEqual({ startSec: 2, endSec: 10 });
    expect(replayMp4OverlayTiming(1000, 9000, clip)).toBeNull();
    expect(replayMp4OverlayTiming(20_000, 25_000, clip)).toBeNull();
    expect(replayMp4OverlayTiming(2000, 2000, null)).toEqual({ startSec: 2, endSec: 3 });
    // Retain the existing one-second minimum even for a short tail overlap.
    expect(replayMp4OverlayTiming(19_500, 19_600, clip)).toEqual({ startSec: 9.5, endSec: 10.5 });
    expect(replayMp4ClipTimestamp(61_900)).toBe("01m01s");
    expect(replayMp4ClipTimestamp(-100)).toBe("00m00s");
  });
});

describe("MP4 saved annotation timing", () => {
  it("prefers finite flag times, falls back to captured time, and rejects undated flags", () => {
    expect(replayMp4FlagTimeMs(flag, video)).toBe(10_000);
    expect(replayMp4FlagTimeMs({ ...flag, timeMs: 0 }, video)).toBe(0);
    expect(replayMp4FlagTimeMs({ ...flag, timeMs: Number.NaN }, video)).toBe(6000);
    expect(replayMp4FlagTimeMs({ ...flag, timeMs: 90_000 }, video)).toBe(60_000);
    expect(replayMp4FlagTimeMs({ ...flag, timeMs: undefined, capturedAt: "invalid" }, video)).toBeUndefined();
    expect(replayMp4FlagTimeMs({ ...flag, timeMs: undefined, capturedAt: "2026-09-04T11:59:00Z" }, video)).toBe(0);
    expect(clampReplayMp4TimeMs(video, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("retains standalone text/drawing durations and clamps the end of the recording", () => {
    expect(replayMp4AnnotationTimeMs(annotation, video, new Map(), new Map()))
      .toEqual({ startMs: 5000, endMs: 8500 });
    expect(replayMp4AnnotationTimeMs({ ...annotation, tool: "text" }, video, new Map(), new Map()))
      .toEqual({ startMs: 5000, endMs: 10_000 });
    expect(replayMp4AnnotationTimeMs({ ...annotation, timeMs: 59_000 }, video, new Map(), new Map()))
      .toEqual({ startMs: 59_000, endMs: 60_000 });
  });

  it("anchors voice-linked drawings to the flag and keeps them for the voice duration", () => {
    const flags = new Map([[flag.id, flag]]);
    const notes = new Map([[voice.id, voice]]);
    expect(replayMp4AnnotationTimeMs({ ...annotation, clipId: voice.id, offsetMs: 2000, timeMs: 500 }, video, flags, notes))
      .toEqual({ startMs: 12_000, endMs: 18_000 });
    expect(replayMp4AnnotationTimeMs({ ...annotation, clipId: "missing", offsetMs: -500, timeMs: 7000 }, video, flags, notes))
      .toEqual({ startMs: 7000, endMs: 9500 });
    expect(replayMp4VoiceNoteDelayMs(voice, flags, video)).toBe(10_000);
    expect(replayMp4VoiceNoteDelayMs(voice, new Map([[flag.id, { ...flag, timeMs: undefined }]]), video)).toBe(6000);
    // Preserve legacy unlinked-note placement; this extraction changes no policy.
    expect(replayMp4VoiceNoteDelayMs(voice, new Map(), video)).toBe(0);
  });
});

describe("MP4 SVG overlay content", () => {
  it("uses saved labels and preserves XML-safe Unicode while escaping markup", () => {
    expect(replayMp4ExportLabel({ type: "custom", customType: "  Coaching  ", label: "fallback" })).toBe("Coaching");
    expect(replayMp4ExportLabel({ label: "fallback" })).toBe("fallback");
    expect(replayMp4ExportLabel({ type: "missed-lethal", label: "ignored" })).toBe("Missed lethal");
    const svg = replayMp4FlagSvg({
      ...flag, type: "custom", customType: '<Coach & "plan">\u0001😀', note: "<script> & advice"
    }, 640, 360);
    expect(svg).toContain('width="640" height="360" viewBox="0 0 640 360"');
    expect(svg).toContain('width="576" height="118"');
    expect(svg).toContain("&lt;Coach &amp; &quot;plan&quot;&gt;😀");
    expect(svg).toContain("&lt;script&gt; &amp; advice");
    expect(svg).not.toContain("\u0001");
    expect(svg).not.toContain("<script>");
  });

  it("keeps label-only flags compact and wraps long notes into two lines", () => {
    expect(replayMp4FlagSvg({ ...flag, targetLabel: "", type: "mistake" }, 1920, 1080))
      .toContain('width="760" height="76"');
    expect(replayMp4FlagSvg({ ...flag, type: "mistake" }, 1920, 1080)).toContain('fill="#ff5b7d"');
    const svg = replayMp4FlagSvg({ ...flag, type: "good-line", note: Array(40).fill("word").join(" ") }, 1920, 1080);
    expect(svg.match(/<text /g)).toHaveLength(3);
    expect(svg).toContain("...</text>");
    expect(svg).toContain('fill="#4df5a8"');
  });

  it("filters invalid coordinates and clamps arrow endpoints to the output frame", () => {
    const svg = replayMp4AnnotationSvg({
      ...annotation, tool: "arrow", width: Number.NaN,
      points: [{ x: Number.NaN, y: 0 }, { x: -1, y: 0.25 }, { x: 2, y: 1.5 }],
      color: 'red" onload="alert(1)'
    }, 640, 360);
    expect(svg).toContain('<line x1="0" y1="90" x2="640" y2="360"');
    expect(svg).toContain('stroke="#6feeff" stroke-width="4"');
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("onload=");
  });

  it.each(["#abc", "rgba(20, 40, 60, 0.5)", "hsl(120, 50%, 60%)"])("retains supported color %s", (color) => {
    expect(replayMp4AnnotationSvg({ ...annotation, color, tool: "highlight" }, 1000, 1000))
      .toContain(`stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.48"`);
  });

  it("escapes text annotations, uses note fallback and tolerates empty drawings", () => {
    const svg = replayMp4AnnotationSvg({ ...annotation, tool: "text", text: "  ", note: '<note & "quote">' }, 1000, 1000);
    expect(svg).toContain('x="100" y="200"');
    expect(svg).toContain("&lt;note &amp; &quot;quote&quot;&gt;");
    expect(replayMp4AnnotationSvg({ ...annotation, points: [] }, 640, 360)).not.toMatch(/<polyline|<line /);
  });
});
