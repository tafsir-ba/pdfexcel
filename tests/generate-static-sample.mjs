import { readFile, writeFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import {
  applyStaticPdfFields,
  detectStaticPdfFields,
} from "../app/static-pdf.ts";

const source = await readFile(process.argv[2]);
const sourceBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
const fields = await detectStaticPdfFields(sourceBuffer);
const document = await PDFDocument.load(sourceBuffer);
document.registerFontkit(fontkit);
const fontBytes = await readFile(
  process.argv[4] || new URL("../app/assets/NotoSans-Regular.ttf", import.meta.url),
);
const font = await document.embedFont(fontBytes, { subset: true });
const row = {
  Date: "2026-07-30",
  Lieu: "Genève",
  "Noms, Prénoms (ou raison sociale)": "Alex Morgan",
  Email: "alex@example.com",
  Téléphone: "+41 22 555 01 23",
};
const mapping = Object.fromEntries(
  fields.map((field) => {
    const base = field.name.replace(/\s+\(\d+\)$/, "");
    return [field.name, Object.hasOwn(row, base) ? base : ""];
  }),
);
applyStaticPdfFields(document, fields, mapping, row, font);
await writeFile(process.argv[3], await document.save());
console.log(JSON.stringify({ fields: fields.length, mapped: Object.values(mapping).filter(Boolean).length }));
