import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function createDemoFiles() {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const form = document.getForm();

  page.drawRectangle({ x: 0, y: 720, width: 612, height: 72, color: rgb(0.07, 0.17, 0.14) });
  page.drawText("EVENT PARTICIPATION CERTIFICATE", {
    x: 54,
    y: 750,
    size: 18,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("This certificate is presented to", { x: 54, y: 636, size: 12, font: regular });

  const name = form.createTextField("Full Name");
  name.addToPage(page, { x: 54, y: 566, width: 504, height: 48, borderWidth: 0 });
  name.setFontSize(24);

  page.drawText("for completing", { x: 54, y: 530, size: 12, font: regular });
  const course = form.createTextField("Course");
  course.addToPage(page, { x: 54, y: 478, width: 504, height: 36, borderWidth: 0 });
  course.setFontSize(16);

  page.drawText("Completion date", { x: 54, y: 420, size: 10, font: regular });
  const date = form.createTextField("Date");
  date.addToPage(page, { x: 54, y: 378, width: 220, height: 30, borderWidth: 0 });
  date.setFontSize(13);

  page.drawText("Certificate ID", { x: 338, y: 420, size: 10, font: regular });
  const id = form.createTextField("Certificate ID");
  id.addToPage(page, { x: 338, y: 378, width: 220, height: 30, borderWidth: 0 });
  id.setFontSize(13);

  page.drawLine({
    start: { x: 54, y: 326 },
    end: { x: 558, y: 326 },
    thickness: 1,
    color: rgb(0.83, 0.85, 0.84),
  });
  page.drawText("Generated with PDF Mail Merge", {
    x: 54,
    y: 294,
    size: 9,
    font: regular,
    color: rgb(0.35, 0.4, 0.38),
  });

  const pdfBytes = await document.save();
  const pdfBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength,
  ) as ArrayBuffer;
  const csvText = [
    "Full Name,Course,Date,Certificate ID",
    "Maya Patel,Practical Data Operations,2026-07-30,CERT-1001",
    "Noah Williams,Practical Data Operations,2026-07-30,CERT-1002",
    "Sofia Rossi,Practical Data Operations,2026-07-30,CERT-1003",
    "Liam Chen,Practical Data Operations,2026-07-30,CERT-1004",
    "Amara Okafor,Practical Data Operations,2026-07-30,CERT-1005",
  ].join("\n");

  return {
    pdf: new File([pdfBuffer], "sample-certificate.pdf", { type: "application/pdf" }),
    csv: new File([csvText], "sample-recipients.csv", { type: "text/csv" }),
  };
}
