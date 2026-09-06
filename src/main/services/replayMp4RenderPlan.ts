import type {
  ReplayAnnotation, ReplayFlag, ReplayMp4ExportOptions, ReplayVideoAsset, ReplayVoiceNote
} from "../../shared/types.js";

/** Pure render decisions shared by MP4 export orchestration and behavior tests. */
export type ReplayMp4ClipRange = {
  startMs: number;
  endMs: number;
  durationMs: number;
};

export type ReplayMp4RenderGeometry = {
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  layout: NonNullable<ReplayMp4ExportOptions["layout"]>;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

function clampReplayMp4Unit(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

function replayMp4Even(value: number, minValue = 2): number {
  const rounded = Math.max(minValue, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

export function replayMp4RenderGeometry(video: ReplayVideoAsset, options: ReplayMp4ExportOptions): ReplayMp4RenderGeometry {
  const sourceWidth = replayMp4Even(Math.max(640, video.width || 1920), 640);
  const sourceHeight = replayMp4Even(Math.max(360, video.height || 1080), 360);
  const layout = options.layout ?? "landscape";
  if (layout === "landscape") {
    return {
      sourceWidth,
      sourceHeight,
      outputWidth: sourceWidth,
      outputHeight: sourceHeight,
      layout
    };
  }

  const targetAspect = 9 / 16;
  const sourceAspect = sourceWidth / sourceHeight;
  const baseCropHeight = sourceAspect > targetAspect ? sourceHeight : sourceWidth / targetAspect;
  const baseCropWidth = sourceAspect > targetAspect ? sourceHeight * targetAspect : sourceWidth;
  const zoom = layout === "vertical-custom"
    ? Math.min(2.5, Math.max(1, options.cropZoom ?? 1))
    : 1;
  const cropWidth = replayMp4Even(Math.min(sourceWidth, baseCropWidth / zoom), 64);
  const cropHeight = replayMp4Even(Math.min(sourceHeight, cropWidth / targetAspect), 114);
  const focusX = layout === "vertical-custom" ? clampReplayMp4Unit(options.cropFocusX, 0.5) : 0.5;
  const focusY = layout === "vertical-custom" ? clampReplayMp4Unit(options.cropFocusY, 0.5) : 0.5;
  const maxX = Math.max(0, sourceWidth - cropWidth);
  const maxY = Math.max(0, sourceHeight - cropHeight);
  return {
    sourceWidth,
    sourceHeight,
    outputWidth: 1080,
    outputHeight: 1920,
    layout,
    crop: {
      x: replayMp4Even(maxX * focusX, 0),
      y: replayMp4Even(maxY * focusY, 0),
      width: cropWidth,
      height: cropHeight
    }
  };
}

export function replayMp4GeometryFilterBody(geometry: ReplayMp4RenderGeometry): string {
  if (geometry.crop) {
    const crop = geometry.crop;
    return `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${geometry.outputWidth}:${geometry.outputHeight}`;
  }
  return `scale=${geometry.outputWidth}:${geometry.outputHeight}:force_original_aspect_ratio=decrease,pad=${geometry.outputWidth}:${geometry.outputHeight}:(ow-iw)/2:(oh-ih)/2`;
}

export function replayMp4ExportLabel(flag: Pick<ReplayFlag, "type" | "customType" | "label">): string {
  if (flag.type === "custom") {
    return flag.customType?.trim() || flag.label || "Custom";
  }
  const labels: Record<NonNullable<ReplayFlag["type"]>, string> = {
    "key-turn": "Key turn",
    "mistake": "Mistake",
    "good-line": "Good line",
    "missed-lethal": "Missed lethal",
    "battlefield-decision": "Battlefield decision",
    "rules-check": "Rules check",
    custom: "Custom"
  };
  return flag.type ? labels[flag.type] : flag.label || "Key turn";
}

function replayMp4TimeFromCapturedAt(video: ReplayVideoAsset, capturedAt: string | undefined): number | undefined {
  if (!capturedAt) {
    return undefined;
  }
  const startedAt = new Date(video.startedAt).getTime();
  const captured = new Date(capturedAt).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(captured)) {
    return undefined;
  }
  return Math.max(0, captured - startedAt);
}

export function clampReplayMp4TimeMs(video: ReplayVideoAsset, timeMs: number | undefined): number {
  const duration = Math.max(1, video.durationMs || 1);
  if (typeof timeMs !== "number" || !Number.isFinite(timeMs)) {
    return 0;
  }
  return Math.min(duration, Math.max(0, timeMs));
}

function sanitizeSvgTextValue(value: string): string {
  let output = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === 0x09 ||
      codePoint === 0x0a ||
      codePoint === 0x0d ||
      (typeof codePoint === "number" && codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (typeof codePoint === "number" && codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (typeof codePoint === "number" && codePoint >= 0x10000 && codePoint <= 0x10ffff)
    ) {
      output += character;
    }
  }
  return output;
}

function escapeSvgText(value: string): string {
  return sanitizeSvgTextValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replayMp4SvgColor(value: string | undefined, fallback = "#6feeff"): string {
  const safe = sanitizeSvgTextValue(value ?? "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(safe)) {
    return safe;
  }
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(safe)) {
    return safe;
  }
  if (/^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(safe)) {
    return safe;
  }
  return fallback;
}

function replayMp4SvgPoint(value: number, size: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(Math.min(1, Math.max(0, value)) * size);
}

function wrapReplayMp4Text(value: string, maxLength: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length >= maxLines) {
      break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\.+$/, "")}...`;
  }
  return lines.length ? lines : [""];
}

export function replayMp4ClipRange(video: ReplayVideoAsset, options: ReplayMp4ExportOptions): ReplayMp4ClipRange | null {
  if (options.mode !== "clip") {
    return null;
  }
  const requestedDurationMs = Math.min(
    5 * 60_000,
    Math.max(1_000, Math.round(Number.isFinite(options.clipDurationMs) ? options.clipDurationMs ?? 15_000 : 15_000))
  );
  const videoDurationMs = Math.max(1_000, Math.round(video.durationMs || 1_000));
  const rawStartMs = Number.isFinite(options.clipStartMs) ? Math.round(options.clipStartMs ?? 0) : 0;
  const startMs = Math.min(Math.max(0, rawStartMs), Math.max(0, videoDurationMs - 1_000));
  const durationMs = Math.max(1_000, Math.min(requestedDurationMs, videoDurationMs - startMs));
  return {
    startMs,
    endMs: startMs + durationMs,
    durationMs
  };
}

export function replayMp4ClipTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}m${seconds.toString().padStart(2, "0")}s`;
}

export function replayMp4OverlayTiming(startMs: number, endMs: number, clipRange: ReplayMp4ClipRange | null): { startSec: number; endSec: number } | null {
  if (!clipRange) {
    return {
      startSec: startMs / 1000,
      endSec: Math.max(endMs, startMs + 1_000) / 1000
    };
  }
  const clippedStartMs = Math.max(startMs, clipRange.startMs);
  const clippedEndMs = Math.min(Math.max(endMs, startMs + 1_000), clipRange.endMs);
  if (clippedEndMs <= clippedStartMs) {
    return null;
  }
  return {
    startSec: (clippedStartMs - clipRange.startMs) / 1000,
    endSec: Math.max(clippedEndMs - clipRange.startMs, clippedStartMs - clipRange.startMs + 1_000) / 1000
  };
}

export function replayMp4FlagSvg(flag: ReplayFlag, width: number, height: number): string {
  const title = replayMp4ExportLabel(flag);
  const note = flag.note?.trim() || flag.targetLabel || "";
  const lines = wrapReplayMp4Text(note, 54, 2);
  const boxWidth = Math.min(width - 64, 760);
  const boxHeight = note ? 118 : 76;
  const x = 32;
  const y = 32;
  const accent = flag.type === "mistake" ? "#ff5b7d" : flag.type === "good-line" ? "#4df5a8" : "#6feeff";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="18" fill="#07101d" opacity="0.86"/>
  <rect x="${x}" y="${y}" width="7" height="${boxHeight}" rx="3.5" fill="${accent}"/>
  <text x="${x + 28}" y="${y + 42}" fill="${accent}" font-family="Arial, sans-serif" font-size="26" font-weight="800">${escapeSvgText(title)}</text>
  ${note ? lines.map((line, index) => `<text x="${x + 28}" y="${y + 78 + index * 28}" fill="#f5fbff" font-family="Arial, sans-serif" font-size="22" font-weight="700">${escapeSvgText(line)}</text>`).join("") : ""}
</svg>`;
}

export function replayMp4AnnotationSvg(annotation: ReplayAnnotation, width: number, height: number): string {
  const points = (annotation.points ?? [])
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({
      x: replayMp4SvgPoint(point.x, width),
      y: replayMp4SvgPoint(point.y, height)
    }));
  const annotationWidth = Number.isFinite(annotation.width) ? annotation.width : 2;
  const strokeWidth = Math.max(4, Math.round(annotationWidth * 3 * (Math.min(width, height) / 1000)));
  const first = points[0];
  const last = points.at(-1);
  const color = replayMp4SvgColor(annotation.color);
  const commonDefs = `<defs><marker id="arrowhead" markerWidth="18" markerHeight="18" refX="15" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,12 L17,6 z" fill="${color}"/></marker></defs>`;
  let body = "";
  if (annotation.tool === "text" && first) {
    const text = escapeSvgText(annotation.text?.trim() || annotation.note?.trim() || "");
    body = `<text x="${first.x}" y="${first.y}" fill="${color}" font-family="Arial, sans-serif" font-size="${Math.max(34, Math.round(height * 0.046))}" font-weight="900" paint-order="stroke" stroke="#020712" stroke-width="10">${text}</text>`;
  } else if (annotation.tool === "arrow" && first && last) {
    body = `<line x1="${first.x}" y1="${first.y}" x2="${last.x}" y2="${last.y}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" marker-end="url(#arrowhead)"/>`;
  } else if (points.length) {
    const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
    const opacity = annotation.tool === "highlight" ? "0.48" : "0.94";
    body = `<polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${commonDefs}
  ${body}
</svg>`;
}

export function replayMp4AnnotationTimeMs(
  annotation: ReplayAnnotation,
  video: ReplayVideoAsset,
  flagsById: Map<string, ReplayFlag>,
  voiceNotesById: Map<string, ReplayVoiceNote>
): { startMs: number; endMs: number } | null {
  if (annotation.clipId) {
    const voiceNote = voiceNotesById.get(annotation.clipId);
    const flag = voiceNote ? flagsById.get(voiceNote.flagId) : undefined;
    const baseMs = clampReplayMp4TimeMs(video, flag?.timeMs ?? replayMp4TimeFromCapturedAt(video, flag?.capturedAt) ?? annotation.timeMs ?? replayMp4TimeFromCapturedAt(video, annotation.capturedAt));
    const offsetMs = Math.max(0, annotation.offsetMs ?? 0);
    const startMs = clampReplayMp4TimeMs(video, baseMs + offsetMs);
    const endMs = clampReplayMp4TimeMs(video, Math.max(startMs + 1500, baseMs + Math.max(voiceNote?.durationMs ?? 0, offsetMs + 2500)));
    return { startMs, endMs };
  }
  const startMs = clampReplayMp4TimeMs(video, annotation.timeMs ?? replayMp4TimeFromCapturedAt(video, annotation.capturedAt));
  const endMs = clampReplayMp4TimeMs(video, startMs + (annotation.tool === "text" ? 5000 : 3500));
  return { startMs, endMs };
}

export function replayMp4FlagTimeMs(flag: ReplayFlag, video: ReplayVideoAsset): number | undefined {
  const resolved = typeof flag.timeMs === "number" && Number.isFinite(flag.timeMs)
    ? flag.timeMs
    : replayMp4TimeFromCapturedAt(video, flag.capturedAt);
  return typeof resolved === "number" && Number.isFinite(resolved)
    ? clampReplayMp4TimeMs(video, resolved)
    : undefined;
}

export function replayMp4VoiceNoteDelayMs(note: ReplayVoiceNote, flagsById: Map<string, ReplayFlag>, video: ReplayVideoAsset): number | undefined {
  const flag = flagsById.get(note.flagId);
  return clampReplayMp4TimeMs(video, flag?.timeMs ?? replayMp4TimeFromCapturedAt(video, flag?.capturedAt));
}
