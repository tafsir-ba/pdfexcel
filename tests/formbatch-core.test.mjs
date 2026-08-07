import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import Papa from "papaparse";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { createDemoFiles } from "../app/demo-files.ts";
import { decodeCsvBytes } from "../app/csv.ts";
import {
  applyStaticPdfFields,
  CHECKBOX_ALWAYS,
  detectStaticPdfFields,
  isCheckboxChecked,
  measureTextHeight,
  mergeSavedPlacements,
  normalizePageRotation,
  placementTextOrigin,
  visualPageSize,
  visualToUserSpace,
  withoutRemovedFields,
  withSavedPlacements,
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

test("blank PDFs with no printed lines still return an empty field list", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([400, 500]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("Just a decorative cover page", { x: 80, y: 250, size: 14, font });
  const bytes = await document.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const fields = await detectStaticPdfFields(buffer);
  assert.deepEqual(fields, []);
});

test("diploma-style captions under writing lines become field names", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([792, 612]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const italic = await document.embedFont(StandardFonts.TimesRomanItalic);

  page.drawText("This certifies that", { x: 320, y: 430, size: 14, font: italic });
  page.drawLine({
    start: { x: 180, y: 385 },
    end: { x: 610, y: 385 },
    thickness: 1.2,
    color: rgb(0.72, 0.58, 0.28),
  });
  page.drawText("Recipient Name", { x: 355, y: 368, size: 8, font });

  page.drawText("has completed the fictional requirements for the novelty degree of", {
    x: 170,
    y: 340,
    size: 12,
    font: italic,
  });
  page.drawLine({
    start: { x: 250, y: 310 },
    end: { x: 540, y: 310 },
    thickness: 1.2,
    color: rgb(0.72, 0.58, 0.28),
  });
  page.drawText("Degree", { x: 380, y: 293, size: 8, font });

  page.drawText("in", { x: 390, y: 270, size: 12, font: italic });
  page.drawLine({
    start: { x: 250, y: 240 },
    end: { x: 540, y: 240 },
    thickness: 1.2,
    color: rgb(0.72, 0.58, 0.28),
  });
  page.drawText("Field of Study", { x: 360, y: 223, size: 8, font });

  page.drawText("Given as a sample novelty document on", { x: 200, y: 180, size: 11, font: italic });
  page.drawLine({
    start: { x: 430, y: 178 },
    end: { x: 580, y: 178 },
    thickness: 1.2,
    color: rgb(0.72, 0.58, 0.28),
  });
  page.drawText("Date", { x: 495, y: 161, size: 8, font });

  const bytes = await document.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const names = (await detectStaticPdfFields(buffer)).map((field) => field.name);

  assert.ok(names.includes("Recipient Name"), `got ${names.join(", ")}`);
  assert.ok(names.includes("Degree"), `got ${names.join(", ")}`);
  assert.ok(names.includes("Field of Study"), `got ${names.join(", ")}`);
  assert.ok(names.includes("Date"), `got ${names.join(", ")}`);
  assert.equal(
    names.some((name) => /given as a sample/i.test(name)),
    false,
    "long sentence beside the date line must not become the field name",
  );
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

test("dotted and underscored printed lines are detected with labels", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);

  page.drawText("ATTESTATION D'HEBERGEMENT", { x: 140, y: 720, size: 16, font });
  page.drawRectangle({
    x: 120,
    y: 710,
    width: 370,
    height: 28,
    borderWidth: 1,
    borderColor: rgb(0, 0, 0),
  });

  page.drawText("NOM : ........................................", { x: 54, y: 640, size: 11, font });
  page.drawText("Prénom : ....................................", { x: 54, y: 610, size: 11, font });
  page.drawText("Né(e) le", { x: 54, y: 580, size: 11, font });
  page.drawText("........................", { x: 120, y: 580, size: 11, font });
  page.drawText("Demeurant", { x: 54, y: 550, size: 11, font });
  page.drawText("____________________________________________", { x: 54, y: 530, size: 11, font });
  page.drawText("Fait à .................... , le ....................", { x: 54, y: 480, size: 11, font });

  const bytes = await document.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const fields = await detectStaticPdfFields(buffer);
  const names = fields.map((field) => field.name);

  assert.ok(names.includes("NOM"), `expected NOM in ${names.join(", ")}`);
  assert.ok(names.includes("Prénom"), `expected Prénom in ${names.join(", ")}`);
  assert.ok(
    names.some((name) => /né/i.test(name)),
    `expected birth-date label in ${names.join(", ")}`,
  );
  assert.ok(
    names.some((name) => /demeurant/i.test(name)),
    `expected Demeurant in ${names.join(", ")}`,
  );
  assert.equal(
    names.includes("ATTESTATION D'HEBERGEMENT"),
    false,
    "title box must not become a fill field",
  );
});

test("dashed vector writing lines merge into labelled fields", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([500, 300]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("Address", { x: 40, y: 200, size: 10, font });
  for (let x = 120; x < 420; x += 8) {
    page.drawLine({
      start: { x, y: 198 },
      end: { x: x + 4, y: 198 },
      thickness: 0.6,
      color: rgb(0, 0, 0),
    });
  }

  const bytes = await document.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const fields = await detectStaticPdfFields(buffer);
  assert.ok(fields.some((field) => field.name === "Address"));
  assert.ok(fields.some((field) => field.name === "Address" && field.placement.width > 150));
});

test("auto-map matches synonyms and fuzzy header names", () => {
  const fields = [
    { name: "NOM" },
    { name: "Prénom" },
    { name: "Demeurant" },
    { name: "Né(e) le" },
  ];
  const headers = [
    "id",
    "host_last_name",
    "host_first_name",
    "host_dob",
    "address",
  ];
  const mapped = autoMapFields(fields, headers);
  assert.equal(mapped.NOM, "host_last_name");
  assert.equal(mapped.Prénom, "host_first_name");
  assert.equal(mapped.Demeurant, "address");
  assert.equal(mapped["Né(e) le"], "host_dob");
});

test("wide mid-page writing lines and ALL-CAPS labels stay detectable", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("Address", { x: 40, y: 400, size: 11, font });
  page.drawLine({
    start: { x: 36, y: 398 },
    end: { x: 576, y: 398 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });
  page.drawText("PERMANENT ADDRESS", { x: 54, y: 300, size: 11, font });
  page.drawLine({
    start: { x: 54, y: 285 },
    end: { x: 400, y: 285 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });

  const bytes = await document.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const names = (await detectStaticPdfFields(buffer)).map((field) => field.name);
  assert.ok(names.includes("Address"), `got ${names.join(", ")}`);
  assert.ok(names.includes("PERMANENT ADDRESS"), `got ${names.join(", ")}`);
});

test("bracket list markers are not treated as checkboxes", async () => {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const page = document.addPage([400, 300]);
  const fontBytes = await readFile(new URL("../app/assets/NotoSans-Regular.ttf", import.meta.url));
  const font = await document.embedFont(fontBytes);
  page.drawText("[", { x: 40, y: 200, size: 12, font });
  page.drawText("Agree", { x: 55, y: 200, size: 12, font });
  page.drawText("☐", { x: 40, y: 160, size: 12, font });
  page.drawText("Consent", { x: 55, y: 160, size: 12, font });

  const bytes = await document.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const fields = await detectStaticPdfFields(buffer);
  assert.equal(fields.filter((field) => field.type === "checkbox").length, 1);
  assert.equal(fields.find((field) => field.type === "checkbox")?.name, "Consent");
});

test("overlapping text and vector writing lines dedupe to one field", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([500, 300]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("Email", { x: 40, y: 200, size: 11, font });
  page.drawText("______________________________", { x: 100, y: 200, size: 11, font });
  page.drawLine({
    start: { x: 100, y: 198 },
    end: { x: 400, y: 198 },
    thickness: 0.5,
    color: rgb(0, 0, 0),
  });

  const bytes = await document.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const names = (await detectStaticPdfFields(buffer)).map((field) => field.name);
  assert.deepEqual(names.filter((name) => name.startsWith("Email")), ["Email"]);
});

test("inline dotted fill placement starts after the label, not over it", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 300]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const text = "NOM : ........................................";
  page.drawText(text, { x: 54, y: 180, size: 11, font });

  const bytes = await document.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const fields = await detectStaticPdfFields(buffer);
  const nom = fields.find((field) => field.name === "NOM");
  assert.ok(nom, `fields were ${fields.map((field) => field.name).join(", ")}`);
  // Label "NOM : " is wider than a raw character ratio predicts; fill must clear it.
  assert.ok(nom.placement.x > 90, `expected fill x past label, got ${nom.placement.x}`);
});

