"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, MoveHorizontal } from "lucide-react";

export type BackgroundPreviewMode = "transparent" | "white" | "black";

export interface ImageCompareProps {
  originalUrl: string;
  processedUrl: string | null;
  backgroundPreview: BackgroundPreviewMode;
  isProcessing: boolean;
  dimensions?: {
    width: number;
    height: number;
    wasResized?: boolean;
  } | null;
  durationMs?: number | null;
}

const PREVIEW_BG_CLASS: Record<BackgroundPreviewMode, string> = {
  transparent: "bg-checkerboard",
  white: "bg-white",
  black: "bg-black",
};

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
}

export function ImageCompare({
  originalUrl,
  processedUrl,
  backgroundPreview,
  isProcessing,
  dimensions,
  durationMs,
}: ImageCompareProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const updatePositionFromClientX = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, ratio)));
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isProcessing || !processedUrl) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    updatePositionFromClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    updatePositionFromClientX(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  };

  const handleSliderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setPosition((prev) => Math.max(0, prev - step));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setPosition((prev) => Math.min(100, prev + step));
    }
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex w-full justify-center rounded-2xl border border-sky-100 bg-sky-50/50 p-4 shadow-xs sm:p-6">
        {isProcessing || !processedUrl ? (
          <div className="relative inline-flex max-w-full items-center justify-center overflow-hidden rounded-xl border border-sky-100 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={originalUrl}
              alt="Original image being processed"
              className="block max-h-[65vh] w-auto max-w-full object-contain opacity-65"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/75 backdrop-blur-xs">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-200">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <p className="text-sm font-medium text-slate-900">
                Removing background locally...
              </p>
            </div>
          </div>
        ) : (
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`relative inline-block max-w-full cursor-ew-resize overflow-hidden rounded-xl border border-slate-200 select-none touch-none shadow-lg shadow-slate-900/5 ${PREVIEW_BG_CLASS[backgroundPreview]}`}
          >
            {/* Base layer: Processed cutout */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={processedUrl}
              alt="Background removed cutout"
              draggable={false}
              className="block max-h-[65vh] h-auto w-auto max-w-full pointer-events-none"
            />

            {/* Top layer: Original image clipped to split position */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={originalUrl}
              alt="Original image"
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain pointer-events-none"
              style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
            />

            {/* Corner labels */}
            <span className="pointer-events-none absolute top-3 left-3 rounded-md bg-slate-950/75 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-xs">
              Original
            </span>
            <span className="pointer-events-none absolute top-3 right-3 rounded-md bg-slate-950/75 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-xs">
              Cutout
            </span>

            {/* Vertical divider + handle */}
            <div
              role="slider"
              tabIndex={0}
              aria-label="Before and after comparison slider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(position)}
              onKeyDown={handleSliderKeyDown}
              className="absolute inset-y-0 -translate-x-1/2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              style={{ left: `${position}%` }}
            >
              <div className="h-full w-0.5 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.45)]" />
              <div className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-blue-500 bg-white text-blue-600 shadow-md">
                <MoveHorizontal className="h-4 w-4" />
              </div>
            </div>
          </div>
        )}
      </div>

      {(dimensions || durationMs != null) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            {dimensions && (
              <span className="tabular-nums">
                Resolution: {dimensions.width} × {dimensions.height} px
              </span>
            )}
            {dimensions?.wasResized && (
              <span className="text-slate-400">
                (AI inference scaled to ≤2048px; cutout exported at full resolution)
              </span>
            )}
          </div>
          {durationMs != null && !isProcessing && (
            <span className="tabular-nums font-medium text-blue-600">
              Processed in {formatDuration(durationMs)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
