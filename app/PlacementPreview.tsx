"use client";

import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
  Trash2,
} from "lucide-react";
import {
  movePlacementInteractive,
  resizePlacementWithoutOverlap,
  separateFromOthers,
  type ResizeEdge,
} from "./placement-geometry";
import {
  CHECKBOX_ALWAYS,
  PLACEMENT_ALIGN_OPTIONS,
  PLACEMENT_FONT_OPTIONS,
  PLACEMENT_FONT_SIZES,
  type PlacementAlign,
  type PlacementFontFamily,
  type StaticPlacement,
} from "./static-pdf";

type PreviewField = {
  name: string;
  type: string;
  placement?: StaticPlacement;
};

type PlacementPreviewProps = {
  pdfFile: File;
  fields: PreviewField[];
  headers: string[];
  mapping: Record<string, string>;
  selectedField: string | null;
  sampleValues: Record<string, string>;
  onSelectField: (name: string | null) => void;
  onMoveField: (name: string, placement: StaticPlacement) => void;
  onStyleField: (
    name: string,
    style: {
      fontFamily?: PlacementFontFamily;
      fontSize?: number | "";
      bold?: boolean;
      align?: PlacementAlign;
    },
  ) => void;
  onRenameField: (oldName: string, nextName: string) => void;
  onMapField: (name: string, value: string) => void;
  onRemoveField: (name: string) => void;
  onAddField: (
    pageIndex: number,
    pageSize: { width: number; height: number },
    at?: { x: number; y: number },
  ) => void;
  onDuplicateField: (
    name: string,
    pageSize: { width: number; height: number },
  ) => void;
};

type Interaction =
  | {
      kind: "move";
      name: string;
      originX: number;
      originY: number;
      startPlacement: StaticPlacement;
      moved: boolean;
    }
  | {
      kind: "resize";
      name: string;
      edge: ResizeEdge;
      originX: number;
      originY: number;
      startPlacement: StaticPlacement;
      moved: boolean;
    };

