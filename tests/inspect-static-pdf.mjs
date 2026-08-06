import { readFile } from "node:fs/promises";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

const data = new Uint8Array(await readFile(process.argv[2]));
const document = await getDocument({
  data,
  disableWorker: true,
  useSystemFonts: true,
}).promise;
const page = await document.getPage(1);
const text = await page.getTextContent();
const operators = await page.getOperatorList();

console.log("TEXT");
for (const item of text.items) {
  if (!("str" in item) || !item.str.trim()) continue;
  console.log(JSON.stringify({ text: item.str, transform: item.transform, width: item.width, height: item.height }));
}

console.log("PATHS");
for (let index = 0; index < operators.fnArray.length; index += 1) {
  if (operators.fnArray[index] !== OPS.constructPath) continue;
  console.log(JSON.stringify(operators.argsArray[index]));
}