test("Fait à / le dual dotted blanks become two labelled fields", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 400]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("Fait à .................... , le ....................", {
    x: 54,
    y: 200,
    size: 11,
    font,
  });

  const bytes = await document.save();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const names = (await detectStaticPdfFields(buffer)).map((field) => field.name);
  assert.ok(names.includes("Fait à"), `got ${names.join(", ")}`);
  assert.ok(
    names.includes("Date") || names.includes("le") || names.some((name) => /^le/i.test(name)),
    `got ${names.join(", ")}`,
  );
  assert.equal(names.some((name) => name.includes("....")), false);
});

test("birth-date labels do not map to completion dates; Nomination does not steal NOM", () => {
  assert.deepEqual(
    autoMapFields(
      [{ name: "Date de naissance" }, { name: "NOM" }],
      ["completion_date", "date_of_birth", "host_last_name"],
    ),
    {
      "Date de naissance": "date_of_birth",
      NOM: "host_last_name",
    },
  );

  assert.deepEqual(
    autoMapFields([{ name: "Nomination" }, { name: "NOM" }], ["host_last_name", "other"]),
    {
      Nomination: "",
      NOM: "host_last_name",
    },
  );
});

test("document Date prefers fait_le over birth-date columns", () => {
  assert.deepEqual(
    autoMapFields(
      [{ name: "Date" }, { name: "Date de naissance" }, { name: "NOM" }],
      ["host_date_naissance", "fait_le", "host_last_name"],
    ),
    {
      Date: "fait_le",
      "Date de naissance": "host_date_naissance",
      NOM: "host_last_name",
    },
  );

  assert.deepEqual(autoMapFields([{ name: "Date" }], ["host_date_naissance", "fait_le"]), {
    Date: "fait_le",
  });

  // Prefer leaving Date unmapped over guessing a birth column.
  assert.deepEqual(autoMapFields([{ name: "Date" }], ["host_date_naissance"]), {
    Date: "",
  });
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

test("printed text fields honor chosen font size", () => {
  const draws = [];
  const font = {
    widthOfTextAtSize: () => 20,
  };
  const document = {
    getPages: () => [{ drawText: (text, options) => draws.push({ text, options }) }],
  };
  const field = {
    name: "Full Name",
    type: "text",
    placement: { pageIndex: 0, x: 10, y: 40, width: 120, height: 16, fontSize: 14, fontFamily: "times" },
  };

  applyStaticPdfFields(
    document,
    [field],
    { "Full Name": "Name" },
    { Name: "Ada Lovelace" },
    { default: font, times: font },
  );
  assert.equal(draws.length, 1);
  assert.equal(draws[0].text, "Ada Lovelace");
  assert.equal(draws[0].options.size, 14);
  assert.equal(draws[0].options.font, font);
});

test("printed text fields honor bold and alignment", () => {
  const draws = [];
  const regular = { widthOfTextAtSize: (text, size) => text.length * size * 0.5 };
  const bold = { widthOfTextAtSize: (text, size) => text.length * size * 0.55 };
  const document = {
    getPages: () => [{ drawText: (text, options) => draws.push({ text, options }) }],
  };
  const field = {
    name: "Full Name",
    type: "text",
    placement: {
      pageIndex: 0,
      x: 10,
      y: 40,
      width: 200,
      height: 18,
      fontSize: 12,
      fontFamily: "helvetica",
      bold: true,
      align: "center",
    },
  };

  applyStaticPdfFields(
    document,
    [field],
    { "Full Name": "Name" },
    { Name: "Ada" },
    { default: regular, helvetica: regular, helveticaBold: bold },
  );
  assert.equal(draws.length, 1);
  assert.equal(draws[0].options.font, bold);
  assert.ok(draws[0].options.x > 10, "centered text should shift right of the box origin");
});

test("visual page helpers map /Rotate 90 into landscape viewer space", () => {
  assert.equal(normalizePageRotation(90), 90);
  assert.equal(normalizePageRotation(-90), 270);
  assert.deepEqual(visualPageSize(595, 842, 90), { width: 842, height: 595 });
  assert.deepEqual(visualToUserSpace(300, 280, 595, 842, 90), { x: 315, y: 300 });
  assert.deepEqual(visualToUserSpace(100, 50, 400, 200, 0), { x: 100, y: 50 });
});

test("placementTextOrigin centers glyphs inside the writing box", () => {
  const origin = placementTextOrigin(
    { x: 100, y: 200, width: 180, height: 28, align: "left" },
    60,
    14,
  );
  assert.equal(origin.x, 102);
  assert.equal(origin.y, 200 + (28 - 14) / 2);
  const centered = placementTextOrigin(
    { x: 100, y: 200, width: 180, height: 28, align: "center" },
    60,
    14,
  );
  assert.ok(centered.x > origin.x);
});

test("printed text on a /Rotate 90 page is drawn upright in viewer space", async () => {
  const source = await PDFDocument.create();
  const template = source.addPage([400, 200]);
  template.setRotation(degrees(90));
  const bytes = await source.save();

  const document = await PDFDocument.load(bytes);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const placement = { pageIndex: 0, x: 40, y: 120, width: 160, height: 18, fontSize: 14 };
  applyStaticPdfFields(
    document,
    [{ name: "Name", type: "text", placement }],
    { Name: "Name" },
    { Name: "ROBERT" },
    font,
  );

  const expected = placementTextOrigin(
    placement,
    font.widthOfTextAtSize("ROBERT", 14),
    measureTextHeight(font, 14),
  );

  const filled = await document.save();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: filled, useSystemFonts: true });
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  assert.equal(Math.round(viewport.width), 200);
  assert.equal(Math.round(viewport.height), 400);

  const content = await page.getTextContent();
  const item = content.items.find((entry) => entry.str === "ROBERT");
  assert.ok(item, "filled value should be present");
  const [vx, vyTop] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
  const vy = viewport.height - vyTop;
  assert.ok(Math.abs(vx - expected.x) < 1.5, `expected visual x≈${expected.x}, got ${vx}`);
  assert.ok(Math.abs(vy - expected.y) < 1.5, `expected visual y≈${expected.y}, got ${vy}`);
  const xAxis = viewport.convertToViewportPoint(
    item.transform[4] + item.transform[0],
    item.transform[5] + item.transform[1],
  );
  const angle = (Math.atan2(viewport.height - xAxis[1] - vy, xAxis[0] - vx) * 180) / Math.PI;
  assert.ok(Math.abs(angle) < 1, `text should be horizontal in viewer space, got ${angle}°`);
  await task.destroy();
});

