import type { PDFDocument, PDFFont } from "pdf-lib";
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

let pdfWorkerConfigured = false;

async function configurePdfJsWorker() {
  if (pdfWorkerConfigured || typeof window === "undefined") return;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.mjs",
      import.meta.url,
    ).toString();
  } catch {
    /* side-effect worker import above; browser may still use fake worker */
  }
  pdfWorkerConfigured = true;
}

export type PlacementFontFamily = "helvetica" | "times" | "courier" | "noto";
export type PlacementAlign = "left" | "center" | "right";

export type StaticPlacement = {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional fill text size in PDF points. When omitted, size auto-fits the box. */
  fontSize?: number;
  /** Optional typeface for printed-form fill text. */
  fontFamily?: PlacementFontFamily;
  /** Optional bold weight when a bold face is available for the chosen family. */
  bold?: boolean;
  /** Horizontal text alignment inside the writing box. */
  align?: PlacementAlign;
};

export const PLACEMENT_FONT_OPTIONS: { value: PlacementFontFamily; label: string }[] = [
  { value: "helvetica", label: "Helvetica" },
  { value: "times", label: "Times Roman" },
  { value: "courier", label: "Courier" },
  { value: "noto", label: "Noto Sans" },
];

export const PLACEMENT_FONT_SIZES = [8, 10, 12, 14, 16, 18, 24, 32] as const;

