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
  LockKeyhole,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Square,
  CheckSquare2,
  Sparkles,
  Upload,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
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
  mergeSavedPlacements,
  withoutRemovedFields,
  type DetectedStaticField,
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
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountPanel, setAccountPanel] = useState<"register" | "login" | null>(null);
  const [pendingCheckoutSession, setPendingCheckoutSession] = useState<string | null>(null);
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [removedFieldNames, setRemovedFieldNames] = useState<string[]>([]);
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
  const showPrintedPreview = Boolean(pdfFile) && (hasPrintedFields || removedFieldNames.length > 0);
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

  const addPrintedField = (pageIndex: number, size: { width: number; height: number }) => {
    const used = new Set(fields.map((field) => field.name));
    let index = 1;
    let name = `Field ${index}`;
    while (used.has(name)) {
      index += 1;
      name = `Field ${index}`;
    }
    const placement = findOpenPlacement(
      pageIndex,
      size,
      fields
        .filter((field): field is PdfField & { placement: StaticPlacement } => Boolean(field.placement))
        .map((field) => field.placement),
    );
    setFields((current) => [...current, { name, type: "text", placement }]);
    setMapping((current) => ({ ...current, [name]: "" }));
    setSelectedField(name);
    setRemovedFieldNames((current) => current.filter((entry) => entry !== name));
  };

  const grantLocalAccess = (expiresAt: number, sessionId?: string) => {
    localStorage.setItem(
      ACCESS_KEY,
      JSON.stringify({ sessionId, expiresAt }),
    );
    setHasAccess(true);
  };

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
      try {
        const response = await fetch("/api/account/me", { cache: "no-store" });
        if (!response.ok) return;
        const me = (await response.json()) as {
          authenticated?: boolean;
          hasAccess?: boolean;
          email?: string;
          expiresAt?: number;
        };
        if (me.email) setAccountEmail(me.email);
        if (me.hasAccess && typeof me.expiresAt === "number" && me.expiresAt > Date.now()) {
          grantLocalAccess(me.expiresAt);
          setAccountEmail(me.email || null);
        }
      } catch {
        /* ignore */
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
          setAccountPanel("register");
          setNotice("Payment confirmed. Create a password to unlock full batches on this and any other device.");
        } else {
          grantLocalAccess(result.expiresAt, sessionId);
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
      setNotice(`Account ready for ${result.email}. Sign in on any device during your paid access.`);
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
      setNotice(`Signed in as ${result.email}. Full batch generation is unlocked.`);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign-in failed.");
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    try {
      await fetch("/api/account/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    localStorage.removeItem(ACCESS_KEY);
    setHasAccess(false);
    setAccountEmail(null);
    setNotice("Signed out. Your files were never uploaded; only this browser unlock was cleared.");
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
          if (!staticFields.length) {
            throw new Error("No fillable fields or blank writing lines could be detected in this PDF.");
          }
          const restored = pendingPlacementsRef.current;
          const removed = pendingRemovedRef.current;
          pendingPlacementsRef.current = null;
          pendingRemovedRef.current = null;
          const merged = withoutRemovedFields(
            mergeSavedPlacements(staticFields, restored),
            removed,
          );
          const separated: DetectedStaticField[] = [];
          for (let pageIndex = 0; pageIndex < document.getPageCount(); pageIndex += 1) {
            const size = document.getPage(pageIndex).getSize();
            const onPage = merged.filter((field) => field.placement.pageIndex === pageIndex);
            separated.push(
              ...resolveFieldOverlaps(onPage, { width: size.width, height: size.height }),
            );
          }
          if (removed) setRemovedFieldNames(removed);
          setFields(separated);
          setNotice(
            restored || removed?.length
              ? `Printed form restored. ${separated.length} writing areas ready${
                  removed?.length ? ` (${removed.length} removed earlier)` : ""
                }.`
              : `Printed form detected. ${separated.length} writing areas found (dotted lines, underscores, and ruled lines). Match them on the preview — names auto-map when labels are similar.`,
          );
        } else {
          pendingPlacementsRef.current = null;
          pendingRemovedRef.current = null;
          setRemovedFieldNames([]);
          setFields(nextFields);
        }
      } catch (pdfError) {
        setFields([]);
        setError(
          pdfError instanceof Error && pdfError.message.includes("No fillable fields")
            ? pdfError.message
            : `The PDF could not be read${
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
        const response = await fetch("/api/account/me", { cache: "no-store" });
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
      const unicodeFont = usesInternationalText ? await loadUnicodeFont() : null;

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
        const font = unicodeFont
          ? await document.embedFont(unicodeFont, { subset: true })
          : await document.embedFont(StandardFonts.Helvetica);
        if (acroFields.length) {
          form.updateFieldAppearances(font);
          if (flatten) form.flatten();
        }
        applyStaticPdfFields(
          document,
          staticFields as DetectedStaticField[],
          mapping,
          row,
          font,
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
        `Generated by PDF Mail Merge\nDocuments: ${selectedRows.length}\nSource PDF: ${pdfFile.name}\nSource CSV: ${csvFile?.name || ""}\n`,
      );
      const zipFilename = fullBatch ? "pdf-mail-merge-complete.zip" : "pdf-mail-merge-preview.zip";
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
      setNotice(
        fullBatch
          ? `${selectedRows.length} completed PDFs downloaded as a ZIP archive.`
          : `${selectedRows.length} preview PDFs downloaded.`,
      );
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

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PDF Mail Merge home">
          <span className="brand-mark"><FileArchive size={19} /></span>
          <span>PDF Mail Merge</span>
        </a>
        <div className="topbar-actions">
          <span className="privacy-chip"><ShieldCheck size={15} /> Files stay on your device</span>
          {accountEmail ? (
            <button className="text-button" type="button" onClick={() => void signOut()} title="Sign out">
              <LogOut size={15} /> {accountEmail}
            </button>
          ) : (
            <button className="text-button" type="button" onClick={() => { setAccountPanel("login"); setError(""); }}>
              <LogIn size={15} /> Sign in
            </button>
          )}
          <button className="icon-button" type="button" onClick={reset} title="Start over" aria-label="Start over">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {accountPanel && (
        <section className="account-panel" aria-label={accountPanel === "register" ? "Create account" : "Sign in"}>
          <div className="account-card">
            <div className="account-card-head">
              <UserRound size={18} />
              <h2>{accountPanel === "register" ? "Create your access account" : "Restore paid access"}</h2>
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
                  on this device and any other device for {durationDays} days. PDF and CSV files still never leave your
                  browser.
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
                <p>Sign in with the email and password from checkout to unlock full batches on this device.</p>
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
              </>
            )}
          </div>
        </section>
      )}

      <section className="product-intro" id="top">
        <div className="intro-copy">
          <span className="eyebrow"><Zap size={15} /> Fillable PDF + spreadsheet</span>
          <h1>PDF mail merge from Excel or CSV.</h1>
          <p className="intro-text">
            Export Excel or Google Sheets as CSV, match columns to your existing PDF form, then download individually named PDFs in one ZIP.
          </p>
          <div className="trust-row">
            <span><Check size={16} /> No Acrobat</span>
            <span><Check size={16} /> No uploads</span>
            <span><Check size={16} /> First 3 free</span>
          </div>
        </div>
        <div className="document-visual" aria-hidden="true">
          <div className="visual-sheet back-sheet" />
          <div className="visual-sheet front-sheet">
            <span className="visual-kicker">CERTIFICATE</span>
            <span className="visual-label">Presented to</span>
            <strong>{rows[0]?.[headers[0]] || "Alex Morgan"}</strong>
            <span className="visual-line" />
            <span className="visual-small">Generated from row 1</span>
          </div>
          <div className="csv-visual"><FileSpreadsheet size={18} /> Spreadsheet · {rows.length || 100} rows</div>
        </div>
      </section>

      <section className="tool-band" aria-label="PDF batch fill tool">
        <div className="stepper" aria-label={`Step ${step} of 3`}>
          {["Add files", "Match fields", "Generate"].map((label, index) => (
            <div className={`step-item ${step >= index + 1 ? "active" : ""}`} key={label}>
              <span>{step > index + 1 ? <Check size={14} /> : index + 1}</span>
              {label}
            </div>
          ))}
        </div>

        <div className="tool-surface">
          <div className="surface-heading">
            <div>
              <h2>Choose your PDF template and recipient data</h2>
              <p>Use a fillable or printed PDF with a CSV exported from Excel or Google Sheets. Up to {MAX_ROWS} recipients per merge.</p>
            </div>
            <button className="text-button" type="button" onClick={loadDemo} disabled={Boolean(busy)}>
              <Sparkles size={16} /> Try the sample
            </button>
          </div>

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
                    ? `${supportedFields.length} ${fields.some((field) => field.placement) ? "writing areas" : "fields"} detected`
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

          {fields.length > 0 && headers.length > 0 && (
            <div className="mapping-section">
              <div className="section-title-row">
                <div>
                  <span className="section-number">02</span>
                  <h3>{showPrintedPreview ? "Place fields & map columns" : "Match PDF fields to spreadsheet columns"}</h3>
                </div>
                <span className="mapping-count">{mappedCount}/{supportedFields.length} configured</span>
              </div>
              {showPrintedPreview && pdfFile && (
                <PlacementPreview
                  pdfFile={pdfFile}
                  fields={supportedFields}
                  headers={headers}
                  mapping={mapping}
                  selectedField={selectedField}
                  sampleValues={previewSamples}
                  onSelectField={setSelectedField}
                  onMoveField={movePrintedField}
                  onMapField={mapPrintedField}
                  onRemoveField={removePrintedField}
                  onAddField={addPrintedField}
                />
              )}
              <div className={`mapping-list ${showPrintedPreview ? "mapping-list-dense" : ""}`}>
                {supportedFields.map((field) => (
                  <div
                    className={`mapping-row ${selectedField === field.name ? "selected" : ""}`}
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
                  <Download size={18} /> Generate {Math.min(freeRows, rows.length)} free
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
                One payment unlocks unlimited batches for {durationDays} days. After checkout, create a password with your
                Stripe email so you can sign in on any device. Files still never leave your browser.
                {!hasAccess && (
                  <>
                    {" "}
                    <button className="linkish" type="button" onClick={() => setAccountPanel("login")}>
                      Already paid? Sign in
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

      <section className="proof-band">
        <div>
          <ShieldCheck size={24} />
          <h2>Your mail merge stays private.</h2>
          <p>PDF and spreadsheet processing happens inside your browser. PDF Mail Merge never receives or stores the contents of your files.</p>
        </div>
        <div className="proof-facts">
          <span><strong>0</strong> files uploaded</span>
          <span><strong>250</strong> recipients per merge</span>
          <span><strong>{durationDays} days</strong> account access</span>
        </div>
      </section>

      <section className="use-cases">
        <div className="use-copy">
          <span className="eyebrow">Built for repetitive documents</span>
          <h2>One template. Every recipient.</h2>
        </div>
        <div className="use-grid">
          {["Letters", "Certificates", "Application forms", "Address forms"].map((item, index) => (
            <div className="use-item" key={item}>
              <span>0{index + 1}</span>
              <strong>{item}</strong>
            </div>
          ))}
        </div>
      </section>

      <footer>
        <div className="brand footer-brand"><span className="brand-mark"><FileArchive size={18} /></span><span>PDF Mail Merge</span></div>
        <p>Spreadsheet-to-PDF mail merge, directly in your browser.</p>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </main>
  );
}
