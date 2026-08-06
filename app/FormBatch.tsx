"use client";

import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import Papa from "papaparse";
import {
  ArrowRight,
  Award,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Download,
  FileArchive,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  GitMerge,
  Lock,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  Square,
  CheckSquare2,
  Sparkles,
  Upload,
  UserRound,
  FolderOpen,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { ChangeEvent, DragEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import unicodeFontDataUrl from "./assets/NotoSans-Regular.ttf?inline";
import { decodeCsvBytes } from "./csv";
import { createDemoFiles } from "./demo-files";
import { PlacementPreview } from "./PlacementPreview";
import { findOpenPlacement, resolveFieldOverlaps } from "./placement-geometry";
import {
  applyStaticPdfFields,
  CHECKBOX_ALWAYS,
  detectStaticPdfFields,
  isCheckboxChecked,
  PLACEMENT_FONT_OPTIONS,
  pdfLibVisualPageSize,
  withSavedPlacements,
  type DetectedStaticField,
  type PlacementFontFamily,
  type StaticPlacement,
} from "./static-pdf";
import { reconcileFieldMapping } from "./mapping";

type Row = Record<string, string>;

type PdfField = {
  name: string;
  type: "text" | "checkbox" | "dropdown" | "radio" | "list" | "unsupported";
  placement?: StaticPlacement;
};

type StoredWorkspace = {
  pdfBytes: ArrayBuffer;
  pdfName: string;
  csvBytes?: ArrayBuffer;
  csvText?: string;
  csvName: string;
  mapping: Record<string, string>;
  filenameColumn: string;
  flatten: boolean;
  /** User-nudged printed-form boxes keyed by field name (PDF points). */
  fieldPlacements?: Record<string, StaticPlacement>;
  /** Writing areas the user removed in the previewer. */
  removedFieldNames?: string[];
};

function fieldPlacementsFromFields(fields: PdfField[]): Record<string, StaticPlacement> | undefined {
  const entries = fields
    .filter((field): field is PdfField & { placement: StaticPlacement } => Boolean(field.placement))
    .map((field) => [field.name, field.placement] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

const DEFAULT_PRICE_USD = 19;
const DEFAULT_FREE_ROWS = 3;
const DEFAULT_DURATION_DAYS = 30;
const MAX_ROWS = 250;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const DB_NAME = "formbatch-workspace";
const STORE_NAME = "workspace";
const WORKSPACE_KEY = "latest";
const ACCESS_KEY = "formbatch-access";
const DEVICE_KEY = "formbatch-device";
const HERO_DEMO_ROWS = [
  { name: "Amara Okafor", course: "Advanced Data Privacy", id: "PB-10041" },
  { name: "Julian Meyer", course: "Advanced Data Privacy", id: "PB-10042" },
  { name: "Priya Nair", course: "Advanced Data Privacy", id: "PB-10043" },
  { name: "Tobias Andersen", course: "Advanced Data Privacy", id: "PB-10044" },
] as const;
let unicodeFontPromise: Promise<ArrayBuffer> | null = null;

type LivePricing = {
  amountCents: number;
  currency: string;
  durationDays: number;
  freeGenerationLimit: number;
  displayPrice: string;
};

function loadUnicodeFont() {
  if (!unicodeFontPromise) {
    unicodeFontPromise = Promise.resolve().then(() => {
      const encoded = unicodeFontDataUrl.slice(unicodeFontDataUrl.indexOf(",") + 1);
      const decoded = atob(encoded);
      const bytes = new Uint8Array(decoded.length);
      for (let index = 0; index < decoded.length; index += 1) {
        bytes[index] = decoded.charCodeAt(index);
      }
      return bytes.buffer;
    });
  }
  return unicodeFontPromise;
}

function sanitizeFilename(value: string, fallback: string) {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function fieldType(field: unknown): PdfField["type"] {
  if (field instanceof PDFTextField) return "text";
  if (field instanceof PDFCheckBox) return "checkbox";
  if (field instanceof PDFDropdown) return "dropdown";
  if (field instanceof PDFRadioGroup) return "radio";
  if (field instanceof PDFOptionList) return "list";
  return "unsupported";
}

function readStoredAccess(): { expiresAt: number; sessionId?: string } | null {
  const stored = localStorage.getItem(ACCESS_KEY);
  if (!stored) return null;
  try {
    const access = JSON.parse(stored) as { expiresAt?: number; sessionId?: string };
    if (typeof access.expiresAt !== "number") {
      localStorage.removeItem(ACCESS_KEY);
      return null;
    }
    if (access.expiresAt <= Date.now()) {
      localStorage.removeItem(ACCESS_KEY);
      return null;
    }
    return { expiresAt: access.expiresAt, sessionId: access.sessionId };
  } catch {
    localStorage.removeItem(ACCESS_KEY);
    return null;
  }
}

function openWorkspaceDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveWorkspace(workspace: StoredWorkspace) {
  const db = await openWorkspaceDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(workspace, WORKSPACE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function loadWorkspace() {
  const db = await openWorkspaceDb();
  const value = await new Promise<StoredWorkspace | undefined>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(WORKSPACE_KEY);
    request.onsuccess = () => resolve(request.result as StoredWorkspace | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(value: string) {
  const cleaned = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

type CloudBatch = {
  id: string;
  filename: string;
  pdfCount: number;
  kind: "preview" | "complete";
  createdAt: string;
  bytes: number;
};

type CloudWorkspaceSummary = {
  hasWorkspace: boolean;
  pdfName: string | null;
  csvName: string | null;
  updatedAt: string | null;
  batches: CloudBatch[];
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, created);
  return created;
}

/** Generation metadata only — never PDF/CSV contents. Soft-fails so observability never blocks downloads. */
function reportGenerationEvent(payload: {
  eventType: "free_preview" | "paid_batch" | "failed_generation";
  rowsProcessed: number;
  pdfsGenerated: number;
  templateFilename?: string;
  csvFilename?: string;
  zipFilename?: string;
  success?: boolean;
  errorCode?: string;
}) {
  void fetch("/api/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: getDeviceId(), ...payload }),
  }).catch(() => {
    /* ignore */
  });
}

function setPdfValue(
  field: ReturnType<ReturnType<PDFDocument["getForm"]>["getField"]>,
  value: string,
) {
  if (field instanceof PDFTextField) {
    field.setText(value);
    return;
  }
  if (field instanceof PDFCheckBox) {
    const checked = /^(1|true|yes|y|checked|x|oui)$/i.test(value.trim());
    if (checked) field.check();
    else field.uncheck();
    return;
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const options = field.getOptions();
    if (options.includes(value)) field.select(value);
    return;
  }
  if (field instanceof PDFRadioGroup) {
    const options = field.getOptions();
    if (options.includes(value)) field.select(value);
  }
}

export function FormBatch({ initialPricing }: { initialPricing?: LivePricing }) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [fields, setFields] = useState<PdfField[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [filenameColumn, setFilenameColumn] = useState("");
  const [flatten, setFlatten] = useState(true);
  const [busy, setBusy] = useState<"reading" | "generating" | "checkout" | "verifying" | "account" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hasAccess, setHasAccess] = useState(false);
  const [accessExpiresAt, setAccessExpiresAt] = useState<number | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountPanel, setAccountPanel] = useState<"register" | "login" | null>(null);
  const [pendingCheckoutSession, setPendingCheckoutSession] = useState<string | null>(null);
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [receiptSession, setReceiptSession] = useState("");
  const [savedBatches, setSavedBatches] = useState<CloudBatch[]>([]);
  const [cloudSummary, setCloudSummary] = useState<Omit<CloudWorkspaceSummary, "batches"> | null>(null);
  const [cloudBusy, setCloudBusy] = useState<"loading" | "saving" | "batch" | null>(null);
  /** True only when a paid session cookie is present — gates My files / autosave / ZIP upload claims. */
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  const [heroDemoIndex, setHeroDemoIndex] = useState(0);
  const [navScrolled, setNavScrolled] = useState(false);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [removedFieldNames, setRemovedFieldNames] = useState<string[]>([]);
  /** True when the PDF has no AcroForm fields — show canvas preview and allow manual Add field. */
  const [placementMode, setPlacementMode] = useState(false);
  const [livePricing, setLivePricing] = useState<LivePricing>(
    initialPricing || {
      amountCents: DEFAULT_PRICE_USD * 100,
      currency: "usd",
      durationDays: DEFAULT_DURATION_DAYS,
      freeGenerationLimit: DEFAULT_FREE_ROWS,
      displayPrice: `$${DEFAULT_PRICE_USD}`,
    },
  );
  /** Applied once after PDF re-detect following Stripe workspace restore. */
  const pendingPlacementsRef = useRef<Record<string, StaticPlacement> | null>(null);
  const pendingRemovedRef = useRef<string[] | null>(null);
  const skipCloudAutosaveRef = useRef(false);
  const cloudAutosaveTimerRef = useRef<number | null>(null);

  const freeRows = Math.max(1, livePricing.freeGenerationLimit || DEFAULT_FREE_ROWS);
  const durationDays = livePricing.durationDays || DEFAULT_DURATION_DAYS;
  const displayPrice = livePricing.displayPrice || `$${DEFAULT_PRICE_USD}`;

  const supportedFields = useMemo(
    () => fields.filter((field) => field.type !== "unsupported"),
    [fields],
  );
  const mappedCount = useMemo(
    () => supportedFields.filter((field) => mapping[field.name]).length,
    [mapping, supportedFields],
  );
  const isReady = Boolean(pdfFile && csvFile && supportedFields.length && rows.length && mappedCount);
  const hasPrintedFields = supportedFields.some((field) => field.placement);
  const showPrintedPreview = Boolean(pdfFile) && (placementMode || hasPrintedFields || removedFieldNames.length > 0);
  const previewSamples = useMemo(() => {
    const row = rows[0] || {};
    return Object.fromEntries(
      supportedFields.map((field) => {
        const rule = mapping[field.name];
        if (!rule || rule === CHECKBOX_ALWAYS) return [field.name, field.name];
        return [field.name, row[rule] || field.name];
      }),
    );
  }, [mapping, rows, supportedFields]);

  const movePrintedField = (name: string, placement: StaticPlacement) => {
    setFields((current) =>
      current.map((field) => (field.name === name ? { ...field, placement } : field)),
    );
  };

  const mapPrintedField = (name: string, value: string) => {
    setMapping((current) => ({ ...current, [name]: value }));
  };

  const stylePrintedField = (
    name: string,
    style: {
      fontFamily?: PlacementFontFamily;
      fontSize?: number | "";
      bold?: boolean;
      align?: "left" | "center" | "right";
    },
  ) => {
    setFields((current) =>
      current.map((field) => {
        if (field.name !== name || !field.placement) return field;
        const placement = { ...field.placement };
        if (style.fontFamily) {
          const allowed = PLACEMENT_FONT_OPTIONS.some((option) => option.value === style.fontFamily);
          if (allowed) placement.fontFamily = style.fontFamily;
        }
        if (style.fontSize === "") delete placement.fontSize;
        else if (typeof style.fontSize === "number" && Number.isFinite(style.fontSize)) {
          placement.fontSize = style.fontSize;
        }
        if (typeof style.bold === "boolean") {
          if (style.bold) placement.bold = true;
          else delete placement.bold;
        }
        if (style.align === "left" || style.align === "center" || style.align === "right") {
          if (style.align === "left") delete placement.align;
          else placement.align = style.align;
        }
        return { ...field, placement };
      }),
    );
  };

  const renamePrintedField = (oldName: string, nextName: string) => {
    const cleaned = nextName.trim().slice(0, 80);
    if (!cleaned || cleaned === oldName) return;
    if (fields.some((field) => field.name === cleaned)) {
      setError(`A field named “${cleaned}” already exists.`);
      return;
    }
    setFields((current) =>
      current.map((field) => (field.name === oldName ? { ...field, name: cleaned } : field)),
    );
    setMapping((current) => {
      const next = { ...current };
      next[cleaned] = current[oldName] || "";
      delete next[oldName];
      return next;
    });
    setSelectedField(cleaned);
    setRemovedFieldNames((current) => current.filter((entry) => entry !== cleaned));
  };

  const removePrintedField = (name: string) => {
    setRemovedFieldNames((current) => (current.includes(name) ? current : [...current, name]));
    setFields((current) => current.filter((field) => field.name !== name));
    setMapping((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setSelectedField((current) => (current === name ? null : current));
  };

  const addPrintedField = (
    pageIndex: number,
    size: { width: number; height: number },
    at?: { x: number; y: number },
  ) => {
    const used = new Set(fields.map((field) => field.name));
    let index = 1;
    let name = `Field ${index}`;
    while (used.has(name)) {
      index += 1;
      name = `Field ${index}`;
    }
    const width = Math.min(220, Math.max(120, size.width * 0.38));
    const height = 28;
    const preferred = at
      ? {
          x: Math.max(8, at.x - width / 2),
          y: Math.max(8, at.y - height / 2),
          width,
          height,
          fontFamily: "helvetica" as const,
          fontSize: 12,
        }
      : { width, height, fontFamily: "helvetica" as const, fontSize: 12 };
    const placement = findOpenPlacement(
      pageIndex,
      size,
      fields
        .filter((field): field is PdfField & { placement: StaticPlacement } => Boolean(field.placement))
        .map((field) => field.placement),
      preferred,
    );
    setFields((current) => [
      ...current,
      {
        name,
        type: "text",
        placement: {
          ...placement,
          fontFamily: "helvetica",
          fontSize: 12,
        },
      },
    ]);
    setMapping((current) => ({ ...current, [name]: "" }));
    setSelectedField(name);
    setRemovedFieldNames((current) => current.filter((entry) => entry !== name));
  };

  const duplicatePrintedField = (name: string, pageSize: { width: number; height: number }) => {
    const source = fields.find((field) => field.name === name);
    if (!source?.placement) return;
    const sourcePlacement = source.placement;
    const used = new Set(fields.map((field) => field.name));
    let index = 1;
    let nextName = `${source.name} copy`;
    while (used.has(nextName)) {
      index += 1;
      nextName = `${source.name} copy ${index}`;
    }
    const placement = findOpenPlacement(
      sourcePlacement.pageIndex,
      pageSize,
      fields
        .filter((field): field is PdfField & { placement: StaticPlacement } => Boolean(field.placement))
        .map((field) => field.placement),
      {
        ...sourcePlacement,
        x: sourcePlacement.x + 16,
        y: Math.max(8, sourcePlacement.y - 16),
        width: sourcePlacement.width,
        height: sourcePlacement.height,
      },
    );
    setFields((current) => [
      ...current,
      {
        name: nextName,
        type: source.type,
        placement: {
          ...sourcePlacement,
          ...placement,
          fontFamily: sourcePlacement.fontFamily,
          fontSize: sourcePlacement.fontSize,
          bold: sourcePlacement.bold,
          align: sourcePlacement.align,
        },
      },
    ]);
    setMapping((current) => ({ ...current, [nextName]: current[name] || "" }));
    setSelectedField(nextName);
  };

  const grantLocalAccess = (expiresAt: number, sessionId?: string) => {
    localStorage.setItem(
      ACCESS_KEY,
      JSON.stringify({ sessionId, expiresAt }),
    );
    setHasAccess(true);
    setAccessExpiresAt(expiresAt);
  };

  const accessUntilLabel = accessExpiresAt
    ? new Date(accessExpiresAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const restoreWorkspaceAfterPayment = async () => {
    const saved = await loadWorkspace();
    if (!saved) return;
    pendingPlacementsRef.current = saved.fieldPlacements || null;
    pendingRemovedRef.current = saved.removedFieldNames || null;
    setRemovedFieldNames(saved.removedFieldNames || []);
    setPdfFile(new File([saved.pdfBytes], saved.pdfName, { type: "application/pdf" }));
    setCsvFile(new File([saved.csvBytes || saved.csvText || ""], saved.csvName, { type: "text/csv" }));
    setMapping(saved.mapping);
    setFilenameColumn(saved.filenameColumn);
    setFlatten(saved.flatten);
  };

  const applyCloudWorkspace = (workspace: {
    pdfName: string;
    csvName: string;
    pdfBase64: string;
    csvBase64: string;
    mapping: Record<string, string>;
    filenameColumn: string;
    flatten: boolean;
    fieldPlacements?: Record<string, StaticPlacement>;
    removedFieldNames?: string[];
  }) => {
    skipCloudAutosaveRef.current = true;
    pendingPlacementsRef.current = (workspace.fieldPlacements as Record<string, StaticPlacement> | undefined) || null;
    pendingRemovedRef.current = workspace.removedFieldNames || null;
    setRemovedFieldNames(workspace.removedFieldNames || []);
    setPdfFile(new File([base64ToArrayBuffer(workspace.pdfBase64)], workspace.pdfName, { type: "application/pdf" }));
    setCsvFile(new File([base64ToArrayBuffer(workspace.csvBase64)], workspace.csvName, { type: "text/csv" }));
    setMapping(workspace.mapping || {});
    setFilenameColumn(workspace.filenameColumn || "");
    setFlatten(Boolean(workspace.flatten));
    window.setTimeout(() => {
      skipCloudAutosaveRef.current = false;
    }, 2500);
  };

  const refreshCloudSummary = async () => {
    try {
      const response = await fetch("/api/account/workspace?summary=1", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 402) {
          setCloudSummary(null);
          setSavedBatches([]);
          setCloudSyncReady(false);
        }
        return null;
      }
      const result = (await response.json()) as CloudWorkspaceSummary & { ok?: boolean };
      setCloudSummary({
        hasWorkspace: Boolean(result.hasWorkspace),
        pdfName: result.pdfName || null,
        csvName: result.csvName || null,
        updatedAt: result.updatedAt || null,
      });
      setSavedBatches(Array.isArray(result.batches) ? result.batches : []);
      setCloudSyncReady(true);
      return result;
    } catch {
      return null;
    }
  };

  const loadCloudWorkspace = async (opts?: { quiet?: boolean }) => {
    setCloudBusy("loading");
    try {
      const response = await fetch("/api/account/workspace", {
        cache: "no-store",
        credentials: "include",
      });
      if (response.status === 404) {
        await refreshCloudSummary();
        if (!opts?.quiet) setNotice("No saved PDF/CSV on this account yet. Upload files and they will sync automatically.");
        return false;
      }
      const result = (await response.json()) as {
        ok?: boolean;
        workspace?: Parameters<typeof applyCloudWorkspace>[0];
        error?: string;
      };
      if (!response.ok || !result.workspace) {
        throw new Error(result.error || "Saved files could not be loaded.");
      }
      applyCloudWorkspace(result.workspace);
      await refreshCloudSummary();
      if (!opts?.quiet) {
        setNotice(
          `Restored ${result.workspace.pdfName} and ${result.workspace.csvName} from your account. Generated ZIPs stay available under My files.`,
        );
      }
      return true;
    } catch (cloudError) {
      if (!opts?.quiet) {
        setError(cloudError instanceof Error ? cloudError.message : "Saved files could not be loaded.");
      }
      return false;
    } finally {
      setCloudBusy(null);
    }
  };

  const pushCloudWorkspace = async (opts?: { force?: boolean }) => {
    if ((!hasAccess && !opts?.force) || !pdfFile || !csvFile) return false;
    if (skipCloudAutosaveRef.current) return false;
    try {
      const response = await fetch("/api/account/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pdfName: pdfFile.name,
          csvName: csvFile.name,
          pdfBase64: arrayBufferToBase64(await pdfFile.arrayBuffer()),
          csvBase64: arrayBufferToBase64(await csvFile.arrayBuffer()),
          mapping,
          filenameColumn,
          flatten,
          fieldPlacements: fieldPlacementsFromFields(fields),
          removedFieldNames,
        }),
      });
      if (!response.ok) return false;
      const result = (await response.json()) as { updatedAt?: string };
      setCloudSummary({
        hasWorkspace: true,
        pdfName: pdfFile.name,
        csvName: csvFile.name,
        updatedAt: result.updatedAt || new Date().toISOString(),
      });
      return true;
    } catch {
      return false;
    }
  };

  const downloadCloudBatch = async (batch: CloudBatch) => {
    setCloudBusy("loading");
    setError("");
    try {
      const response = await fetch(`/api/account/batches/${encodeURIComponent(batch.id)}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error || "Batch could not be downloaded.");
      }
      downloadBlob(await response.blob(), batch.filename);
      setNotice(`Re-downloaded ${batch.filename}.`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Batch download failed.");
    } finally {
      setCloudBusy(null);
    }
  };

  const afterPaidSession = async (opts?: { preferCloudFiles?: boolean }) => {
    const summary = await refreshCloudSummary();
    if (!summary) {
      setCloudSyncReady(false);
      return;
    }
    setCloudSyncReady(true);
    if (!opts?.preferCloudFiles) return;
    // Explicit restore/sign-in prefers account files over whatever is on this browser.
    if (summary.hasWorkspace) {
      await loadCloudWorkspace({ quiet: true });
      setNotice(
        `Signed in. Restored your saved files${
          summary.batches?.length ? ` and ${summary.batches.length} generated batch${summary.batches.length === 1 ? "" : "es"}` : ""
        }.`,
      );
    } else if (summary.batches?.length) {
      setNotice(
        `Signed in. ${summary.batches.length} previously generated ZIP${summary.batches.length === 1 ? "" : "s"} available under My files.`,
      );
    }
  };

  useEffect(() => {
    if (!cloudSyncReady || !pdfFile || !csvFile) return;
    if (skipCloudAutosaveRef.current) return;
    if (cloudAutosaveTimerRef.current) window.clearTimeout(cloudAutosaveTimerRef.current);
    cloudAutosaveTimerRef.current = window.setTimeout(() => {
      void pushCloudWorkspace({ force: true });
    }, 1800);
    return () => {
      if (cloudAutosaveTimerRef.current) window.clearTimeout(cloudAutosaveTimerRef.current);
    };
    // Intentionally sync when paid workspace inputs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudSyncReady, pdfFile, csvFile, mapping, filenameColumn, flatten, fields, removedFieldNames, supportedFields.length]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroDemoIndex((current) => (current + 1) % HERO_DEMO_ROWS.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const loadLivePricing = async () => {
      try {
        const response = await fetch("/api/pricing", { cache: "no-store" });
        if (!response.ok) return;
        const plan = (await response.json()) as Partial<LivePricing> & { amountCents?: number };
        if (typeof plan.amountCents !== "number" || plan.amountCents <= 0) return;
        setLivePricing({
          amountCents: plan.amountCents,
          currency: plan.currency || "usd",
          durationDays: plan.durationDays || DEFAULT_DURATION_DAYS,
          freeGenerationLimit: plan.freeGenerationLimit || DEFAULT_FREE_ROWS,
          displayPrice:
            plan.displayPrice ||
            `$${Math.round(plan.amountCents / 100)}`,
        });
      } catch {
        /* keep defaults when pricing API is unavailable */
      }
    };
    void loadLivePricing();

    const restoreAccess = async () => {
      setHasAccess(Boolean(readStoredAccess()));
      const returningFromCheckout = Boolean(new URLSearchParams(window.location.search).get("session_id"));
      try {
        const response = await fetch("/api/account/me", { cache: "no-store", credentials: "include" });
        if (!response.ok) {
          setCloudSyncReady(false);
          return;
        }
        const me = (await response.json()) as {
          authenticated?: boolean;
          hasAccess?: boolean;
          email?: string;
          expiresAt?: number;
        };
        if (me.email) setAccountEmail(me.email);
        if (me.authenticated && me.hasAccess && typeof me.expiresAt === "number" && me.expiresAt > Date.now()) {
          grantLocalAccess(me.expiresAt);
          setAccountEmail(me.email || null);
          setCloudSyncReady(true);
          if (!returningFromCheckout) {
            const summary = await refreshCloudSummary();
            if (summary?.hasWorkspace) {
              await loadCloudWorkspace({ quiet: true });
            }
          } else {
            void refreshCloudSummary();
          }
        } else if (me.authenticated && me.email) {
          setAccountEmail(me.email);
          setCloudSyncReady(false);
        } else {
          setCloudSyncReady(false);
        }
      } catch {
        setCloudSyncReady(false);
      }
    };
    void restoreAccess();

    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) return;

    const verify = async () => {
      setBusy("verifying");
      try {
        const deviceId = getDeviceId();
        const response = await fetch(
          `/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}&device_id=${encodeURIComponent(deviceId)}`,
        );
        const result = (await response.json()) as {
          paid?: boolean;
          expiresAt?: number;
          email?: string | null;
          needsAccount?: boolean;
          error?: string;
        };
        if (
          !response.ok ||
          !result.paid ||
          typeof result.expiresAt !== "number" ||
          result.expiresAt <= Date.now()
        ) {
          throw new Error(result.error || "Payment could not be verified.");
        }
        await restoreWorkspaceAfterPayment();
        if (result.email) setAccountEmail(result.email);
        setPendingCheckoutSession(sessionId);
        if (result.needsAccount && result.email) {
          // Do not unlock until the access account password is created (cross-device requirement).
          setHasAccess(false);
          setCloudSyncReady(false);
          setAccountPanel("register");
          setNotice("Payment confirmed. Create a password to unlock full batches on this and any other device.");
        } else {
          grantLocalAccess(result.expiresAt, sessionId);
          // Cookie is set by verify when the account already has a password.
          void afterPaidSession({ preferCloudFiles: false });
          setNotice("Payment confirmed. Your account unlocks unlimited batches for the paid period.");
        }
        window.history.replaceState({}, "", window.location.pathname);
      } catch (verificationError) {
        setError(verificationError instanceof Error ? verificationError.message : "Payment verification failed.");
      } finally {
        setBusy(null);
      }
    };

    void verify();
    // Mount-only: restore session, optional Stripe return, and cloud workspace once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitRegister = async () => {
    if (!pendingCheckoutSession) {
      setError("Return from Stripe checkout before creating your account.");
      return;
    }
    if (accountPassword !== accountPasswordConfirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy("account");
    setError("");
    try {
      const response = await fetch("/api/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId: pendingCheckoutSession,
          deviceId: getDeviceId(),
          password: accountPassword,
        }),
      });
      const result = (await response.json()) as { ok?: boolean; email?: string; expiresAt?: number; error?: string };
      if (!response.ok || !result.ok || typeof result.expiresAt !== "number") {
        throw new Error(result.error || "Account could not be created.");
      }
      grantLocalAccess(result.expiresAt, pendingCheckoutSession);
      setAccountEmail(result.email || accountEmail);
      setAccountPanel(null);
      setAccountPassword("");
      setAccountPasswordConfirm("");
      setPendingCheckoutSession(null);
      setNotice(`Account ready for ${result.email}. Your files and generated ZIPs sync to this account for the paid period.`);
      void afterPaidSession({ preferCloudFiles: true });
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : "Account setup failed.");
    } finally {
      setBusy(null);
    }
  };

  const submitLogin = async () => {
    setBusy("account");
    setError("");
    try {
      const response = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: loginEmail,
          password: accountPassword,
          deviceId: getDeviceId(),
        }),
      });
      const result = (await response.json()) as { ok?: boolean; email?: string; expiresAt?: number; error?: string };
      if (!response.ok || !result.ok || typeof result.expiresAt !== "number") {
        throw new Error(result.error || "Sign-in failed.");
      }
      grantLocalAccess(result.expiresAt);
      setAccountEmail(result.email || loginEmail);
      setAccountPanel(null);
      setAccountPassword("");
      setLoginEmail("");
      setReceiptSession("");
      setNotice(
        `Purchase restored for ${result.email} until ${new Date(result.expiresAt).toLocaleDateString()}.`,
      );
      void afterPaidSession({ preferCloudFiles: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign-in failed.");
    } finally {
      setBusy(null);
    }
  };

  const submitReceiptRestore = async () => {
    setBusy("account");
    setError("");
    try {
      const response = await fetch("/api/account/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId: receiptSession,
          deviceId: getDeviceId(),
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        email?: string;
        expiresAt?: number;
        needsPassword?: boolean;
        error?: string;
      };
      if (!response.ok || !result.ok || typeof result.expiresAt !== "number") {
        throw new Error(result.error || "Purchase could not be restored.");
      }
      const sessionMatch = receiptSession.match(/cs_[A-Za-z0-9_]+/);
      const sessionId = sessionMatch?.[0] || undefined;
      grantLocalAccess(result.expiresAt, sessionId);
      setAccountEmail(result.email || null);
      setReceiptSession("");
      if (result.needsPassword) {
        setPendingCheckoutSession(sessionId || null);
        setAccountPanel("register");
        setNotice("Purchase found. Set a password so you can sign in on any device for the rest of your paid period.");
      } else {
        setAccountPanel(null);
        setNotice(
          `Purchase restored for ${result.email} until ${new Date(result.expiresAt).toLocaleDateString()}.`,
        );
        void afterPaidSession({ preferCloudFiles: true });
      }
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Purchase restore failed.");
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    try {
      await fetch("/api/account/logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    localStorage.removeItem(ACCESS_KEY);
    setHasAccess(false);
    setAccessExpiresAt(null);
    setAccountEmail(null);
    setCloudSyncReady(false);
    setCloudSummary(null);
    setSavedBatches([]);
    setNotice("Signed out on this browser. Your purchase and saved files remain on your account — sign in again anytime during the paid period.");
  };

  useEffect(() => {
    if (!pdfFile) return;
    const readPdf = async () => {
      setBusy("reading");
      setError("");
      try {
        const bytes = await pdfFile.arrayBuffer();
        const document = await PDFDocument.load(bytes);
        const nextFields = document.getForm().getFields().map((field) => ({
          name: field.getName(),
          type: fieldType(field),
        }));
        if (!nextFields.length) {
          const staticFields = await detectStaticPdfFields(bytes);
          const restored = pendingPlacementsRef.current;
          const removed = pendingRemovedRef.current;
          pendingPlacementsRef.current = null;
          pendingRemovedRef.current = null;
          const merged = withSavedPlacements(staticFields, restored, removed);
          const separated: DetectedStaticField[] = [];
          for (let pageIndex = 0; pageIndex < document.getPageCount(); pageIndex += 1) {
            // Use viewer size (pdf.js /Rotate applied), matching PlacementPreview coords.
            const size = pdfLibVisualPageSize(document.getPage(pageIndex));
            const onPage = merged.filter((field) => field.placement.pageIndex === pageIndex);
            separated.push(
              ...resolveFieldOverlaps(onPage, { width: size.width, height: size.height }),
            );
          }
          if (removed) setRemovedFieldNames(removed);
          setPlacementMode(true);
          setFields(separated);
          setNotice(
            restored || removed?.length
              ? `Printed form restored. ${separated.length} writing area${separated.length === 1 ? "" : "s"} ready${
                  removed?.length ? ` (${removed.length} removed earlier)` : ""
                }.`
              : separated.length
                ? `Printed form detected. ${separated.length} writing areas found (dotted lines, underscores, and ruled lines). Match them on the preview — names auto-map when labels are similar.`
                : "No fields detected automatically. The PDF is ready — click Add field, then click the PDF where text should appear.",
          );
        } else {
          pendingPlacementsRef.current = null;
          pendingRemovedRef.current = null;
          setRemovedFieldNames([]);
          setPlacementMode(false);
          setFields(nextFields);
        }
      } catch (pdfError) {
        setFields([]);
        setPlacementMode(false);
        setError(
          `The PDF could not be read${
            pdfError instanceof Error && pdfError.message
              ? `: ${pdfError.message}`
              : ". Make sure it is a valid, unencrypted PDF."
          }`,
        );
      } finally {
        setBusy(null);
      }
    };
    void readPdf();
  }, [pdfFile]);

  useEffect(() => {
    if (!csvFile) return;
    const readCsv = async () => {
      setError("");
      try {
        const { text } = decodeCsvBytes(await csvFile.arrayBuffer());
        const parsed = Papa.parse<Row>(text, {
          header: true,
          skipEmptyLines: "greedy",
          transformHeader: (header) => header.trim(),
        });
        const fatalError = parsed.errors.find((parseError) => parseError.type === "Quotes");
        if (fatalError) throw new Error(fatalError.message);
        const nextHeaders = parsed.meta.fields?.filter(Boolean) || [];
        const parsedRows = parsed.data
          .map((row) =>
            Object.fromEntries(nextHeaders.map((header) => [header, String(row[header] ?? "").trim()])),
          );
        const nextRows = parsedRows.slice(0, MAX_ROWS);
        if (!nextHeaders.length || !nextRows.length) {
          throw new Error("The CSV needs a header row and at least one data row.");
        }
        setHeaders(nextHeaders);
        setRows(nextRows);
        setPreviewIndex(0);
        setFilenameColumn((current) => (nextHeaders.includes(current) ? current : nextHeaders[0]));
        if (parsedRows.length > MAX_ROWS) {
          setNotice(`This CSV has ${parsedRows.length} rows. The first ${MAX_ROWS} are ready; split the remainder into another batch.`);
        }
      } catch (csvError) {
        setHeaders([]);
        setRows([]);
        setPreviewIndex(0);
        setError(
          csvError instanceof Error && csvError.message.includes("header row")
            ? csvError.message
            : "The CSV could not be read. Check that its rows and quoted values are valid.",
        );
      }
    };
    void readCsv();
  }, [csvFile]);

  useEffect(() => {
    if (!supportedFields.length || !headers.length) return;
    const reconcileMapping = async () => {
      setMapping((current) => reconcileFieldMapping(supportedFields, headers, current));
    };
    void reconcileMapping();
  }, [headers, supportedFields]);

  const acceptPdf = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose a PDF file.");
      return;
    }
    if (!file.size) {
      setError("The PDF is empty.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError("The PDF is larger than 25 MB. Choose a smaller template.");
      return;
    }
    pendingPlacementsRef.current = null;
    pendingRemovedRef.current = null;
    setRemovedFieldNames([]);
    setPlacementMode(false);
    setPdfFile(file);
    setError("");
    setNotice("");
  };

  const acceptCsv = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a CSV file.");
      return;
    }
    if (!file.size) {
      setError("The CSV is empty.");
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      setError("The CSV is larger than 5 MB. Choose a smaller spreadsheet.");
      return;
    }
    setCsvFile(file);
    setError("");
    setNotice("");
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>, kind: "pdf" | "csv") => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (kind === "pdf") acceptPdf(file);
    else acceptCsv(file);
  };

  const loadDemo = async () => {
    setBusy("reading");
    setError("");
    try {
      const demo = await createDemoFiles();
      pendingPlacementsRef.current = null;
      pendingRemovedRef.current = null;
      setRemovedFieldNames([]);
      setPdfFile(demo.pdf);
      setCsvFile(demo.csv);
      setNotice("Sample loaded. The first three generated PDFs are free to download.");
    } catch (demoError) {
      setError(demoError instanceof Error ? demoError.message : "The sample could not be loaded.");
    } finally {
      setBusy(null);
    }
  };

  const generate = async (fullBatch: boolean) => {
    if (!pdfFile || !isReady) return;
    if (fullBatch) {
      if (accountPanel === "register") {
        setError("Create your access password before generating the full batch.");
        return;
      }
      let access = readStoredAccess();
      try {
        const response = await fetch("/api/account/me", { cache: "no-store", credentials: "include" });
        if (response.ok) {
          const me = (await response.json()) as {
            authenticated?: boolean;
            hasAccess?: boolean;
            expiresAt?: number;
            email?: string;
          };
          if (me.authenticated) {
            if (!me.hasAccess || typeof me.expiresAt !== "number" || me.expiresAt <= Date.now()) {
              localStorage.removeItem(ACCESS_KEY);
              setHasAccess(false);
              setError("Paid access is no longer active on this account. Sign in again or renew.");
              return;
            }
            grantLocalAccess(me.expiresAt);
            if (me.email) setAccountEmail(me.email);
            access = { expiresAt: me.expiresAt };
          }
        }
      } catch {
        /* If account status cannot be reached, fall back to local unlock window. */
      }
      if (!access) {
        setHasAccess(false);
        setError("Unlock the full batch before generating more than three documents.");
        return;
      }
      setHasAccess(true);
    }

    setBusy("generating");
    setError("");
    setNotice("");
    try {
      const sourceBytes = await pdfFile.arrayBuffer();
      const selectedRows = rows.slice(0, fullBatch ? rows.length : freeRows);
      const archive = new JSZip();
      const acroFields = supportedFields.filter((field) => !field.placement);
      const staticFields = supportedFields.filter((field) => field.placement);
      const usesInternationalText = selectedRows.some((row) =>
        supportedFields.some((field) => {
          const column = mapping[field.name];
          return column ? /[^\x20-\x7e]/.test(row[column] || "") : false;
        }),
      );
      const needsNoto =
        usesInternationalText ||
        staticFields.some((field) => field.placement?.fontFamily === "noto");
      const unicodeFont = needsNoto ? await loadUnicodeFont() : null;

      for (let index = 0; index < selectedRows.length; index += 1) {
        const row = selectedRows[index];
        const document = await PDFDocument.load(sourceBytes);
        const form = document.getForm();
        for (const field of acroFields) {
          const rule = mapping[field.name];
          if (!rule) continue;
          const value = field.type === "checkbox"
            ? (isCheckboxChecked(rule, row) ? "true" : "false")
            : row[rule] || "";
          setPdfValue(form.getField(field.name), value);
        }
        if (unicodeFont) document.registerFontkit(fontkit);
        const helvetica = await document.embedFont(StandardFonts.Helvetica);
        const helveticaBold = await document.embedFont(StandardFonts.HelveticaBold);
        const times = await document.embedFont(StandardFonts.TimesRoman);
        const timesBold = await document.embedFont(StandardFonts.TimesRomanBold);
        const courier = await document.embedFont(StandardFonts.Courier);
        const courierBold = await document.embedFont(StandardFonts.CourierBold);
        const noto = unicodeFont
          ? await document.embedFont(unicodeFont, { subset: true })
          : undefined;
        const fonts = {
          default: noto || helvetica,
          helvetica,
          helveticaBold,
          times,
          timesBold,
          courier,
          courierBold,
          noto,
        };
        if (acroFields.length) {
          form.updateFieldAppearances(fonts.default);
          if (flatten) form.flatten();
        }
        applyStaticPdfFields(
          document,
          staticFields as DetectedStaticField[],
          mapping,
          row,
          fonts,
        );
        const output = await document.save();
        const rowName = filenameColumn ? row[filenameColumn] : "";
        archive.file(
          `${String(index + 1).padStart(3, "0")}-${sanitizeFilename(rowName, "document")}.pdf`,
          output,
        );
      }

      archive.file(
        "README.txt",
        `Generated by PDF Batch\nDocuments: ${selectedRows.length}\nSource PDF: ${pdfFile.name}\nSource CSV: ${csvFile?.name || ""}\n`,
      );
      const zipFilename = fullBatch ? "pdf-batch-complete.zip" : "pdf-batch-preview.zip";
      const blob = await archive.generateAsync({ type: "blob" });
      downloadBlob(blob, zipFilename);
      reportGenerationEvent({
        eventType: fullBatch ? "paid_batch" : "free_preview",
        rowsProcessed: selectedRows.length,
        pdfsGenerated: selectedRows.length,
        templateFilename: pdfFile.name,
        csvFilename: csvFile?.name,
        zipFilename,
        success: true,
      });
      if (cloudSyncReady) {
        const [workspaceSaved, batchSaved] = await Promise.all([
          pushCloudWorkspace({ force: true }),
          (async () => {
            setCloudBusy("batch");
            try {
              const form = new FormData();
              form.append("file", blob, zipFilename);
              form.append("pdfCount", String(selectedRows.length));
              form.append("kind", fullBatch ? "complete" : "preview");
              const response = await fetch("/api/account/batches", {
                method: "POST",
                credentials: "include",
                body: form,
              });
              if (!response.ok) return false;
              const result = (await response.json()) as { batch?: CloudBatch };
              if (result.batch) {
                setSavedBatches((current) =>
                  [result.batch!, ...current.filter((row) => row.id !== result.batch!.id)].slice(0, 25),
                );
              } else {
                await refreshCloudSummary();
              }
              return true;
            } catch {
              return false;
            } finally {
              setCloudBusy(null);
            }
          })(),
        ]);
        setNotice(
          fullBatch
            ? batchSaved
              ? `${selectedRows.length} completed PDFs downloaded and saved to your account for re-download.`
              : `${selectedRows.length} completed PDFs downloaded. Account save failed — sign in again to keep ZIPs for 30 days.`
            : batchSaved
              ? `${selectedRows.length} preview PDFs downloaded and saved to your account.`
              : `${selectedRows.length} preview PDFs downloaded. Account save failed — sign in again to keep them under My files.`,
        );
        if (!workspaceSaved && batchSaved) {
          /* batch saved is enough for re-download promise */
        }
      } else {
        setNotice(
          fullBatch
            ? `${selectedRows.length} completed PDFs downloaded as a ZIP archive. Sign in to save them to your account for re-download.`
            : `${selectedRows.length} preview PDFs downloaded.`,
        );
      }
    } catch (generationError) {
      const message =
        generationError instanceof Error ? generationError.message : "The documents could not be generated.";
      reportGenerationEvent({
        eventType: "failed_generation",
        rowsProcessed: 0,
        pdfsGenerated: 0,
        templateFilename: pdfFile?.name,
        csvFilename: csvFile?.name,
        success: false,
        errorCode: generationError instanceof Error ? generationError.name || "GenerationError" : "GenerationError",
      });
      setError(message);
    } finally {
      setBusy(null);
    }
  };

  const beginCheckout = async () => {
    if (!pdfFile || !csvFile || !isReady) return;
    setBusy("checkout");
    setError("");
    try {
      await saveWorkspace({
        pdfBytes: await pdfFile.arrayBuffer(),
        pdfName: pdfFile.name,
        csvBytes: await csvFile.arrayBuffer(),
        csvName: csvFile.name,
        mapping,
        filenameColumn,
        flatten,
        fieldPlacements: fieldPlacementsFromFields(fields),
        removedFieldNames: removedFieldNames.length ? removedFieldNames : undefined,
      });
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId() }),
      });
      const result = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Checkout is unavailable.");
      window.location.assign(result.url);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not be opened.");
      setBusy(null);
    }
  };

  const reset = () => {
    pendingPlacementsRef.current = null;
    pendingRemovedRef.current = null;
    setRemovedFieldNames([]);
    setPlacementMode(false);
    setPdfFile(null);
    setCsvFile(null);
    setFields([]);
    setHeaders([]);
    setRows([]);
    setPreviewIndex(0);
    setMapping({});
    setFilenameColumn("");
    setFlatten(true);
    setError("");
    setNotice("");
  };

  const step = !pdfFile || !csvFile ? 1 : !isReady ? 2 : 3;
  const heroRow = HERO_DEMO_ROWS[heroDemoIndex];
  const scrollToTool = () => {
    document.getElementById("tool")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="site-shell">
      <header className={`topbar${navScrolled ? " is-scrolled" : ""}`}>
        <div className="topbar-inner">
          <a className="brand" href="#top" aria-label="PDF Batch home">
            <span className="brand-mark"><FileArchive size={19} /></span>
            <span>PDF Batch</span>
          </a>
          <div className="topbar-actions">
            <span className="privacy-chip">
              <span className="pulse-dot" aria-hidden="true" />
              <Lock size={14} strokeWidth={2.5} />
              {cloudSyncReady ? "Paid files sync to your account" : "Free preview stays in your browser"}
            </span>
            {hasAccess && accessUntilLabel ? (
              <span className="access-chip" title={accountEmail || "Paid access"}>
                <LockKeyhole size={14} /> Paid until {accessUntilLabel}
              </span>
            ) : null}
            {accountEmail ? (
              <button className="text-button" type="button" onClick={() => void signOut()} title="Sign out">
                <LogOut size={15} /> {accountEmail}
              </button>
            ) : (
              <button className="text-button" type="button" onClick={() => { setAccountPanel("login"); setError(""); }}>
                <LogIn size={15} /> Restore purchase
              </button>
            )}
            <button className="nav-cta" type="button" onClick={scrollToTool}>
              Start free
            </button>
            <button className="icon-button" type="button" onClick={reset} title="Start over" aria-label="Start over">
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      </header>

      {accountPanel && (
        <section className="account-panel" aria-label={accountPanel === "register" ? "Create account" : "Restore purchase"}>
          <div className="account-card">
            <div className="account-card-head">
              <UserRound size={18} />
              <h2>{accountPanel === "register" ? "Create your access account" : "Restore your 30-day purchase"}</h2>
              {accountPanel === "login" ? (
                <button className="icon-button" type="button" aria-label="Close" onClick={() => setAccountPanel(null)}>
                  <X size={16} />
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
            </div>
            {accountPanel === "register" ? (
              <>
                <p>
                  Payment is confirmed for <strong>{accountEmail}</strong>. Set a password now to unlock full batches
                  on this device and any other device for {durationDays} days. Your PDF, CSV, mappings, and generated
                  ZIPs sync to this account during the paid period.
                </p>
                <label>
                  Password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={accountPassword}
                    onChange={(event) => setAccountPassword(event.target.value)}
                    minLength={8}
                  />
                </label>
                <label>
                  Confirm password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={accountPasswordConfirm}
                    onChange={(event) => setAccountPasswordConfirm(event.target.value)}
                    minLength={8}
                  />
                </label>
                <button className="primary-button" type="button" disabled={Boolean(busy)} onClick={() => void submitRegister()}>
                  {busy === "account" ? <RefreshCw className="spin" size={18} /> : <UserRound size={18} />}
                  Save account
                </button>
              </>
            ) : (
              <>
                <p>
                  Your purchase unlocks unlimited batches until it expires. Sign in to restore access, your PDF/CSV
                  workspace, and previously generated ZIP downloads on any computer.
                </p>
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={accountPassword}
                    onChange={(event) => setAccountPassword(event.target.value)}
                  />
                </label>
                <button className="primary-button" type="button" disabled={Boolean(busy)} onClick={() => void submitLogin()}>
                  {busy === "account" ? <RefreshCw className="spin" size={18} /> : <LogIn size={18} />}
                  Sign in
                </button>
                <div className="account-divider">or restore from Stripe receipt</div>
                <label>
                  Checkout success link or session id
                  <input
                    type="text"
                    placeholder="https://pdfbatch.app/?session_id=cs_… or cs_live_…"
                    value={receiptSession}
                    onChange={(event) => setReceiptSession(event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void submitReceiptRestore()}>
                  {busy === "account" ? <RefreshCw className="spin" size={18} /> : <LockKeyhole size={18} />}
                  Restore from receipt
                </button>
              </>
            )}
          </div>
        </section>
      )}

      <section className="product-intro" id="top">
        <div className="intro-copy">
          <span className="privacy-chip" style={{ marginBottom: 4 }}>
            <span className="pulse-dot" aria-hidden="true" />
            <Lock size={14} strokeWidth={2.5} />
            {cloudSyncReady ? "Paid files sync to your account" : "Free preview stays in your browser"}
          </span>
          <h1>Fill hundreds of PDFs from a spreadsheet.</h1>
          <p className="intro-text">
            Certificates, letters, and forms — batch-filled in seconds. Free preview stays in your browser; paid access
            syncs your workspace and ZIP packs for {durationDays} days.
          </p>
          <div className="hero-actions">
            <button className="hero-cta" type="button" onClick={scrollToTool}>
              Generate my batch
              <ArrowRight size={16} />
            </button>
            <button className="hero-cta-secondary" type="button" onClick={() => void loadDemo()} disabled={Boolean(busy)}>
              <Sparkles size={16} />
              Try the sample
            </button>
          </div>
          <div className="trust-row">
            <span><Zap size={16} /> Instant preview</span>
            <span><Check size={16} /> No Acrobat</span>
            <span className="trust-ok"><ShieldCheck size={16} /> Account re-download</span>
            <span className="trust-ok"><Check size={16} /> Generate {freeRows} PDFs free</span>
          </div>
        </div>
        <div className="hero-demo" aria-hidden="true">
          <div className="hero-demo-grid">
            <div className="hero-sheet">
              <div className="hero-sheet-head">
                <FileSpreadsheet size={14} />
                graduates.csv
              </div>
              <table className="hero-table">
                <thead>
                  <tr>
                    <th>full_name</th>
                    <th>course_name</th>
                    <th>certificate_id</th>
                  </tr>
                </thead>
                <tbody>
                  {HERO_DEMO_ROWS.map((row, index) => (
                    <tr className={index === heroDemoIndex ? "is-active" : undefined} key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.course}</td>
                      <td>{row.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <span className="hero-arrow"><ArrowRight size={18} /></span>
            <div className="hero-cert">
              <span className="hero-cert-badge"><Award size={18} /></span>
              <p className="hero-cert-kicker">Certificate of Completion</p>
              <p className="hero-cert-label">This certifies that</p>
              <strong key={heroRow.id}>{heroRow.name}</strong>
              <p className="hero-cert-course">
                has completed <em>{heroRow.course}</em>
              </p>
            </div>
          </div>
          <p className="hero-demo-caption">
            <FileCheck2 size={15} />
            Generating <strong>{HERO_DEMO_ROWS.length}+</strong> certificates from 1 template
          </p>
        </div>
      </section>

      <section className="tool-band" id="tool" aria-label="PDF batch fill tool">
        <div className="stepper" aria-label={`Step ${step} of 3`}>
          {["Add files", "Map fields", "Download"].map((label, index) => (
            <Fragment key={label}>
              <div
                className={`step-item${step === index + 1 ? " active" : ""}${step > index + 1 ? " done" : ""}`}
              >
                <span className="step-index">{step > index + 1 ? <Check size={16} strokeWidth={3} /> : index + 1}</span>
                <span className="step-copy">
                  <small>Step {index + 1}</small>
                  <strong>{label}</strong>
                </span>
              </div>
              {index < 2 ? (
                <div className={`step-connector${step > index + 1 ? " filled" : ""}`} aria-hidden="true">
                  <span />
                </div>
              ) : null}
            </Fragment>
          ))}
        </div>

        <div className="tool-surface">
          <div className="surface-heading">
            <div>
              <h2>Add your PDF form and spreadsheet</h2>
              <p>Use an existing PDF form and a CSV exported from Excel or Google Sheets. Each spreadsheet row becomes one filled PDF.</p>
            </div>
            <button className="text-button" type="button" onClick={loadDemo} disabled={Boolean(busy)}>
              <Sparkles size={16} /> Try the sample
            </button>
          </div>

          {cloudSyncReady && accessUntilLabel ? (
            <div className="message success-message access-banner" role="status">
              <Check size={18} />
              <span>
                Your purchase is active until <strong>{accessUntilLabel}</strong>
                {accountEmail ? <> ({accountEmail})</> : null}. PDF, CSV, mappings, and generated ZIPs sync to your
                account so you can reopen and re-download them anytime during the paid period.
              </span>
            </div>
          ) : null}

          {hasAccess && !cloudSyncReady && accessUntilLabel ? (
            <div className="message error-message access-banner" role="status">
              <CircleAlert size={18} />
              <span>
                Paid unlock is active until <strong>{accessUntilLabel}</strong>, but this browser is not signed in for
                file sync.{" "}
                <button className="linkish" type="button" onClick={() => setAccountPanel("login")}>
                  Sign in
                </button>{" "}
                to restore and re-download saved ZIPs.
              </span>
            </div>
          ) : null}

          {cloudSyncReady ? (
            <div className="my-files" aria-label="My files">
              <div className="my-files-head">
                <div>
                  <h3><FolderOpen size={16} /> My files</h3>
                  <p>
                    {cloudSummary?.hasWorkspace
                      ? `Saved workspace: ${cloudSummary.pdfName || "PDF"} + ${cloudSummary.csvName || "CSV"}${
                          cloudSummary.updatedAt
                            ? ` · updated ${new Date(cloudSummary.updatedAt).toLocaleString()}`
                            : ""
                        }`
                      : "No PDF/CSV saved on this account yet. Upload them below — they sync while you stay signed in."}
                  </p>
                </div>
                <div className="my-files-actions">
                  {cloudSummary?.hasWorkspace ? (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={Boolean(busy || cloudBusy)}
                      onClick={() => void loadCloudWorkspace()}
                    >
                      {cloudBusy === "loading" ? <RefreshCw className="spin" size={16} /> : <FolderOpen size={16} />}
                      Restore saved files
                    </button>
                  ) : null}
                </div>
              </div>
              {savedBatches.length ? (
                <ul className="batch-list">
                  {savedBatches.map((batch) => (
                    <li key={batch.id}>
                      <div>
                        <strong>{batch.filename}</strong>
                        <small>
                          {batch.kind === "preview" ? "Preview" : "Complete"} · {batch.pdfCount} PDFs ·{" "}
                          {formatBytes(batch.bytes)} · {new Date(batch.createdAt).toLocaleString()}
                        </small>
                      </div>
                      <button
                        className="text-button"
                        type="button"
                        disabled={Boolean(cloudBusy)}
                        onClick={() => void downloadCloudBatch(batch)}
                      >
                        <Download size={15} /> Re-download
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="my-files-empty">
                  No account ZIPs yet. Batches you generated earlier only downloaded to this computer’s Downloads folder
                  (look for <code>pdf-batch-complete.zip</code>). Generate again while signed in — the ZIP will appear
                  here for re-download during your paid period.
                </p>
              )}
            </div>
          ) : null}

          <div className="upload-grid">
            <label
              className={`dropzone ${pdfFile ? "complete" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, "pdf")}
            >
              <input
                key={`${pdfFile?.name || "empty"}-${pdfFile?.lastModified || 0}`}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event: ChangeEvent<HTMLInputElement>) => acceptPdf(event.target.files?.[0])}
              />
              <span className="upload-icon"><FileText size={23} /></span>
              <span className="dropzone-copy">
                <strong>{pdfFile ? pdfFile.name : "PDF form template"}</strong>
                <small>
                  {pdfFile
                    ? placementMode
                      ? supportedFields.length
                        ? `${supportedFields.length} writing area${supportedFields.length === 1 ? "" : "s"} ready`
                        : "No fields detected — use Add field on the preview"
                      : `${supportedFields.length} field${supportedFields.length === 1 ? "" : "s"} detected`
                    : "Drop PDF here or choose a file"}
                </small>
              </span>
              {pdfFile ? <FileCheck2 className="file-check" size={21} /> : <Upload size={18} />}
            </label>

            <label
              className={`dropzone ${csvFile ? "complete" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, "csv")}
            >
              <input
                key={`${csvFile?.name || "empty"}-${csvFile?.lastModified || 0}`}
                type="file"
                accept="text/csv,.csv"
                onChange={(event: ChangeEvent<HTMLInputElement>) => acceptCsv(event.target.files?.[0])}
              />
              <span className="upload-icon amber"><FileSpreadsheet size={23} /></span>
              <span className="dropzone-copy">
                <strong>{csvFile ? csvFile.name : "Recipient spreadsheet (.csv)"}</strong>
                <small>{csvFile ? `${rows.length} data rows found` : "Drop CSV here or choose a file"}</small>
              </span>
              {csvFile ? <FileCheck2 className="file-check" size={21} /> : <Upload size={18} />}
            </label>
          </div>

          {error && (
            <div className="message error-message" role="alert">
              <CircleAlert size={18} /> <span>{error}</span>
              <button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button>
            </div>
          )}
          {notice && (
            <div className="message success-message" role="status">
              <Check size={18} /> <span>{notice}</span>
              <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message"><X size={16} /></button>
            </div>
          )}

          {(placementMode || fields.length > 0) && pdfFile && (
            <div className="mapping-section">
              <div className="section-title-row">
                <div>
                  <span className="section-number">02</span>
                  <h3>{showPrintedPreview ? "Place fields & map columns" : "Match PDF fields to spreadsheet columns"}</h3>
                </div>
                <span className="mapping-count">
                  {headers.length
                    ? `${mappedCount}/${supportedFields.length} configured`
                    : supportedFields.length
                      ? `${supportedFields.length} field${supportedFields.length === 1 ? "" : "s"} placed`
                      : "Add fields on the preview"}
                </span>
              </div>
              {showPrintedPreview && (
                <PlacementPreview
                  pdfFile={pdfFile}
                  fields={supportedFields}
                  headers={headers}
                  mapping={mapping}
                  selectedField={selectedField}
                  sampleValues={previewSamples}
                  onSelectField={setSelectedField}
                  onMoveField={movePrintedField}
                  onStyleField={stylePrintedField}
                  onRenameField={renamePrintedField}
                  onMapField={mapPrintedField}
                  onRemoveField={removePrintedField}
                  onAddField={addPrintedField}
                  onDuplicateField={duplicatePrintedField}
                />
              )}
              {!headers.length ? (
                <p className="placement-preview-note">
                  {supportedFields.length
                    ? "Add a CSV next to map these writing areas to spreadsheet columns."
                    : "Click Add field, then click the PDF where the text should appear. Add a CSV afterward to map columns."}
                </p>
              ) : supportedFields.length === 0 ? (
                <p className="placement-preview-note">
                  No writing areas yet. Click <strong>Add field</strong>, then click the PDF where the text should appear.
                </p>
              ) : (
              <div className={`mapping-list ${showPrintedPreview ? "mapping-list-dense" : ""}`}>
                {supportedFields.map((field) => (
                  <div
                    className={`mapping-row ${selectedField === field.name ? "selected" : ""} ${
                      mapping[field.name] ? "" : "unmapped-row"
                    }`}
                    key={field.name}
                    onClick={() => setSelectedField(field.name)}
                  >
                    <div className="field-name">
                      <span className={`field-type ${field.type}`}>{field.type}</span>
                      <strong>{field.name}</strong>
                    </div>
                    <ArrowRight size={14} />
                    {field.type === "checkbox" ? (
                      <div className="checkbox-rule-control" role="group" aria-label={`Checkbox rule for ${field.name}`}>
                        <button
                          type="button"
                          className={!mapping[field.name] ? "active" : ""}
                          aria-pressed={!mapping[field.name]}
                          title="Leave unchecked"
                          onClick={() => setMapping((current) => ({ ...current, [field.name]: "" }))}
                        >
                          <Square size={14} />
                          <span>Unchecked</span>
                        </button>
                        <button
                          type="button"
                          className={mapping[field.name] === CHECKBOX_ALWAYS ? "active" : ""}
                          aria-pressed={mapping[field.name] === CHECKBOX_ALWAYS}
                          title="Always check"
                          onClick={() => setMapping((current) => ({ ...current, [field.name]: CHECKBOX_ALWAYS }))}
                        >
                          <CheckSquare2 size={14} />
                          <span>Always</span>
                        </button>
                        <label className={`select-wrap checkbox-column ${
                          mapping[field.name] && mapping[field.name] !== CHECKBOX_ALWAYS ? "active" : ""
                        }`}>
                          <span className="sr-only">CSV condition for {field.name}</span>
                          <select
                            value={mapping[field.name] && mapping[field.name] !== CHECKBOX_ALWAYS
                              ? mapping[field.name]
                              : ""}
                            onChange={(event) =>
                              setMapping((current) => ({ ...current, [field.name]: event.target.value }))
                            }
                          >
                            <option value="" disabled>From CSV</option>
                            {headers.map((header) => (
                              <option key={header} value={header}>
                                When &quot;{header}&quot; is true
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={14} />
                        </label>
                      </div>
                    ) : (
                      <label className="select-wrap">
                        <span className="sr-only">CSV column for {field.name}</span>
                        <select
                          value={mapping[field.name] || ""}
                          onChange={(event) =>
                            setMapping((current) => ({ ...current, [field.name]: event.target.value }))
                          }
                        >
                          <option value="">Do not fill</option>
                          {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                        </select>
                        <ChevronDown size={14} />
                      </label>
                    )}
                    {field.placement ? (
                      <button
                        type="button"
                        className="mapping-remove"
                        title={`Remove “${field.name}”`}
                        aria-label={`Remove ${field.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          removePrintedField(field.name);
                        }}
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              )}

              {headers.length > 0 && supportedFields.length > 0 ? (
              <div className="output-settings">
                <label className="setting-block">
                  <span>Use filenames from</span>
                  <span className="select-wrap compact">
                    <select value={filenameColumn} onChange={(event) => setFilenameColumn(event.target.value)}>
                      {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                    </select>
                    <ChevronDown size={15} />
                  </span>
                </label>
                <label className="toggle-row">
                  <input type="checkbox" checked={flatten} onChange={(event) => setFlatten(event.target.checked)} />
                  <span className="toggle" aria-hidden="true"><span /></span>
                  <span><strong>Lock completed fields</strong><small>Recommended for finished documents</small></span>
                </label>
              </div>
              ) : null}
            </div>
          )}

          {isReady && (
            <div className="preview-section">
              <div className="section-title-row">
                <div>
                  <span className="section-number">03</span>
                  <h3>Verify your data</h3>
                </div>
                <span className="row-count">{rows.length} recipients ready</span>
              </div>
              <div className="preview-navigation">
                <button
                  className="preview-arrow"
                  type="button"
                  title="Previous document"
                  aria-label="Previous document"
                  disabled={previewIndex === 0}
                  onClick={() => setPreviewIndex((current) => Math.max(0, current - 1))}
                >
                  <ChevronLeft size={19} />
                </button>
                <label className="preview-position">
                  <span>Document</span>
                  <input
                    type="number"
                    min={1}
                    max={rows.length}
                    value={previewIndex + 1}
                    aria-label="Document number"
                    onChange={(event) => {
                      const next = event.currentTarget.valueAsNumber;
                      if (Number.isFinite(next)) {
                        setPreviewIndex(Math.min(rows.length - 1, Math.max(0, next - 1)));
                      }
                    }}
                  />
                  <span aria-live="polite">of {rows.length}</span>
                </label>
                <button
                  className="preview-arrow"
                  type="button"
                  title="Next document"
                  aria-label="Next document"
                  disabled={previewIndex === rows.length - 1}
                  onClick={() => setPreviewIndex((current) => Math.min(rows.length - 1, current + 1))}
                >
                  <ChevronRight size={19} />
                </button>
              </div>

              <dl className="preview-record" id="preview-record">
                {headers.map((header) => {
                  const value = rows[previewIndex]?.[header] || "";
                  return (
                    <div className="preview-field" key={header}>
                      <dt>{header}</dt>
                      <dd className={value ? "" : "empty-cell"}>{value || "Empty"}</dd>
                    </div>
                  );
                })}
              </dl>

              <div className="action-row">
                <button className="secondary-button" type="button" onClick={() => void generate(false)} disabled={Boolean(busy)}>
                  <Download size={18} /> Generate {Math.min(freeRows, rows.length)} PDFs free
                </button>
                {hasAccess ? (
                  <button className="primary-button" type="button" onClick={() => void generate(true)} disabled={Boolean(busy)}>
                    {busy === "generating" ? <RefreshCw className="spin" size={18} /> : <FileArchive size={18} />}
                    Generate all {rows.length} PDFs
                  </button>
                ) : (
                  <button className="primary-button" type="button" onClick={beginCheckout} disabled={Boolean(busy)}>
                    {busy === "checkout" ? <RefreshCw className="spin" size={18} /> : <LockKeyhole size={18} />}
                    Unlock full batch · {displayPrice}
                  </button>
                )}
              </div>
              <p className="payment-note">
                One payment unlocks unlimited batches for {durationDays} days. After checkout, create a password so you can
                restore access, your files, and generated ZIPs on any device during the paid period.
                {!hasAccess && (
                  <>
                    {" "}
                    <button className="linkish" type="button" onClick={() => setAccountPanel("login")}>
                      Already paid? Restore purchase
                    </button>
                  </>
                )}
              </p>
            </div>
          )}

          {busy && busy !== "checkout" && (
            <div className="busy-overlay" role="status">
              <RefreshCw className="spin" size={23} />
              <span>{busy === "reading" ? "Reading your files" : busy === "verifying" ? "Confirming payment" : busy === "account" ? "Saving your account" : "Building your archive"}</span>
            </div>
          )}
        </div>
      </section>

      <section className="how-band" aria-label="How it works">
        <span className="eyebrow">How it works</span>
        <h2>Three steps, zero learning curve</h2>
        <div className="how-grid">
          {[
            {
              icon: Upload,
              title: "Drop your files",
              body: "Add a fillable PDF and a CSV or Excel export. Free preview processing stays on this device.",
            },
            {
              icon: GitMerge,
              title: "Map the fields",
              body: "Connect each PDF field to a spreadsheet column and preview any row live before you generate.",
            },
            {
              icon: Download,
              title: "Download the batch",
              body: "Generate one PDF per row and grab them in a ZIP. Paid access keeps that ZIP under My files.",
            },
          ].map((item, index) => (
            <article className="how-card" key={item.title}>
              <span className="how-num">0{index + 1}</span>
              <span className="how-icon"><item.icon size={22} strokeWidth={2} /></span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="proof-band">
        <div>
          <span className="proof-pill"><ShieldCheck size={15} /> Privacy with paid re-access</span>
          <h2>Free preview stays local. Paid access keeps your workspace with you.</h2>
          <p>
            Free preview processing stays in your browser. With a paid account, your PDF template, spreadsheet,
            mappings, and generated ZIP archives sync so you can reopen and re-download them anytime during the paid
            period — including on another device after you sign in.
          </p>
        </div>
        <div className="proof-facts">
          <span><strong>Account</strong> restore anywhere</span>
          <span><strong>{MAX_ROWS}</strong> PDFs per batch</span>
          <span><strong>{durationDays} days</strong> file re-access</span>
        </div>
      </section>

      <section className="use-cases">
        <div className="use-copy">
          <div>
            <span className="eyebrow">Use cases</span>
            <h2>One template. Any document.</h2>
          </div>
          <button className="use-explore" type="button" onClick={scrollToTool}>
            Explore the flow
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="use-grid">
          {[
            {
              icon: Award,
              title: "Certificates",
              body: "Course completions, awards and diplomas — hundreds at once, each personalized.",
            },
            {
              icon: Mail,
              title: "Letters",
              body: "Offer letters, invitations and personalized notices generated from a single template.",
            },
            {
              icon: FileText,
              title: "Application Forms",
              body: "Pre-fill address, membership and application forms directly from your spreadsheet.",
            },
          ].map((item) => (
            <article className="use-item" key={item.title}>
              <span className="use-icon" aria-hidden="true">
                <item.icon size={24} strokeWidth={2} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="final-cta">
        <h2>Ready to stop filling PDFs one by one?</h2>
        <p>
          Your first {freeRows} documents are free. Unlock unlimited batches for {durationDays} days when you need the
          full pack — and keep generated ZIPs under My files.
        </p>
        <button className="hero-cta" type="button" onClick={scrollToTool}>
          Start generating free
          <ArrowRight size={16} />
        </button>
      </section>

      <footer>
        <div className="brand footer-brand"><span className="brand-mark"><FileArchive size={18} /></span><span>PDF Batch</span></div>
        <p>
          Batch-fill PDF forms from a spreadsheet. Free preview stays in your browser; paid access syncs files and ZIP
          packs for re-download.
        </p>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </main>
  );
}