export const PLACEMENT_ALIGN_OPTIONS: { value: PlacementAlign; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

export type DetectedStaticField = {
  name: string;
  type: "text" | "checkbox";
  placement: StaticPlacement;
};

export const CHECKBOX_ALWAYS = "__formbatch_always_checked__";
const TRUE_CHECKBOX_VALUES = /^(1|true|yes|y|checked|x|oui)$/i;
const FILL_CHAR_RE = /[._\-·…‧∙＿]/g;
const FILL_RUN_RE = /([._\-·…‧∙＿])\1{5,}|[._\-·…‧∙＿]{6,}/;

export function isCheckboxChecked(
  rule: string,
  row: Record<string, string>,
) {
  return rule === CHECKBOX_ALWAYS || TRUE_CHECKBOX_VALUES.test((row[rule] || "").trim());
}

/** Re-apply user-nudged boxes after PDF re-detection (e.g. Stripe return). */
export function mergeSavedPlacements<T extends { name: string; placement: StaticPlacement }>(
  fields: T[],
  saved?: Record<string, StaticPlacement> | null,
): T[] {
  if (!saved) return fields;
  return fields.map((field) => {
    const placement = saved[field.name];
    return placement ? { ...field, placement } : field;
  });
}

/** Drop writing areas the user removed in the previewer. */
export function withoutRemovedFields<T extends { name: string }>(
  fields: T[],
  removed?: string[] | null,
): T[] {
  if (!removed?.length) return fields;
  const skip = new Set(removed);
  return fields.filter((field) => !skip.has(field.name));
}

export type StaticFontSet = {
  default: PDFFont;
  helvetica?: PDFFont;
  helveticaBold?: PDFFont;
  times?: PDFFont;
  timesBold?: PDFFont;
  courier?: PDFFont;
  courierBold?: PDFFont;
  noto?: PDFFont;
};

function normalizeFonts(fonts: PDFFont | StaticFontSet): StaticFontSet {
  if (fonts && typeof fonts === "object" && "default" in fonts) {
    return fonts as StaticFontSet;
  }
  return { default: fonts as PDFFont };
}

function fontCanRender(font: PDFFont | undefined, text: string) {
  if (!font) return false;
  if (typeof font.widthOfTextAtSize !== "function") return true;
  try {
    font.widthOfTextAtSize(text, 10);
    return true;
  } catch {
    return false;
  }
}

function measureTextWidth(font: PDFFont, text: string, size: number) {
  if (typeof font.widthOfTextAtSize !== "function") return 0;
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function applyStaticPdfFields(
  document: PDFDocument,
  fields: DetectedStaticField[],
  mapping: Record<string, string>,
  row: Record<string, string>,
  fonts: PDFFont | StaticFontSet,
) {
  const fontMap = normalizeFonts(fonts);

  const resolveFont = (
    family: PlacementFontFamily | undefined,
    text: string,
    bold?: boolean,
  ) => {
    const useBold = Boolean(bold);
    const preferred =
      !family || family === "helvetica"
        ? (useBold ? fontMap.helveticaBold : undefined) || fontMap.helvetica || fontMap.default
        : family === "times"
          ? (useBold ? fontMap.timesBold : undefined) || fontMap.times || fontMap.default
          : family === "courier"
            ? (useBold ? fontMap.courierBold : undefined) || fontMap.courier || fontMap.default
            : fontMap.noto || fontMap.default;
    if (fontCanRender(preferred, text)) return preferred;
    if (fontCanRender(fontMap.noto, text)) return fontMap.noto!;
    if (fontCanRender(fontMap.default, text)) return fontMap.default;
    return preferred;
  };

  for (const field of fields) {
    const rule = mapping[field.name];
    if (!rule) continue;
    const page = document.getPages()[field.placement.pageIndex];
    if (!page) continue;

    if (field.type === "checkbox") {
      if (isCheckboxChecked(rule, row)) {
        const mark = "X";
        const font = resolveFont(field.placement.fontFamily, mark, field.placement.bold);
        const markSize = field.placement.fontSize || Math.min(9, field.placement.height);
        page.drawText(mark, {
          x: field.placement.x,
          y: field.placement.y - 1,
          size: Math.min(markSize, field.placement.height),
          font,
        });
      }
      continue;
    }

    const value = row[rule] || "";
    if (!value) continue;

    const font = resolveFont(field.placement.fontFamily, value, field.placement.bold);
    let fontSize = field.placement.fontSize ?? Math.min(12, Math.max(8, field.placement.height - 2));
    const floor = Math.min(5, fontSize);
    while (fontSize > floor && measureTextWidth(font, value, fontSize) > field.placement.width) {
      fontSize -= 0.5;
    }
    const textWidth = measureTextWidth(font, value, fontSize);
    const align = field.placement.align || "left";
    const x =
      align === "center"
        ? field.placement.x + Math.max(0, (field.placement.width - textWidth) / 2)
        : align === "right"
          ? field.placement.x + Math.max(0, field.placement.width - textWidth)
          : field.placement.x;
    page.drawText(value, {
      x,
      y: field.placement.y,
      size: fontSize,
      font,
      maxWidth: field.placement.width,
    });
  }
}

type TextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Line = {
  x1: number;
  y: number;
  x2: number;
  source: "vector" | "text";
};

function cleanLabel(value: string) {
  return value
    .replace(FILL_CHAR_RE, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*[:;：]\s*$/, "")
    .replace(/^[,;.\s]+|[,;.\s]+$/g, "")
    .trim()
    .slice(0, 110);
}

function uniqueName(base: string, counts: Map<string, number>) {
  const cleaned = cleanLabel(base) || "Field";
  const count = (counts.get(cleaned) || 0) + 1;
  counts.set(cleaned, count);
  return count === 1 ? cleaned : `${cleaned} (${count})`;
}

function fillRatio(text: string) {
  const compact = text.replace(/\s+/g, "");
  if (!compact.length) return 0;
  const fills = compact.match(FILL_CHAR_RE)?.length || 0;
  return fills / compact.length;
}

function estimatePrefixWidth(fullText: string, prefixLength: number, totalWidth: number) {
  if (prefixLength <= 0) return 0;
  if (prefixLength >= fullText.length) return totalWidth;

  // Dots/underscores are much narrower than letters, so a raw character ratio
  // places fill text too far left (over the label). Weight fill glyphs lighter.
  const weightOf = (character: string) => {
    if (/[._\-·…‧∙＿]/.test(character)) return 0.28;
    if (character === " ") return 0.33;
    if (/[:：,;]/.test(character)) return 0.4;
    return 1;
  };

  let prefixWeight = 0;
  let totalWeight = 0;
  for (let index = 0; index < fullText.length; index += 1) {
    const weight = weightOf(fullText[index]);
    totalWeight += weight;
    if (index < prefixLength) prefixWeight += weight;
  }
  if (totalWeight <= 0) return totalWidth * (prefixLength / fullText.length);
  return totalWidth * (prefixWeight / totalWeight);
}

function isMostlyFillText(text: string) {
  const compact = text.replace(/\s+/g, "");
  return compact.length >= 6 && fillRatio(text) >= 0.7;
}

function looksLikeTitleLabel(label: string) {
  const cleaned = cleanLabel(label);
  if (cleaned.length < 12) return false;
  const letters = cleaned.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 10) return false;
  const upper = letters.toUpperCase();
  // ALL CAPS (or nearly) long headings are usually titles, not field labels.
  return upper === letters || cleaned === cleaned.toUpperCase();
}

function overlapRatio(left: Line, right: Line) {
  const start = Math.max(left.x1, right.x1);
  const end = Math.min(left.x2, right.x2);
  const overlap = Math.max(0, end - start);
  const shorter = Math.min(left.x2 - left.x1, right.x2 - right.x1);
  return shorter > 0 ? overlap / shorter : 0;
}

function mergeLineSegments(lines: Line[]) {
  const sorted = [...lines].sort((left, right) => right.y - left.y || left.x1 - right.x1);
  const merged: Line[] = [];

  for (const line of sorted) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.source === line.source &&
      Math.abs(previous.y - line.y) < 1.2 &&
      line.x1 - previous.x2 < 10 &&
      line.x1 >= previous.x1 - 1
    ) {
      previous.x2 = Math.max(previous.x2, line.x2);
      continue;
    }
    merged.push({ ...line });
  }

  return merged.filter((line, index, all) =>
    !all.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        otherIndex < index &&
        Math.abs(other.y - line.y) < 1.2 &&
        line.x1 >= other.x1 - 1 &&
        line.x2 <= other.x2 + 1,
    ),
  );
}

