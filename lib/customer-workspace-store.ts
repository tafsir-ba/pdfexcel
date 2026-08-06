import { mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import path from "node:path";

export type WorkspacePayload = {
  pdfName: string;
  csvName: string;
  pdfBase64: string;
  csvBase64: string;
  mapping: Record<string, string>;
  filenameColumn: string;
  flatten: boolean;
  fieldPlacements?: Record<string, unknown>;
  removedFieldNames?: string[];
};

export type WorkspaceMeta = {
  pdfName: string;
  csvName: string;
  mapping: Record<string, string>;
  filenameColumn: string;
  flatten: boolean;
  fieldPlacements?: Record<string, unknown>;
  removedFieldNames?: string[];
  updatedAt: string;
};

export type BatchRecord = {
  id: string;
  filename: string;
  pdfCount: number;
  kind: "preview" | "complete";
  createdAt: string;
  bytes: number;
};

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_BYTES = 150 * 1024 * 1024;
const MAX_BATCHES = 25;

function workspaceRootDir() {
  const configured = process.env.ADMIN_SQLITE_PATH || "./data/admin.sqlite";
  const absolute = configured.startsWith("/") ? configured : path.join(process.cwd(), configured);
  return path.join(path.dirname(absolute), "workspaces");
}

function customerDir(customerId: number) {
  return path.join(workspaceRootDir(), String(customerId));
}

function batchesDir(customerId: number) {
  return path.join(customerDir(customerId), "batches");
}

function decodeBase64(value: string, maxBytes: number, label: string) {
  const cleaned = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer.length) throw new Error(`${label} is empty.`);
  if (buffer.byteLength > maxBytes) throw new Error(`${label} is too large.`);
  return buffer;
}

function sanitizeStoredName(value: string, fallback: string) {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

async function readBatchIndex(customerId: number): Promise<BatchRecord[]> {
  try {
    const raw = await readFile(path.join(batchesDir(customerId), "index.json"), "utf8");
    const parsed = JSON.parse(raw) as BatchRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeBatchIndex(customerId: number, records: BatchRecord[]) {
  const dir = batchesDir(customerId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.json"), JSON.stringify(records, null, 2));
}

export async function saveCustomerWorkspace(customerId: number, payload: WorkspacePayload) {
  const pdf = decodeBase64(payload.pdfBase64, MAX_PDF_BYTES, "PDF");
  const csv = decodeBase64(payload.csvBase64, MAX_CSV_BYTES, "CSV");
  const pdfName = (payload.pdfName || "template.pdf").slice(0, 180);
  const csvName = (payload.csvName || "data.csv").slice(0, 180);

  const dir = customerDir(customerId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "template.pdf"), pdf);
  await writeFile(path.join(dir, "data.csv"), csv);

  const meta: WorkspaceMeta = {
    pdfName,
    csvName,
    mapping: payload.mapping || {},
    filenameColumn: payload.filenameColumn || "",
    flatten: Boolean(payload.flatten),
    fieldPlacements: payload.fieldPlacements,
    removedFieldNames: payload.removedFieldNames,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));
  return meta;
}

export async function loadCustomerWorkspace(customerId: number) {
  const dir = customerDir(customerId);
  try {
    const metaRaw = await readFile(path.join(dir, "meta.json"), "utf8");
    const meta = JSON.parse(metaRaw) as WorkspaceMeta;
    const pdf = await readFile(path.join(dir, "template.pdf"));
    const csv = await readFile(path.join(dir, "data.csv"));
    return {
      ...meta,
      pdfBase64: pdf.toString("base64"),
      csvBase64: csv.toString("base64"),
    };
  } catch {
    return null;
  }
}

export async function listCustomerBatches(customerId: number) {
  return readBatchIndex(customerId);
}

export async function saveCustomerBatch(
  customerId: number,
  input: { filename: string; pdfCount: number; kind: "preview" | "complete"; bytes: Buffer },
) {
  if (input.bytes.byteLength > MAX_ZIP_BYTES) {
    throw new Error("Generated ZIP is too large to store on your account.");
  }
  const dir = batchesDir(customerId);
  await mkdir(dir, { recursive: true });
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const filename = sanitizeStoredName(input.filename, "pdf-batch.zip");
  await writeFile(path.join(dir, `${id}.zip`), input.bytes);

  let records = await readBatchIndex(customerId);
  const next: BatchRecord = {
    id,
    filename,
    pdfCount: Math.max(0, Math.min(1000, input.pdfCount)),
    kind: input.kind,
    createdAt: new Date().toISOString(),
    bytes: input.bytes.byteLength,
  };
  records = [next, ...records.filter((row) => row.id !== id)];

  while (records.length > MAX_BATCHES) {
    const dropped = records.pop();
    if (!dropped) break;
    try {
      await rm(path.join(dir, `${dropped.id}.zip`), { force: true });
    } catch {
      /* ignore */
    }
  }

  await writeBatchIndex(customerId, records);
  return next;
}

export async function readCustomerBatch(customerId: number, batchId: string) {
  const safeId = batchId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) return null;
  const records = await readBatchIndex(customerId);
  const meta = records.find((row) => row.id === safeId);
  if (!meta) return null;
  try {
    const bytes = await readFile(path.join(batchesDir(customerId), `${safeId}.zip`));
    return { meta, bytes };
  } catch {
    return null;
  }
}

export async function deleteCustomerWorkspace(customerId: number) {
  try {
    await rm(customerDir(customerId), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export async function workspaceSummary(customerId: number) {
  const workspace = await loadCustomerWorkspace(customerId);
  const batches = await listCustomerBatches(customerId);
  return {
    hasWorkspace: Boolean(workspace),
    pdfName: workspace?.pdfName || null,
    csvName: workspace?.csvName || null,
    updatedAt: workspace?.updatedAt || null,
    batches,
  };
}

/** Best-effort cleanup helper for tests and retention. */
export async function listWorkspaceCustomerIds() {
  try {
    return await readdir(workspaceRootDir());
  } catch {
    return [];
  }
}
