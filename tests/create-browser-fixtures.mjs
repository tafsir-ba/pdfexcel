import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

const target = "/tmp/formbatch-fixtures";
await mkdir(target, { recursive: true });

const plain = await PDFDocument.create();
plain.addPage([400, 240]);
await writeFile(`${target}/plain-no-fields.pdf`, await plain.save());

const fillable = await PDFDocument.create();
const page = fillable.addPage([400, 240]);
const name = fillable.getForm().createTextField("Full Name");
name.addToPage(page, { x: 40, y: 120, width: 300, height: 30 });
await writeFile(`${target}/fillable.pdf`, await fillable.save());

await writeFile(`${target}/empty.pdf`, new Uint8Array());
await writeFile(`${target}/empty.csv`, "");
await writeFile(`${target}/headers-only.csv`, "Full Name,Department\n");
await writeFile(
  `${target}/unicode.csv`,
  "Full Name\nZoë Šimůnek\nSøren Nguyễn\n東京 太郎\n",
);
await writeFile(`${target}/alternate-columns.csv`, "Recipient,Team\nAvery Stone,Operations\n");
await writeFile(
  `${target}/evahomes.csv`,
  [
    '"Date","Lieu","Noms, Prénoms (ou raison sociale)","Email","Téléphone"',
    '"2026-07-30","Genève","Alex Morgan","alex@example.com","+41 22 555 01 23"',
  ].join("\n"),
);

const rows = ["Full Name"];
for (let index = 1; index <= 251; index += 1) rows.push(`Person ${index}`);
await writeFile(`${target}/251-rows.csv`, `${rows.join("\n")}\n`);

console.log(target);