/** Collapse text+vector pairs that describe the same writing area. */
function dedupeOverlappingLines(lines: Array<Line & { inlineLabel?: string }>) {
  const sorted = [...lines].sort(
    (left, right) => right.y - left.y || right.x2 - right.x1 - (left.x2 - left.x1),
  );
  const kept: Array<Line & { inlineLabel?: string }> = [];

  for (const line of sorted) {
    const twinIndex = kept.findIndex(
      (other) => Math.abs(other.y - line.y) < 3.5 && overlapRatio(other, line) >= 0.5,
    );
    if (twinIndex < 0) {
      kept.push(line);
      continue;
    }

    const twin = kept[twinIndex];
    const preferLine =
      (line.inlineLabel && !twin.inlineLabel) ||
      (line.source === "text" && twin.source === "vector") ||
      line.x2 - line.x1 > twin.x2 - twin.x1 + 4;
    if (preferLine) {
      kept[twinIndex] = {
        ...line,
        x1: Math.min(line.x1, twin.x1),
        x2: Math.max(line.x2, twin.x2),
        inlineLabel: line.inlineLabel || twin.inlineLabel,
      };
    } else {
      twin.x1 = Math.min(twin.x1, line.x1);
      twin.x2 = Math.max(twin.x2, line.x2);
      twin.inlineLabel = twin.inlineLabel || line.inlineLabel;
    }
  }

  return kept;
}