test("printed text falls back when the chosen font cannot encode the value", () => {
  const draws = [];
  const helvetica = {
    widthOfTextAtSize: () => {
      throw new Error("WinAnsi cannot encode");
    },
  };
  const noto = {
    widthOfTextAtSize: () => 40,
  };
  const document = {
    getPages: () => [{ drawText: (text, options) => draws.push({ text, options }) }],
  };
  const field = {
    name: "Full Name",
    type: "text",
    placement: {
      pageIndex: 0,
      x: 10,
      y: 40,
      width: 120,
      height: 16,
      fontFamily: "helvetica",
      fontSize: 12,
    },
  };

  applyStaticPdfFields(
    document,
    [field],
    { "Full Name": "Name" },
    { Name: "Nguyễn" },
    { default: helvetica, helvetica, noto },
  );
  assert.equal(draws.length, 1);
  assert.equal(draws[0].text, "Nguyễn");
  assert.equal(draws[0].options.font, noto);
  assert.equal(draws[0].options.size, 12);
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

test("mergeSavedPlacements restores nudged boxes by field name after re-detect", () => {
  const detected = [
    {
      name: "Nom",
      type: "text",
      placement: { pageIndex: 0, x: 100, y: 200, width: 180, height: 12 },
    },
    {
      name: "Adresse",
      type: "text",
      placement: { pageIndex: 0, x: 100, y: 160, width: 220, height: 12 },
    },
  ];
  const saved = {
    Nom: { pageIndex: 0, x: 140, y: 198, width: 180, height: 12 },
  };

  const merged = mergeSavedPlacements(detected, saved);
  assert.equal(merged[0].placement.x, 140);
  assert.equal(merged[1].placement.x, 100);
  assert.deepEqual(mergeSavedPlacements(detected, null), detected);
  assert.deepEqual(mergeSavedPlacements(detected, undefined), detected);
});

test("withoutRemovedFields drops previewer-deleted writing areas", () => {
  const fields = [{ name: "Nom" }, { name: "Page 1 field" }, { name: "A" }];
  assert.deepEqual(
    withoutRemovedFields(fields, ["Page 1 field", "A"]).map((field) => field.name),
    ["Nom"],
  );
  assert.deepEqual(withoutRemovedFields(fields, null), fields);
  assert.deepEqual(withoutRemovedFields(fields, []), fields);
});

test("withSavedPlacements rehydrates manual fields when detection is empty", () => {
  const saved = {
    "Field 1": {
      pageIndex: 0,
      x: 120,
      y: 400,
      width: 200,
      height: 28,
      fontFamily: "helvetica",
      fontSize: 12,
      bold: true,
      align: "center",
    },
  };
  const restored = withSavedPlacements([], saved, null);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].name, "Field 1");
  assert.equal(restored[0].type, "text");
  assert.equal(restored[0].placement.x, 120);
  assert.equal(restored[0].placement.bold, true);
  assert.equal(restored[0].placement.align, "center");
});