export function PlacementPreview({
  pdfFile,
  fields,
  headers,
  mapping,
  selectedField,
  sampleValues,
  onSelectField,
  onMoveField,
  onStyleField,
  onRenameField,
  onMapField,
  onRemoveField,
  onAddField,
  onDuplicateField,
}: PlacementPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const focusNameAfterAddRef = useRef(false);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [renderedPageIndex, setRenderedPageIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameDraftFor, setNameDraftFor] = useState<string | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [livePlacement, setLivePlacement] = useState<StaticPlacement | null>(null);
  const [liveName, setLiveName] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const rafRef = useRef<number | null>(null);
  const pendingLiveRef = useRef<{
    name: string;
    placement: StaticPlacement;
    guides: { x: number[]; y: number[] };
  } | null>(null);

  const safePageIndex = Math.min(pageIndex, Math.max(0, pageCount - 1));
  const pageReady = renderedPageIndex === safePageIndex && pageSize.height > 0;

  const placedFields = useMemo(
    () =>
      fields.filter(
        (field): field is PreviewField & { placement: StaticPlacement } => Boolean(field.placement),
      ),
    [fields],
  );

  const pageFields = useMemo(
    () => placedFields.filter((field) => field.placement.pageIndex === safePageIndex),
    [placedFields, safePageIndex],
  );

  const fieldCountsByPage = useMemo(() => {
    const counts = Array.from({ length: pageCount }, () => 0);
    for (const field of placedFields) {
      const index = field.placement.pageIndex;
      if (index >= 0 && index < counts.length) counts[index] += 1;
    }
    return counts;
  }, [placedFields, pageCount]);

  const selected = useMemo(
    () => placedFields.find((field) => field.name === selectedField) || null,
    [placedFields, selectedField],
  );
  const nameValue =
    selected && nameDraftFor === selected.name ? nameDraft : selected?.name || "";

  useEffect(() => {
    if (!selectedField || !focusNameAfterAddRef.current) return;
    focusNameAfterAddRef.current = false;
    const timer = window.setTimeout(() => nameInputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [selectedField]);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      setError("");
      try {
        const bytes = await pdfFile.arrayBuffer();
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        try {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/legacy/build/pdf.worker.mjs",
            import.meta.url,
          ).toString();
        } catch {
          await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
        }
        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(bytes.slice(0)),
          useSystemFonts: true,
        });
        const pdfDocument = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }
        const nextPageCount = pdfDocument.numPages;
        setPageCount(nextPageCount);
        const pageNumber = Math.min(safePageIndex, nextPageCount - 1) + 1;
        const page = await pdfDocument.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const fitScale = Math.min(1.05, 760 / base.width);
        const viewport = page.getViewport({ scale: fitScale });
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${canvas.width}px`;
        canvas.style.height = `${canvas.height}px`;
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }
        setPageSize({ width: base.width, height: base.height });
        setScale(fitScale);
        setRenderedPageIndex(pageNumber - 1);
        await loadingTask.destroy();
      } catch (renderError) {
        if (!cancelled) {
          setRenderedPageIndex(null);
          setError(
            renderError instanceof Error
              ? renderError.message
              : "The PDF preview could not be rendered.",
          );
        }
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [pdfFile, safePageIndex]);

  const toCanvas = (placement: StaticPlacement) => ({
    x: placement.x * scale,
    y: (pageSize.height - placement.y - placement.height) * scale,
    width: Math.max(1, placement.width * scale),
    height: Math.max(1, placement.height * scale),
  });

  const othersFor = (name: string) =>
    pageFields.filter((field) => field.name !== name).map((field) => field.placement);

  const placeAtClientPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !pageReady) return;
    const rect = canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    if (canvasX < 0 || canvasY < 0 || canvasX > rect.width || canvasY > rect.height) return;
    // Pass click center in PDF coords; addPrintedField centers the box on that point.
    const pdfX = canvasX / scale;
    const pdfYFromTop = canvasY / scale;
    const pdfYCenter = pageSize.height - pdfYFromTop;
    setPlacing(false);
    focusNameAfterAddRef.current = true;
    onAddField(safePageIndex, pageSize, { x: pdfX, y: pdfYCenter });
  };

  const beginMove = (
    event: ReactPointerEvent<HTMLElement>,
    field: PreviewField & { placement: StaticPlacement },
  ) => {
    if ((event.target as HTMLElement).closest(".placement-handle")) return;
    if (placing) {
      event.preventDefault();
      event.stopPropagation();
      placeAtClientPoint(event.clientX, event.clientY);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSelectField(field.name);
    setDragging(false);
    setLiveName(field.name);
    setLivePlacement({ ...field.placement });
    setSnapGuides({ x: [], y: [] });
    interactionRef.current = {
      kind: "move",
      name: field.name,
      originX: event.clientX,
      originY: event.clientY,
      startPlacement: { ...field.placement },
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const beginResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    field: PreviewField & { placement: StaticPlacement },
    edge: ResizeEdge,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectField(field.name);
    setDragging(true);
    setLiveName(field.name);
    setLivePlacement({ ...field.placement });
    setSnapGuides({ x: [], y: [] });
    interactionRef.current = {
      kind: "resize",
      name: field.name,
      edge,
      originX: event.clientX,
      originY: event.clientY,
      startPlacement: { ...field.placement },
      moved: true,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const scheduleLive = (
    name: string,
    placement: StaticPlacement,
    guides: { x: number[]; y: number[] } = { x: [], y: [] },
  ) => {
    pendingLiveRef.current = { name, placement, guides };
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const pending = pendingLiveRef.current;
      if (!pending) return;
      setLiveName(pending.name);
      setLivePlacement(pending.placement);
      setSnapGuides(pending.guides);
    });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || !pageSize.height) return;
    const dx = (event.clientX - interaction.originX) / scale;
    const dyScreen = (event.clientY - interaction.originY) / scale;
    const dyPdf = -dyScreen;

    if (interaction.kind === "move") {
      if (!interaction.moved && Math.hypot(dx, dyScreen) < 1.5) return;
      if (!interaction.moved) {
        interaction.moved = true;
        setDragging(true);
      }
      const { placement, guides } = movePlacementInteractive(
        interaction.startPlacement,
        dx,
        dyPdf,
        othersFor(interaction.name),
        pageSize,
      );
      scheduleLive(interaction.name, placement, guides);
      return;
    }

    const resized = resizePlacementWithoutOverlap(
      interaction.startPlacement,
      interaction.edge,
      dx,
      dyPdf,
      othersFor(interaction.name),
      pageSize,
    );
    scheduleLive(interaction.name, resized);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (!interaction) return;

    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const pending = pendingLiveRef.current;
    let finalPlacement =
      pending && pending.name === interaction.name
        ? pending.placement
        : livePlacement && liveName === interaction.name
          ? livePlacement
          : interaction.startPlacement;

    if (interaction.kind === "move" && interaction.moved) {
      finalPlacement = separateFromOthers(finalPlacement, othersFor(interaction.name), pageSize);
    }

    if (interaction.moved) {
      onMoveField(interaction.name, finalPlacement);
    }

    interactionRef.current = null;
    pendingLiveRef.current = null;
    setLiveName(null);
    setLivePlacement(null);
    setSnapGuides({ x: [], y: [] });
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore if capture was already released.
    }
  };

  const commitName = () => {
    if (!selected) return;
    const next = nameValue.trim();
    setNameDraftFor(null);
    if (!next || next === selected.name) return;
    onRenameField(selected.name, next);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "Escape") {
        if (placing) {
          setPlacing(false);
          event.preventDefault();
          return;
        }
        if (selectedField && !typing) {
          onSelectField(null);
          event.preventDefault();
        }
        return;
      }

      if (typing) return;

      if ((event.key === "Delete" || event.key === "Backspace") && selectedField) {
        event.preventDefault();
        onRemoveField(selectedField);
        return;
      }

      if (!selected?.placement || !pageSize.height) return;
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      let next = { ...selected.placement };
      if (event.key === "ArrowLeft") next.x -= step;
      if (event.key === "ArrowRight") next.x += step;
      if (event.key === "ArrowUp") next.y += step;
      if (event.key === "ArrowDown") next.y -= step;
      const others = pageFields
        .filter((field) => field.name !== selected.name)
        .map((field) => field.placement);
      next = separateFromOthers(next, others, pageSize);
      onMoveField(selected.name, next);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    placing,
    selected,
    selectedField,
    pageSize,
    pageFields,
    onSelectField,
    onRemoveField,
    onMoveField,
  ]);

  const toolbarDisabled = !selected;

  return (
    <div className="placement-preview">
      <div className="placement-preview-header">
        <div>
          <h4>Place fields on the PDF</h4>
          <p>
            {fields.length
              ? "Select a field to edit its mapping and text style. Drag fields on the PDF to position them, or click Add field to place a new one."
              : "No fields yet. Click Add field, then click the PDF where the text should appear."}
          </p>
        </div>
        <div className="placement-preview-actions">
          {pageCount > 1 && (
            <div className="placement-page-nav" role="navigation" aria-label="PDF pages">
              <button
                type="button"
                className="placement-page-btn"
                disabled={safePageIndex === 0}
                aria-label="Previous page"
                onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              <label className="placement-page-label">
                <span className="sr-only">Page number</span>
                <select
                  value={safePageIndex}
                  onChange={(event) => setPageIndex(Number(event.target.value))}
                  aria-label="Select PDF page"
                >
                  {Array.from({ length: pageCount }, (_, index) => (
                    <option key={index} value={index}>
                      Page {index + 1}
                      {fieldCountsByPage[index] ? ` (${fieldCountsByPage[index]})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="placement-page-btn"
                disabled={safePageIndex >= pageCount - 1}
                aria-label="Next page"
                onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className={`placement-toolbar${toolbarDisabled ? " is-disabled" : ""}`}
        role="toolbar"
        aria-label="Field editor"
      >
        <label className="placement-toolbar-field placement-toolbar-name">
          <span className="sr-only">Field name</span>
          <input
            ref={nameInputRef}
            type="text"
            placeholder="Field name"
            value={toolbarDisabled ? "" : nameValue}
            disabled={toolbarDisabled}
            onChange={(event) => {
              if (!selected) return;
              setNameDraftFor(selected.name);
              setNameDraft(event.target.value);
            }}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitName();
              }
            }}
          />
        </label>

        <label className="placement-toolbar-field">
          <span className="sr-only">CSV column</span>
          <select
            value={selected ? mapping[selected.name] || "" : ""}
            disabled={toolbarDisabled}
            onChange={(event) => {
              if (!selected) return;
              onMapField(selected.name, event.target.value);
            }}
          >
            {selected?.type === "checkbox" ? (
              <>
                <option value="">Unchecked</option>
                <option value={CHECKBOX_ALWAYS}>Always check</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    When “{header}” is true
                  </option>
                ))}
              </>
            ) : (
              <>
                <option value="">Do not fill</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>

        <label className="placement-toolbar-field">
          <span className="sr-only">Font family</span>
          <select
            value={selected?.placement?.fontFamily || "helvetica"}
            disabled={toolbarDisabled || selected?.type === "checkbox"}
            onChange={(event) => {
              if (!selected) return;
              onStyleField(selected.name, {
                fontFamily: event.target.value as PlacementFontFamily,
              });
            }}
          >
            {PLACEMENT_FONT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="placement-toolbar-field placement-toolbar-size">
          <span className="sr-only">Font size</span>
          <select
            value={String(selected?.placement?.fontSize || "")}
            disabled={toolbarDisabled || selected?.type === "checkbox"}
            onChange={(event) => {
              if (!selected) return;
              const raw = event.target.value;
              onStyleField(selected.name, { fontSize: raw ? Number(raw) : "" });
            }}
          >
            <option value="">Auto</option>
            {PLACEMENT_FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={`placement-toolbar-icon${selected?.placement?.bold ? " is-active" : ""}`}
          disabled={toolbarDisabled || selected?.type === "checkbox"}
          aria-pressed={Boolean(selected?.placement?.bold)}
          title="Bold"
          aria-label="Bold"
          onClick={() => {
            if (!selected) return;
            onStyleField(selected.name, { bold: !selected.placement?.bold });
          }}
        >
          <Bold size={15} />
        </button>

        <div className="placement-align-group" role="group" aria-label="Alignment">
          {PLACEMENT_ALIGN_OPTIONS.map((option) => {
            const Icon =
              option.value === "left" ? AlignLeft : option.value === "center" ? AlignCenter : AlignRight;
            const active = (selected?.placement?.align || "left") === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`placement-toolbar-icon${active ? " is-active" : ""}`}
                disabled={toolbarDisabled || selected?.type === "checkbox"}
                aria-pressed={active}
                title={option.label}
                aria-label={`Align ${option.label.toLowerCase()}`}
                onClick={() => {
                  if (!selected) return;
                  onStyleField(selected.name, { align: option.value });
                }}
              >
                <Icon size={15} />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="placement-toolbar-icon"
          disabled={toolbarDisabled}
          title="Duplicate field"
          aria-label="Duplicate field"
          onClick={() => {
            if (!selected || !pageReady) return;
            onDuplicateField(selected.name, pageSize);
          }}
        >
          <Copy size={15} />
        </button>

        <button
          type="button"
          className="placement-toolbar-icon is-danger"
          disabled={toolbarDisabled}
          title="Delete field"
          aria-label="Delete field"
          onClick={() => {
            if (!selected) return;
            onRemoveField(selected.name);
          }}
        >
          <Trash2 size={15} />
        </button>

        <button
          type="button"
          className={`placement-add-btn${placing ? " is-active" : ""}`}
          disabled={!pageReady}
          aria-pressed={placing}
          onClick={() => {
            if (!pageReady) return;
            setPlacing((current) => !current);
            onSelectField(null);
          }}
        >
          <Plus size={15} />
          {placing ? "Click on PDF to place field" : "Add field"}
        </button>
      </div>

      {placing ? (
        <p className="placement-mode-hint" role="status">
          Click anywhere on the PDF to place a new field. Press Escape to cancel.
        </p>
      ) : null}

      {error ? (
        <p className="placement-preview-error">{error}</p>
      ) : (
        <>
          <div
            ref={stageRef}
            className={`placement-stage${placing ? " is-placing" : ""}`}
            onPointerDown={(event) => {
              if (placing) {
                event.preventDefault();
                placeAtClientPoint(event.clientX, event.clientY);
                return;
              }
              if (event.target === event.currentTarget || event.target === canvasRef.current) {
                onSelectField(null);
              }
            }}
          >
            <canvas ref={canvasRef} className="placement-canvas" />
            {pageReady &&
              snapGuides.x.map((x) => (
                <div
                  key={`gx-${x}`}
                  className="placement-snap-guide vertical"
                  style={{ left: x * scale }}
                />
              ))}
            {pageReady &&
              snapGuides.y.map((y) => (
                <div
                  key={`gy-${y}`}
                  className="placement-snap-guide horizontal"
                  style={{ top: (pageSize.height - y) * scale }}
                />
              ))}
            {pageReady &&
              pageFields.map((field) => {
                const placement =
                  livePlacement && liveName === field.name ? livePlacement : field.placement;
                const box = toCanvas(placement);
                const sample = sampleValues[field.name] || "";
                const active = selectedField === field.name;
                const mapped = mapping[field.name] || "";
                return (
                  <div
                    key={field.name}
                    className={`placement-anchor ${active ? "active" : ""} ${
                      field.type
                    } ${mapped ? "mapped" : "unmapped"} ${
                      dragging && active ? "dragging" : ""
                    }`}
                    style={{
                      left: box.x,
                      top: box.y,
                      width: box.width,
                      height: box.height,
                    }}
                    title={`${field.name}${mapped ? ` → ${mapped}` : " (unmapped)"}`}
                    onPointerDown={(event) => beginMove(event, field)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onClick={() => onSelectField(field.name)}
                  >
                    <span className="placement-fill-outline" aria-hidden="true" />
                    <span className="placement-chip">
                      {mapped ? field.name : "Unmapped"}
                    </span>
                    {sample && mapped && mapped !== CHECKBOX_ALWAYS ? (
                      <span
                        className="placement-box-sample"
                        style={{
                          fontFamily:
                            placement.fontFamily === "times"
                              ? "Times New Roman, Times, serif"
                              : placement.fontFamily === "courier"
                                ? "Courier New, Courier, monospace"
                                : placement.fontFamily === "noto"
                                  ? "Noto Sans, Arial, sans-serif"
                                  : "Helvetica, Arial, sans-serif",
                          // Match PDF points × canvas scale so preview size ≈ download size.
                          fontSize: `${Math.max(6, (placement.fontSize || 12) * scale)}px`,
                          fontWeight: placement.bold ? 700 : 400,
                          justifyContent:
                            placement.align === "center"
                              ? "center"
                              : placement.align === "right"
                                ? "flex-end"
                                : "flex-start",
                          textAlign: placement.align || "left",
                        }}
                      >
                        {sample}
                      </span>
                    ) : null}
                    {active ? (
                      <>
                        <button
                          type="button"
                          className="placement-handle handle-e"
                          aria-label={`Resize ${field.name} width`}
                          onPointerDown={(event) => beginResize(event, field, "e")}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={onPointerUp}
                        />
                        <button
                          type="button"
                          className="placement-handle handle-w"
                          aria-label={`Resize ${field.name} from left`}
                          onPointerDown={(event) => beginResize(event, field, "w")}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={onPointerUp}
                        />
                        <button
                          type="button"
                          className="placement-handle handle-n"
                          aria-label={`Resize ${field.name} height`}
                          onPointerDown={(event) => beginResize(event, field, "n")}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={onPointerUp}
                        />
                        <button
                          type="button"
                          className="placement-handle handle-s"
                          aria-label={`Resize ${field.name} from bottom`}
                          onPointerDown={(event) => beginResize(event, field, "s")}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={onPointerUp}
                        />
                      </>
                    ) : null}
                  </div>
                );
              })}
          </div>
          {!pageReady && !error && (
            <p className="placement-preview-note">Loading page {safePageIndex + 1}…</p>
          )}
          {pageReady && pageFields.length === 0 && !placing && (
            <p className="placement-preview-note">
              No fields on page {safePageIndex + 1}. Click Add field, then click the PDF where the text should appear.
            </p>
          )}
        </>
      )}
    </div>
  );
}
