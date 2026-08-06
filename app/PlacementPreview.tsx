"use client";

import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { StaticPlacement } from "./static-pdf";

type PreviewField = {
  name: string;
  type: string;
  placement?: StaticPlacement;
};

type PlacementPreviewProps = {
  pdfFile: File;
  fields: PreviewField[];
  selectedField: string | null;
  sampleValues: Record<string, string>;
  onSelectField: (name: string) => void;
  onMoveField: (name: string, placement: StaticPlacement) => void;
};

const PREVIEW_PAGE_INDEX = 0;

export function PlacementPreview({
  pdfFile,
  fields,
  selectedField,
  sampleValues,
  onSelectField,
  onMoveField,
}: PlacementPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [error, setError] = useState("");
  const dragRef = useRef<{
    name: string;
    originX: number;
    originY: number;
    startPlacement: StaticPlacement;
  } | null>(null);

  const pageFields = useMemo(
    () =>
      fields.filter(
        (field): field is PreviewField & { placement: StaticPlacement } =>
          Boolean(field.placement) && field.placement!.pageIndex === PREVIEW_PAGE_INDEX,
      ),
    [fields],
  );
  const hiddenOtherPages = fields.some(
    (field) => field.placement && field.placement.pageIndex !== PREVIEW_PAGE_INDEX,
  );

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
        const page = await pdfDocument.getPage(PREVIEW_PAGE_INDEX + 1);
        const base = page.getViewport({ scale: 1 });
        const fitScale = Math.min(1.15, 720 / base.width);
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
        setPageSize({ width: base.width, height: base.height });
        setScale(fitScale);
        await loadingTask.destroy();
      } catch (renderError) {
        if (!cancelled) {
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
  }, [pdfFile]);

  const toCanvas = (placement: StaticPlacement) => ({
    x: placement.x * scale,
    y: (pageSize.height - placement.y - placement.height) * scale,
    width: placement.width * scale,
    height: Math.max(14, placement.height * scale),
  });

  const onPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    field: PreviewField & { placement: StaticPlacement },
  ) => {
    event.preventDefault();
    onSelectField(field.name);
    dragRef.current = {
      name: field.name,
      originX: event.clientX,
      originY: event.clientY,
      startPlacement: { ...field.placement },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || !pageSize.height) return;
    const dx = (event.clientX - drag.originX) / scale;
    const dy = (event.clientY - drag.originY) / scale;
    onMoveField(drag.name, {
      ...drag.startPlacement,
      x: Math.max(0, drag.startPlacement.x + dx),
      y: Math.max(0, drag.startPlacement.y - dy),
    });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore if capture was already released.
      }
    }
  };

  if (!pageFields.length && !hiddenOtherPages) return null;

  return (
    <div className="placement-preview">
      <div className="placement-preview-header">
        <div>
          <h4>Align writing areas</h4>
          <p>Drag boxes onto the blank lines. Sample text from your first CSV row is shown.</p>
        </div>
      </div>
      {error ? (
        <p className="placement-preview-error">{error}</p>
      ) : (
        <>
          <div className="placement-stage">
            <canvas ref={canvasRef} className="placement-canvas" />
            {pageSize.height > 0 &&
              pageFields.map((field) => {
                const box = toCanvas(field.placement);
                const sample = sampleValues[field.name] || field.name;
                const active = selectedField === field.name;
                return (
                  <button
                    key={field.name}
                    type="button"
                    className={`placement-box ${active ? "active" : ""} ${field.type}`}
                    style={{
                      left: box.x,
                      top: box.y,
                      width: box.width,
                      height: box.height,
                    }}
                    title={`Drag to position “${field.name}”`}
                    aria-label={`Reposition ${field.name}`}
                    onPointerDown={(event) => onPointerDown(event, field)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onClick={() => onSelectField(field.name)}
                  >
                    <span className="placement-box-label">{sample}</span>
                  </button>
                );
              })}
          </div>
          {hiddenOtherPages && (
            <p className="placement-preview-note">
              Fields on later pages keep their detected positions. This preview shows page 1 only.
            </p>
          )}
        </>
      )}
    </div>
  );
}
