"use client";

import { Cpu, Download, Loader2 } from "lucide-react";
import type { ExecutionDevice } from "@/types/worker.types";

export interface ModelProgressProps {
  isVisible: boolean;
  progress: number;
  activeFile?: string | null;
  loadedBytes?: number;
  totalBytes?: number;
  device?: ExecutionDevice | null;
  isInitializingEngine?: boolean;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent >= 2 ? 1 : 0)} ${units[exponent]}`;
}

function getFileBasename(filePath?: string | null): string | null {
  if (!filePath) return null;
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

export function ModelProgress({
  isVisible,
  progress,
  activeFile,
  loadedBytes = 0,
  totalBytes = 0,
  device,
  isInitializingEngine = false,
}: ModelProgressProps) {
  if (!isVisible) return null;

  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const fileName = getFileBasename(activeFile);
  const hasByteCounts = totalBytes > 0;

  return (
    <section
      aria-live="polite"
      className="w-full rounded-2xl border border-sky-200 bg-white p-4 shadow-sm shadow-blue-950/5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-blue-600">
            {isInitializingEngine ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4 animate-pulse" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900">
              {isInitializingEngine
                ? "Initializing AI Engine..."
                : "Downloading AI Model (RMBG-1.4)"}
            </p>
            <p className="text-xs text-slate-500">
              Cached locally in your browser after first load.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {device && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              <Cpu className="h-3 w-3 text-blue-600" />
              {device === "webgpu" ? "WebGPU" : "WASM"}
            </span>
          )}
          <span className="text-sm font-semibold tabular-nums text-blue-600">
            {clampedProgress}%
          </span>
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-sky-100">
        <div
          className={`h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-200 ${
            isInitializingEngine && clampedProgress === 0 ? "animate-pulse w-full" : ""
          }`}
          style={
            isInitializingEngine && clampedProgress === 0
              ? undefined
              : { width: `${clampedProgress}%` }
          }
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="truncate max-w-[70%]">
          {fileName ? `Loading: ${fileName}` : "Preparing model weights..."}
        </span>
        {hasByteCounts && (
          <span className="tabular-nums">
            {formatBytes(loadedBytes)} / {formatBytes(totalBytes)}
          </span>
        )}
      </div>
    </section>
  );
}
