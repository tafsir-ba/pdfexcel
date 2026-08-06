import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import Papa from "papaparse";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createDemoFiles } from "../app/demo-files.ts";
import { decodeCsvBytes } from "../app/csv.ts";
import {
  applyStaticPdfFields,
  CHECKBOX_ALWAYS,
  detectStaticPdfFields,
  isCheckboxChecked,
} from "../app/static-pdf.ts";
import { autoMapFields, reconcileFieldMapping } from "../app/mapping.ts";

test("the built-in sample is readable and includes five complete data rows", async () => {
  const sample = await createDemoFiles();
  const document = await PDFDocument.load(await sample.pdf.arrayBuffer());
  assert.deepEqual(
    document.getForm().getFields().map((field) => field.getName()),
    ["Full Name", "Course", "Date", "Certificate ID"],
  );

  const parsed = Papa.parse(await sample.csv.text(), { header: true, skipEmptyLines: "greedy" });
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.data.length, 5);
  assert.equal(parsed.data[0]["Full Name"], "Maya Patel");
});

test("CSV decoding preserves UTF-8, Windows-1252, and Mac Roman names", () => {
  const utf8 = new TextEncoder().encode("First Name\nSérèna Nguyễn");
  assert.deepEqual(decodeCsvBytes(utf8), {
    text: "First Name\nSérèna Nguyễn",
    encoding: "utf-8",
  });

  const windows1252 = Uint8Array.from([0x46, 0x69, 0x72, 0x73, 0x74, 0x20, 0x4e, 0x61, 0x6d, 0x65, 0x0a, 0x41, 0x6e, 0x64, 0x72, 0xe9]);
  assert.deepEqual(decodeCsvBytes(windows1252), {
    text: "First Name\nAndré",
    encoding: "windows-1252",
  });

  const macRoman = Uint8Array.from([0x46, 0x69, 0x72, 0x73, 0x74, 0x20, 0x4e, 0x61, 0x6d, 0x65, 0x0a, 0x53, 0x8e, 0x72, 0x8e, 0x6e, 0x61]);
  assert.deepEqual(decodeCsvBytes(macRoman), {
    text: "First Name\nSéréna",
    encoding: "macintosh",
  });
});

test("pdf-lib fills a reusable form and JSZip preserves every generated document", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([400, 240]);
  const field = source.getForm().createTextField("Full Name");
  field.addToPage(page, { x: 40, y: 120, width: 300, height: 30 });
  const sourceBytes = await source.save();
  const names = ["Maya Patel", "Noah Williams", "Sofia Rossi", "Liam Chen", "Amara Okafor"];
  const archive = new JSZip();

  for (let index = 0; index < names.length; index += 1) {
    const document = await PDFDocument.load(sourceBytes);
    const form = document.getForm();
    form.getTextField("Full Name").setText(names[index]);
    form.updateFieldAppearances(await document.embedFont(StandardFonts.Helvetica));
    form.flatten();
    archive.file(`${String(index + 1).padStart(3, "0")}-${names[index].replace(/ /g, "-")}.pdf`, await document.save());
  }

  const zipBytes = await archive.generateAsync({ type: "uint8array" });
  const reopened = await JSZip.loadAsync(zipBytes);
  const pdfNames = Object.keys(reopened.files).filter((name) => name.endsWith(".pdf"));
  assert.equal(pdfNames.length, names.length);

  const firstBytes = await reopened.file(pdfNames[0]).async("uint8array");
  const firstDocument = await PDFDocument.load(firstBytes);
  const content = firstDocument.getForm().getFields();
  assert.equal(content.length, 0, "flattened output should not retain editable fields");
});

test("custom font generation supports accented and Vietnamese names", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([400, 240]);
  source.getForm().createTextField("Full Name").addToPage(page, {
    x: 40,
    y: 120,
    width: 300,
    height: 30,
  });
  const sourceBytes = await source.save();
  const fontBytes = await readFile(
    new URL("../app/assets/NotoSans-Regular.ttf", import.meta.url),
  );

  for (const name of ["Zoë Šimůnek", "Søren Nguyễn"]) {
    const document = await PDFDocument.load(sourceBytes);
    document.registerFontkit(fontkit);
    const form = document.getForm();
    form.getTextField("Full Name").setText(name);
    form.updateFieldAppearances(await document.embedFont(fontBytes, { subset: true }));
    form.flatten();
    const output = await document.save();
    assert.ok(output.length > sourceBytes.length, `${name} should produce an embedded-font PDF`);
  }
});

test("printed PDF forms expose labelled writing lines as mappable fields", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([500, 300]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("Full Name", { x: 40, y: 220, size: 10, font });
  page.drawLine({
    start: { x: 150, y: 219 },
    end: { x: 430, y: 219 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  page.drawText("Email", { x: 40, y: 190, size: 10, font });
  page.drawLine({
    start: { x: 150, y: 189 },
    end: { x: 430, y: 189 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });

  const bytes = await document.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const fields = await detectStaticPdfFields(buffer);
  assert.deepEqual(fields.map((field) => field.name), ["Full Name", "Email"]);
  assert.equal(fields[0].placement.pageIndex, 0);
  assert.ok(fields[0].placement.width > 270);
});

test("checkbox rules only mark explicit true values", () => {
  assert.equal(isCheckboxChecked("", {}), false);
  assert.equal(isCheckboxChecked(CHECKBOX_ALWAYS, {}), true);

  for (const value of ["1", "true", "YES", "y", "checked", "x", "oui"]) {
    assert.equal(isCheckboxChecked("Approved", { Approved: value }), true, value);
  }
  for (const value of ["", "0", "false", "no", "non", "Alex Morgan"]) {
    assert.equal(isCheckboxChecked("Approved", { Approved: value }), false, value);
  }
});

test("printed checkboxes draw a mark only when their rule passes", () => {
  const draws = [];
  const document = {
    getPages: () => [{ drawText: (text, options) => draws.push({ text, options }) }],
  };
  const field = {
    name: "Approved",
    type: "checkbox",
    placement: { pageIndex: 0, x: 24, y: 40, width: 10, height: 10 },
  };

  applyStaticPdfFields(document, [field], { Approved: "Approved column" }, { "Approved column": "no" }, {});
  assert.equal(draws.length, 0);

  applyStaticPdfFields(document, [field], { Approved: "Approved column" }, { "Approved column": "yes" }, {});
  assert.equal(draws.length, 1);
  assert.equal(draws[0].text, "X");
  assert.equal(draws[0].options.x, 24);

  draws.length = 0;
  applyStaticPdfFields(document, [field], { Approved: CHECKBOX_ALWAYS }, {}, {});
  assert.equal(draws.length, 1);
});

test("mapping reconcile preserves Always-check and intentional blank values", () => {
  const fields = [{ name: "Approved" }, { name: "Full Name" }, { name: "Course" }];
  const headers = ["Full Name", "Approved", "Course"];

  assert.deepEqual(autoMapFields(fields, headers), {
    Approved: "Approved",
    "Full Name": "Full Name",
    Course: "Course",
  });

  const restored = reconcileFieldMapping(fields, headers, {
    Approved: CHECKBOX_ALWAYS,
    "Full Name": "",
    Course: "Course",
  });
  assert.equal(restored.Approved, CHECKBOX_ALWAYS);
  assert.equal(restored["Full Name"], "");
  assert.equal(restored.Course, "Course");

  const remapped = reconcileFieldMapping(fields, headers, {
    Approved: "Missing Column",
  });
  assert.equal(remapped.Approved, "Approved");
  assert.equal(remapped["Full Name"], "Full Name");
});
