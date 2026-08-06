import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("paid account workspace and batches round-trip on disk", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pdfbatch-workspace-"));
  process.env.ADMIN_SQLITE_PATH = path.join(root, "admin.sqlite");

  const {
    deleteCustomerWorkspace,
    listCustomerBatches,
    loadCustomerWorkspace,
    readCustomerBatch,
    saveCustomerBatch,
    saveCustomerWorkspace,
    workspaceSummary,
  } = await import("../lib/customer-workspace.ts");

  const db = {
    update() {
      return {
        set() {
          return {
            async where() {
              return undefined;
            },
          };
        },
      };
    },
  };

  const customerId = 42;
  const pdfBase64 = Buffer.from("%PDF-1.4 workspace-test").toString("base64");
  const csvBase64 = Buffer.from("Name,City\nAda,London\n").toString("base64");

  const meta = await saveCustomerWorkspace(db, customerId, {
    pdfName: "template.pdf",
    csvName: "recipients.csv",
    pdfBase64,
    csvBase64,
    mapping: { "Full Name": "Name" },
    filenameColumn: "Name",
    flatten: true,
    removedFieldNames: [],
  });
  assert.equal(meta.pdfName, "template.pdf");
  assert.ok(meta.updatedAt);

  const loaded = await loadCustomerWorkspace(customerId);
  assert.ok(loaded);
  assert.equal(loaded.pdfName, "template.pdf");
  assert.equal(loaded.csvName, "recipients.csv");
  assert.equal(loaded.mapping["Full Name"], "Name");
  assert.equal(loaded.pdfBase64, pdfBase64);
  assert.equal(loaded.csvBase64, csvBase64);

  const zipBytes = Buffer.from("PK\u0003\u0004fake-zip-bytes");
  const batch = await saveCustomerBatch(customerId, {
    filename: "pdf-batch-complete.zip",
    pdfCount: 12,
    kind: "complete",
    bytes: zipBytes,
  });
  assert.equal(batch.filename, "pdf-batch-complete.zip");
  assert.equal(batch.pdfCount, 12);
  assert.equal(batch.kind, "complete");

  const listed = await listCustomerBatches(customerId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, batch.id);

  const downloaded = await readCustomerBatch(customerId, batch.id);
  assert.ok(downloaded);
  assert.equal(downloaded.meta.filename, "pdf-batch-complete.zip");
  assert.deepEqual(Buffer.from(downloaded.bytes), zipBytes);

  const summary = await workspaceSummary(customerId);
  assert.equal(summary.hasWorkspace, true);
  assert.equal(summary.pdfName, "template.pdf");
  assert.equal(summary.batches.length, 1);

  await deleteCustomerWorkspace(customerId);
  assert.equal(await loadCustomerWorkspace(customerId), null);
  assert.equal((await listCustomerBatches(customerId)).length, 0);

  await rm(root, { recursive: true, force: true });
});

test("batch index keeps only the newest 25 archives", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pdfbatch-batches-"));
  process.env.ADMIN_SQLITE_PATH = path.join(root, "admin.sqlite");

  const { listCustomerBatches, saveCustomerBatch, deleteCustomerWorkspace } = await import(
    "../lib/customer-workspace.ts"
  );

  const customerId = 99;
  for (let index = 0; index < 27; index += 1) {
    await saveCustomerBatch(customerId, {
      filename: `batch-${index}.zip`,
      pdfCount: index + 1,
      kind: index % 2 === 0 ? "complete" : "preview",
      bytes: Buffer.from(`zip-${index}`),
    });
  }

  const listed = await listCustomerBatches(customerId);
  assert.equal(listed.length, 25);
  assert.match(listed[0].filename, /^batch-26/);
  assert.match(listed[24].filename, /^batch-2/);

  await deleteCustomerWorkspace(customerId);
  await rm(root, { recursive: true, force: true });
});
