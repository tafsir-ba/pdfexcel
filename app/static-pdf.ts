import type { PDFDocument, PDFFont } from "pdf-lib";
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

export type StaticPlacement = {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DetectedStaticField = {
  name: string;
  type: "text" | "checkbox";
  placement: StaticPlacement;
};

export const CHECKBOX_ALWAYS = "__formbatch_always_checked__";

const TRUE_CHECKBOX_VALUES = /^(1|true|yes|y|checked|x|oui)$/i;

export function isCheckboxChecked(
  rule: string,
  row: Record<string, string>,
) {
  return rule === CHECKBOX_ALWAYS || TRUE_CHECKBOX_VALUES.test((row[rule] || "").trim());
}

export function applyStaticPdfFields(
  document: PDFDocument,
  fields: DetectedStaticField[],
  mapping: Record<string, string>,
  row: Record<string, string>,
  font: PDFFont,
) {
  for (const field of fields) {
    const rule = mapping[field.name];
    if (!rule) continue;
    const page = document.getPages()[field.placement.pageIndex];
    if (!page) continue;

    if (field.type === "checkbox") {
      if (isCheckboxChecked(rule, row)) {
        page.drawText("X", {
          x: field.placement.x,
          y: field.placement.y - 1,
          size: Math.min(9, field.placement.height),
          font,
        });
      }
      continue;
    }

    const value = row[rule] || "";
    if (!value) continue;

    let fontSize = Math.min(9, field.placement.height - 1);
    while (fontSize > 5 && font.widthOfTextAtSize(value, fontSize) > field.placement.width) {
      fontSize -= 0.5;
    }
    page.drawText(value, {
      x: field.placement.x,
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
};

function cleanLabel(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*[:;]\s*$/, "")
    .trim()
    .slice(0, 110);
}

function uniqueName(base: string, counts: Map<string, number>) {
  const cleaned = cleanLabel(base) || "Field";
  const count = (counts.get(cleaned) || 0) + 1;
  counts.set(cleaned, count);
  return count === 1 ? cleaned : `${cleaned} (${count})`;
}

function mergeLineSegments(lines: Line[]) {
  const sorted = [...lines].sort((left, right) => right.y - left.y || left.x1 - right.x1);
  const merged: Line[] = [];

  for (const line of sorted) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      Math.abs(previous.y - line.y) < 0.9 &&
      line.x1 - previous.x2 < 3 &&
      line.x1 >= previous.x1
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
        Math.abs(other.y - line.y) < 0.9 &&
        Math.abs(other.x1 - line.x1) < 1.5 &&
        Math.abs(other.x2 - line.x2) < 1.5 &&
        otherIndex < index,
    ),
  );
}

function labelForLine(line: Line, textItems: TextItem[], priorField?: DetectedStaticField) {
  const sameRow = textItems
    .filter(
      (item) =>
        Math.abs(item.y - line.y) <= 7 &&
        item.x < line.x1 &&
        item.x + item.width <= line.x1 + 12,
    )
    .sort((left, right) => {
      const vertical = Math.abs(left.y - line.y) - Math.abs(right.y - line.y);
      return vertical || right.x + right.width - (left.x + left.width);
    })[0];

  if (sameRow) {
    const priorLine = textItems
      .filter(
        (item) =>
          item.x === sameRow.x &&
          item.y > sameRow.y &&
          item.y - sameRow.y < 16 &&
          item.text !== sameRow.text,
      )
      .sort((left, right) => left.y - right.y)[0];
    return cleanLabel(
      priorLine && /^procuration/i.test(sameRow.text.trim())
        ? `${priorLine.text} ${sameRow.text}`
        : sameRow.text,
    );
  }

  const above = textItems
    .filter(
      (item) =>
        item.y > line.y &&
        item.y - line.y <= 28 &&
        item.x < line.x2 &&
        item.x + item.width > line.x1,
    )
    .sort((left, right) => left.y - line.y - (right.y - line.y))[0];
  if (above) return cleanLabel(above.text);

  if (
    priorField?.placement &&
    Math.abs(priorField.placement.x - line.x1) < 3 &&
    Math.abs(priorField.placement.width - (line.x2 - line.x1)) < 5 &&
    priorField.placement.y - line.y < 24
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
  const { getDocument, OPS } = await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  );

  const loadingTask = getDocument({ data: new Uint8Array(sourceBytes.slice(0)) });
  const document = await loadingTask.promise;
  const counts = new Map<string, number>();
  const detected: DetectedStaticField[] = [];

  for (let pageIndex = 0; pageIndex < document.numPages; pageIndex += 1) {
    const page = await document.getPage(pageIndex + 1);
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

    const rawLines: Line[] = [];
    for (let index = 0; index < operatorList.fnArray.length; index += 1) {
      if (operatorList.fnArray[index] !== OPS.constructPath) continue;
      const bounds = Array.from(operatorList.argsArray[index]?.[2] || []) as number[];
      if (bounds.length < 4) continue;
      const [x1, y1, x2, y2] = bounds;
      const width = x2 - x1;
      const height = y2 - y1;
      if (width >= 80 && height <= 1.6 && y1 > 80) {
        rawLines.push({ x1, y: (y1 + y2) / 2, x2 });
      }
    }

    const lines = mergeLineSegments(rawLines);
    for (const line of lines) {
      const priorField = detected[detected.length - 1];
      const label = labelForLine(line, textItems, priorField);
      const context = representativeContext(line, textItems);
      const baseName = context ? `${context} - ${label}` : label;
      detected.push({
        name: uniqueName(baseName, counts),
        type: "text",
        placement: {
          pageIndex,
          x: line.x1 + 2,
          y: line.y + 2,
          width: Math.max(20, line.x2 - line.x1 - 4),
          height: 11,
        },
      });
    }

    for (const item of textItems.filter((textItem) => textItem.text.trim() === "☐")) {
      const label = textItems
        .filter(
          (candidate) =>
            candidate.x > item.x &&
            Math.abs(candidate.y - item.y) < 7 &&
            candidate.text.trim() !== "☐",
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