function collectVectorLines(
  operatorList: { fnArray: number[]; argsArray: unknown[] },
  OPS: { constructPath: number },
) {
  const solid: Line[] = [];
  const dashes: Line[] = [];

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    if (operatorList.fnArray[index] !== OPS.constructPath) continue;
    const bounds = Array.from((operatorList.argsArray[index] as number[][] | undefined)?.[2] || []) as number[];
    if (bounds.length < 4) continue;
    const [x1, y1, x2, y2] = bounds;
    const width = x2 - x1;
    const height = Math.abs(y2 - y1);
    if (height > 1.8) continue;
    if (y1 <= 40) continue;

    if (width >= 48) {
      solid.push({ x1, y: (y1 + y2) / 2, x2, source: "vector" });
    } else if (width >= 1.2 && width < 48) {
      dashes.push({ x1, y: (y1 + y2) / 2, x2, source: "vector" });
    }
  }

  return [...solid, ...mergeLineSegments(dashes).filter((line) => line.x2 - line.x1 >= 48)];
}

function collectTextFillLines(textItems: TextItem[]) {
  const lines: Array<Line & { inlineLabel?: string }> = [];
  const fillRunGlobal = /[._\-·…‧∙＿ .]{6,}/gu;

  for (const item of textItems) {
    const text = item.text;
    const runs: Array<{ start: number; end: number }> = [];
    fillRunGlobal.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = fillRunGlobal.exec(text)) !== null) {
      if (fillRatio(match[0]) >= 0.7 && match[0].replace(/\s+/g, "").length >= 6) {
        runs.push({ start: match.index, end: match.index + match[0].length });
      }
    }

    if (!runs.length) {
      if (isMostlyFillText(text) || FILL_RUN_RE.test(text.replace(/\s+/g, ""))) {
        lines.push({
          x1: item.x,
          y: item.y,
          x2: item.x + Math.max(item.width, 48),
          source: "text",
        });
      }
      continue;
    }

    for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
      const run = runs[runIndex];
      const after = text.slice(run.end).trim();
      // TOC / leader dots that continue into a page number or other content.
      if (after && /[A-Za-z0-9]/.test(after) && fillRatio(after) < 0.3 && !after.startsWith(",")) {
        continue;
      }

      const previousEnd = runIndex === 0 ? 0 : runs[runIndex - 1].end;
      let label = cleanLabel(text.slice(previousEnd, run.start).replace(/[,;]\s*$/g, ""));
      if (
        /^le$/i.test(label) &&
        runIndex > 0 &&
        /fait\s*à/i.test(cleanLabel(text.slice(0, runs[0].start)))
      ) {
        label = "Date";
      }
      const x1 = item.x + estimatePrefixWidth(text, run.start, item.width);
      const x2 = item.x + estimatePrefixWidth(text, run.end, item.width);
      lines.push({
        x1,
        y: item.y,
        x2: Math.max(x1 + 20, x2),
        source: "text",
        inlineLabel: label || undefined,
      });
    }
  }

  return lines;
}

/** Short captions printed under/over a writing line (diplomas, certificates). */
function looksLikeFieldCaption(label: string) {
  const cleaned = cleanLabel(label);
  if (!cleaned || cleaned.length > 42) return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  // Reject sentence fragments that sit beside a blank ("Given as a sample… on").
  if (
    words.length >= 3 &&
    /^(this|that|has|have|had|given|for|the|and|with|from|into|onto)\b/i.test(cleaned)
  ) {
    return false;
  }
  return true;
}

function findCaptionNearLine(
  line: Line,
  textItems: TextItem[],
  mode: "below" | "above" | "left",
) {
  const candidates = textItems.filter((item) => {
    if (isMostlyFillText(item.text)) return false;
    if (mode === "left") {
      return (
        Math.abs(item.y - line.y) <= 8 &&
        item.x < line.x1 &&
        item.x + item.width <= line.x1 + 16
      );
    }
    if (mode === "below") {
      return (
        item.y < line.y &&
        line.y - item.y <= 24 &&
        item.x < line.x2 &&
        item.x + item.width > line.x1
      );
    }
    return (
      item.y > line.y &&
      item.y - line.y <= 28 &&
      item.x < line.x2 + 8 &&
      item.x + item.width > line.x1 - 8
    );
  });

  return candidates.sort((left, right) => {
    if (mode === "left") {
      const vertical = Math.abs(left.y - line.y) - Math.abs(right.y - line.y);
      return vertical || right.x + right.width - (left.x + left.width);
    }
    const leftDistance = Math.abs(left.y - line.y);
    const rightDistance = Math.abs(right.y - line.y);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    // Prefer captions centered under/over the writing line.
    const lineMid = (line.x1 + line.x2) / 2;
    const leftMid = left.x + left.width / 2;
    const rightMid = right.x + right.width / 2;
    return Math.abs(leftMid - lineMid) - Math.abs(rightMid - lineMid);
  })[0];
}

