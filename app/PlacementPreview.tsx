"use client";

import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import {
  movePlacementWithoutOverlap,
  resizePlacementWithoutOverlap,
  type ResizeEdge,
} from "./placement-geometry";
import { CHECKBOX_ALWAYS, type StaticPlacement } from "./static-pdf";

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
  onMapField: (name: string, value: string) => void;
  onRemoveField: (name: string) => void;
  onAddField: (pageIndex: number, pageSize: { width: number; height: number }) => void;
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
  onMapField,
  onRemoveField,
  onAddField,
}: PlacementPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  /** Only show overlays once canvas matches this page (avoids page-switch misalignment). */
  const [renderedPageIndex, setRenderedPageIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const interactionRef = useRef<Interaction | null>(null);

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

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      setError("");
      try {
        const bytes = await pdfFile.arrayBuffer();
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
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
        // Explicit CSS pixel size prevents browser shrinking that desyncs overlays.
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

  /** Canvas geometry must match stored placement used by applyStaticPdfFields. */
  const toCanvas = (placement: StaticPlacement) => ({
    x: placement.x * scale,
    y: (pageSize.height - placement.y - placement.height) * scale,
    width: Math.max(1, placement.width * scale),
    height: Math.max(1, placement.height * scale),
  });

  const othersFor = (name: string) =>
    pageFields.filter((field) => field.name !== name).map((field) => field.placement);

  const beginMove = (
    event: ReactPointerEvent<HTMLElement>,
    field: PreviewField & { placement: StaticPlacement },
  ) => {
    if ((event.target as HTMLElement).closest("select,button,label,option,.placement-handle")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSelectField(field.name);
    setDragging(false);
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
      onMoveField(
        interaction.name,
        movePlacementWithoutOverlap(
          interaction.startPlacement,
          dx,
          dyPdf,
          othersFor(interaction.name),
          pageSize,
        ),
      );
      return;
    }

    onMoveField(
      interaction.name,
      resizePlacementWithoutOverlap(
        interaction.startPlacement,
        interaction.edge,
        dx,
        dyPdf,
        othersFor(interaction.name),
        pageSize,
      ),
    );
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (interactionRef.current) {
      interactionRef.current = null;
      setDragging(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore if capture was already released.
      }
    }
  };

  return (
    <div className="placement-preview">
      <div className="placement-preview-header">
        <div>
          <h4>Place fields on the PDF</h4>
          <p>
            Drag to place, drag the edges to resize. Fields stay clear of each other. Click a field
            to map or remove it.
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
          <button
            type="button"
            className="placement-add-btn"
            disabled={!pageReady}
            onClick={() => {
              if (!pageReady) return;
              onAddField(safePageIndex, pageSize);
            }}
          >
            <Plus size={15} />
            Add field
          </button>
        </div>
      </div>
      {error ? (
        <p className="placement-preview-error">{error}</p>
      ) : (
        <>
          <div
            className="placement-stage"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget || event.target === canvasRef.current) {
                onSelectField(null);
              }
            }}
          >
            <canvas ref={canvasRef} className="placement-canvas" />
            {pageReady &&
              pageFields.map((field) => {
                const box = toCanvas(field.placement);
                const sample = sampleValues[field.name] || "";
                const active = selectedField === field.name;
                const expanded = active && !dragging;
                const mapped = mapping[field.name] || "";
                const chromeBelow = box.y < 72;
                return (
                  <div
                    key={field.name}
                    className={`placement-anchor ${active ? "active" : ""} ${
                      expanded ? "expanded" : "collapsed"
                    } ${field.type} ${mapped ? "mapped" : "unmapped"} ${
                      chromeBelow ? "chrome-below" : "chrome-above"
                    }`}
                    style={{
                      left: box.x,
                      top: box.y,
                      width: box.width,
                      height: box.height,
                    }}
                    title={`${field.name} — drag to move, edges to resize`}
                    onPointerDown={(event) => beginMove(event, field)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onClick={() => onSelectField(field.name)}
                  >
                    <span className="placement-fill-outline" aria-hidden="true" />
                    <span className="placement-chip">{field.name}</span>
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
                    {expanded ? (
                      <div
                        className="placement-chrome"
                        style={{ width: Math.max(148, Math.min(220, box.width + 40)) }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <div className="placement-box-toolbar">
                          <span className="placement-box-name">{field.name}</span>
                          <button
                            type="button"
                            className="placement-remove"
                            title={`Remove “${field.name}”`}
                            aria-label={`Remove ${field.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onRemoveField(field.name);
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <label className="placement-map-wrap">
                          <span className="sr-only">CSV column for {field.name}</span>
                          {field.type === "checkbox" ? (
                            <select
                              value={mapped}
                              onChange={(event) => onMapField(field.name, event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <option value="">Unchecked</option>
                              <option value={CHECKBOX_ALWAYS}>Always check</option>
                              {headers.map((header) => (
                                <option key={header} value={header}>
                                  When “{header}” is true
                                </option>
                              ))}
                            </select>
                          ) : (
                            <select
                              value={mapped}
                              onChange={(event) => onMapField(field.name, event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <option value="">Do not fill</option>
                              {headers.map((header) => (
                                <option key={header} value={header}>
                                  {header}
                                </option>
                              ))}
                            </select>
                          )}
                        </label>
                        {sample && mapped && mapped !== CHECKBOX_ALWAYS ? (
                          <span className="placement-box-sample">{sample}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
          {!pageReady && !error && (
            <p className="placement-preview-note">Loading page {safePageIndex + 1}…</p>
          )}
          {pageReady && pageFields.length === 0 && (
            <p className="placement-preview-note">
              No fields on page {safePageIndex + 1}. Use Add field to place one, or open another page.
            </p>
          )}
        </>
      )}
    </div>
  );
}
