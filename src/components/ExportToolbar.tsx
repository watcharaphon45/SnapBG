"use client";

import { Download, Loader2, RotateCcw } from "lucide-react";
import type { BackgroundPreviewMode } from "@/components/ImageCompare";

export interface ExportToolbarProps {
  backgroundPreview: BackgroundPreviewMode;
  onBackgroundChange: (mode: BackgroundPreviewMode) => void;
  onDownload: () => void;
  onReset: () => void;
  isExporting: boolean;
  disabled: boolean;
}

const BACKGROUND_OPTIONS: {
  mode: BackgroundPreviewMode;
  label: string;
  swatchClass: string;
}[] = [
  { mode: "transparent", label: "Transparent", swatchClass: "bg-checkerboard" },
  { mode: "white", label: "White", swatchClass: "bg-white" },
  { mode: "black", label: "Black", swatchClass: "bg-black" },
];

export function ExportToolbar({
  backgroundPreview,
  onBackgroundChange,
  onDownload,
  onReset,
  isExporting,
  disabled,
}: ExportToolbarProps) {
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-4 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm shadow-blue-950/5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium uppercase tracking-wider text-slate-500">
          Background
        </span>
        {BACKGROUND_OPTIONS.map(({ mode, label, swatchClass }) => {
          const isActive = backgroundPreview === mode;
          return (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => onBackgroundChange(mode)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                isActive
                  ? "border-blue-500 bg-sky-50 text-blue-700 ring-2 ring-blue-500/20"
                  : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50/50 hover:text-slate-900"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-4 w-4 rounded border border-slate-300 ${swatchClass}`}
              />
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50/60"
        >
          <RotateCcw className="h-4 w-4" />
          New Image
        </button>

        <button
          type="button"
          disabled={disabled || isExporting}
          onClick={onDownload}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {isExporting ? "Exporting..." : "Download PNG"}
        </button>
      </div>
    </div>
  );
}