function labelForLine(
  line: Line & { inlineLabel?: string },
  textItems: TextItem[],
  priorField?: DetectedStaticField,
) {
  if (line.inlineLabel) return line.inlineLabel;

  const sameRow = findCaptionNearLine(line, textItems, "left");
  const below = findCaptionNearLine(line, textItems, "below");
  const above = findCaptionNearLine(line, textItems, "above");

  const sameRowLabel = sameRow
    ? cleanLabel(
        (() => {
          const priorLine = textItems
            .filter(
              (item) =>
                item.x === sameRow.x &&
                item.y > sameRow.y &&
                item.y - sameRow.y < 16 &&
                item.text !== sameRow.text &&
                !isMostlyFillText(item.text),
            )
            .sort((left, right) => left.y - right.y)[0];
          return priorLine && /^procuration/i.test(sameRow.text.trim())
            ? `${priorLine.text} ${sameRow.text}`
            : sameRow.text;
        })(),
      )
    : "";
  const belowLabel = below ? cleanLabel(below.text) : "";
  const aboveLabel = above ? cleanLabel(above.text) : "";
  const sameRowIsCaption = Boolean(sameRowLabel && looksLikeFieldCaption(sameRowLabel));
  const belowCaption =
    below && belowLabel && looksLikeFieldCaption(belowLabel)
      ? { label: belowLabel, distance: line.y - below.y }
      : null;
  const aboveCaption =
    above && aboveLabel && looksLikeFieldCaption(aboveLabel)
      ? { label: aboveLabel, distance: above.y - line.y }
      : null;

  // Prefer nearby short captions (under or over the rule) over long prose beside blanks.
  if (!sameRowIsCaption && (belowCaption || aboveCaption)) {
    if (belowCaption && aboveCaption) {
      return belowCaption.distance <= aboveCaption.distance ? belowCaption.label : aboveCaption.label;
    }
    return (belowCaption || aboveCaption)!.label;
  }

  if (sameRowLabel) return sameRowLabel;
  if (belowCaption) return belowCaption.label;
  if (aboveCaption) return aboveCaption.label;
  if (aboveLabel) return aboveLabel;

  if (
    priorField?.placement &&
    Math.abs(priorField.placement.x - line.x1) < 4 &&
    Math.abs(priorField.placement.width - (line.x2 - line.x1)) < 8 &&
    priorField.placement.y - line.y < 26
  ) {
    return priorField.name.replace(/ \(\d+\)$/, "");
  }

  return `Page ${priorField?.placement.pageIndex !== undefined ? priorField.placement.pageIndex + 1 : 1} field`;
}

function representativeContext(line: Line, textItems: TextItem[]) {
  return textItems
    .filter(
      (item) =>
        /^Représentant\s+\d+$/i.test(item.text.trim()) &&
        item.y > line.y &&
        item.y - line.y < 125,
    )
    .sort((left, right) => left.y - line.y - (right.y - line.y))[0]?.text.trim();
}