test("withSavedPlacements merges detected boxes and skips removed manual names", () => {
  const detected = [
    {
      name: "Nom",
      type: "text",
      placement: { pageIndex: 0, x: 100, y: 200, width: 180, height: 12 },
    },
  ];
  const saved = {
    Nom: { pageIndex: 0, x: 140, y: 198, width: 180, height: 12 },
    "Field 2": { pageIndex: 0, x: 50, y: 80, width: 160, height: 28 },
    Gone: { pageIndex: 0, x: 10, y: 10, width: 100, height: 20 },
  };
  const restored = withSavedPlacements(detected, saved, ["Gone"]);
  assert.deepEqual(
    restored.map((field) => field.name),
    ["Nom", "Field 2"],
  );
  assert.equal(restored[0].placement.x, 140);
  assert.equal(restored[1].placement.y, 80);
});

test("placement geometry separates overlaps and supports non-overlapping resize", async () => {
  const {
    clampToPage,
    findOpenPlacement,
    movePlacementFree,
    movePlacementInteractive,
    movePlacementWithoutOverlap,
    placementsOverlap,
    resizePlacementWithoutOverlap,
    resolveFieldOverlaps,
    separateFromOthers,
    softSnapPlacement,
  } = await import("../app/placement-geometry.ts");

  const page = { width: 600, height: 800 };
  const a = { pageIndex: 0, x: 100, y: 200, width: 120, height: 12 };
  const b = { pageIndex: 0, x: 110, y: 205, width: 120, height: 12 };
  assert.equal(placementsOverlap(a, b), true);

  const separated = resolveFieldOverlaps(
    [
      { name: "A", placement: a },
      { name: "B", placement: b },
    ],
    page,
  );
  assert.equal(placementsOverlap(separated[0].placement, separated[1].placement), false);

  const moved = movePlacementWithoutOverlap(a, 5, 0, [separated[1].placement], page);
  assert.equal(placementsOverlap(moved, separated[1].placement), false);

  const resized = resizePlacementWithoutOverlap(a, "e", 400, 0, [separated[1].placement], page);
  assert.ok(resized.width >= 24);
  assert.equal(placementsOverlap(resized, separated[1].placement), false);

  const open = findOpenPlacement(0, page, [a, separated[1].placement]);
  assert.equal(placementsOverlap(open, a), false);
  assert.equal(placementsOverlap(open, separated[1].placement), false);

  const checkbox = { pageIndex: 0, x: 50, y: 100, width: 8, height: 8 };
  const neighbor = { pageIndex: 0, x: 70, y: 100, width: 100, height: 11 };
  assert.equal(placementsOverlap(checkbox, neighbor), false);
  assert.deepEqual(clampToPage(checkbox, page), checkbox);
  const resolvedSmall = resolveFieldOverlaps(
    [
      { name: "Cb", placement: checkbox },
      { name: "Nom", placement: neighbor },
    ],
    page,
  );
  assert.equal(resolvedSmall.find((field) => field.name === "Cb")?.placement.width, 8);
  assert.equal(
    placementsOverlap(resolvedSmall[0].placement, resolvedSmall[1].placement),
    false,
  );

  const restoredOverlap = resolveFieldOverlaps(
    [
      { name: "A", placement: a },
      { name: "B", placement: b },
    ],
    page,
  );
  assert.equal(
    placementsOverlap(restoredOverlap[0].placement, restoredOverlap[1].placement),
    false,
  );

  // Free move tracks cursor 1:1 without collision teleport.
  const free = movePlacementFree(a, 40, -15, page);
  assert.equal(free.x, 140);
  assert.equal(free.y, 185);

  // MTV separation nudges by overlap depth instead of jumping past the whole blocker.
  const blocker = { pageIndex: 0, x: 200, y: 200, width: 100, height: 20 };
  const overlapping = { pageIndex: 0, x: 210, y: 205, width: 50, height: 12 };
  const nudged = separateFromOthers(overlapping, [blocker], page);
  assert.equal(placementsOverlap(nudged, blocker), false);
  assert.ok(
    Math.abs(nudged.x - overlapping.x) < blocker.width,
    `expected small MTV nudge, got dx=${nudged.x - overlapping.x}`,
  );

  // Soft snap aligns left edges within threshold.
  const nearAlign = { pageIndex: 0, x: 102, y: 50, width: 80, height: 12 };
  const snapTarget = { pageIndex: 0, x: 100, y: 80, width: 90, height: 12 };
  const snapped = softSnapPlacement(nearAlign, [snapTarget], page, 3);
  assert.equal(snapped.placement.x, 100);
  assert.ok(snapped.guides.x.includes(100));

  const interactive = movePlacementInteractive(a, 0, 0, [snapTarget], page);
  assert.equal(interactive.placement.pageIndex, 0);
});