function isDecorativeLine(
  line: Line,
  label: string,
  pageWidth: number,
  pageHeight: number,
) {
  const span = line.x2 - line.x1;
  if (span < 40) return true;

  const nearTop = line.y >= pageHeight * 0.78;
  const nearBottom = line.y <= pageHeight * 0.12;
  const nearFullWidth =
    span >= pageWidth * 0.82 &&
    (line.x1 < pageWidth * 0.08 || line.x2 > pageWidth * 0.92);
  const genericPageField = /^Page \d+ field$/i.test(label);

  // True page/frame borders: near-full width at the extreme top/bottom without a field label.
  if (nearFullWidth && (nearTop || nearBottom) && (looksLikeTitleLabel(label) || genericPageField)) {
    return true;
  }

  // Title underline under a large ALL CAPS heading near the top only.
  if (nearTop && looksLikeTitleLabel(label) && span >= pageWidth * 0.45) {
    return true;
  }

  return false;
}

type PdfJsTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

async function collectTextItems(page: {
  streamTextContent: () => ReadableStream<{ items: PdfJsTextItem[] }>;
}) {
  const reader = page.streamTextContent().getReader();
  const items: PdfJsTextItem[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    items.push(...value.items);
  }
  return items;
}

export async function detectStaticPdfFields(sourceBytes: ArrayBuffer) {
  await configurePdfJsWorker();
  const { getDocument, OPS } = await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  );

  const loadingTask = getDocument({
    data: new Uint8Array(sourceBytes.slice(0)),
    // Use host fonts instead of fetching pdf.js standard-font packs. Keeps
    // printed-form detection local (no CDN) and avoids Node/browser warnings.
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  const counts = new Map<string, number>();
  const detected: DetectedStaticField[] = [];

  for (let pageIndex = 0; pageIndex < document.numPages; pageIndex += 1) {
    const page = await document.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;
    const [sourceTextItems, operatorList] = await Promise.all([
      collectTextItems(page),
      page.getOperatorList(),
    ]);
    const textItems: TextItem[] = sourceTextItems
      .filter((item): item is Required<PdfJsTextItem> =>
        typeof item.str === "string" &&
        Boolean(item.str.trim()) &&
        Array.isArray(item.transform) &&
        typeof item.width === "number" &&
        typeof item.height === "number",
      )
      .map((item) => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
      }));

    const vectorLines = collectVectorLines(operatorList, OPS);
    const textLines = collectTextFillLines(textItems);
    const lines = dedupeOverlappingLines(mergeLineSegments([...vectorLines, ...textLines]));

    for (const line of lines) {
      const priorField = detected[detected.length - 1];
      const label = labelForLine(line, textItems, priorField);
      if (isDecorativeLine(line, label, pageWidth, pageHeight)) continue;

      const context = representativeContext(line, textItems);
      const baseName = context ? `${context} - ${label}` : label;
      detected.push({
        name: uniqueName(baseName, counts),
        type: "text",
        placement: {
          pageIndex,
          x: line.x1 + 2,
          // Sit slightly above the rule/dots so values don't collide with the guide line.
          y: line.y + (line.source === "text" ? 1.5 : 2.5),
          width: Math.max(20, line.x2 - line.x1 - 4),
          height: 11,
        },
      });
    }

    for (const item of textItems.filter((textItem) => {
      const glyph = textItem.text.trim();
      return glyph === "☐" || glyph === "□";
    })) {
      const label = textItems
        .filter(
          (candidate) =>
            candidate.x > item.x &&
            Math.abs(candidate.y - item.y) < 7 &&
            candidate.text.trim() !== item.text.trim() &&
            !isMostlyFillText(candidate.text),
        )
        .sort((left, right) => left.x - right.x)[0];
      detected.push({
        name: uniqueName(label?.text || `Page ${pageIndex + 1} checkbox`, counts),
        type: "checkbox",
        placement: {
          pageIndex,
          x: item.x + 1,
          y: item.y + 1,
          width: Math.max(8, item.width - 2),
          height: Math.max(8, item.height - 2),
        },
      });
    }
  }

  await loadingTask.destroy();
  return detected.sort(
    (left, right) =>
      left.placement.pageIndex - right.placement.pageIndex ||
      right.placement.y - left.placement.y ||
      left.placement.x - right.placement.x,
  );
}
