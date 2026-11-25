"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Cpu, ShieldCheck, Sparkles, X } from "lucide-react";
import { Dropzone } from "@/components/Dropzone";
import { ExportToolbar } from "@/components/ExportToolbar";
import {
  ImageCompare,
  type BackgroundPreviewMode,
} from "@/components/ImageCompare";
import { ModelProgress } from "@/components/ModelProgress";
import {
  applyMaskAndExportPng,
  downloadPngBlob,
  ensureBrowserCompatibleImage,
  isLikelyHeicFile,
  prepareImageForAI,
} from "@/lib/image-utils";
import type {
  ExecutionDevice,
  MaskOutputPayload,
  WorkerRequestMessage,
  WorkerResponseMessage,
} from "@/types/worker.types";

interface FileDownloadState {
  loaded: number;
  total: number;
  progress: number;
  done: boolean;
}

const BACKGROUND_HEX: Record<BackgroundPreviewMode, string | null> = {
  transparent: null,
  white: "#ffffff",
  black: "#000000",
};

function buildOutputFilename(originalName?: string): string {
  if (!originalName) return "snapbg-cutout.png";
  const lastDot = originalName.lastIndexOf(".");
  const base = lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
  return `${base}-nobg.png`;
}

export default function HomePage() {
  const workerRef = useRef<Worker | null>(null);
  const jobCounterRef = useRef(0);
  const activeJobIdRef = useRef<string | null>(null);
  const sourceFileRef = useRef<File | null>(null);
  const lastMaskRef = useRef<MaskOutputPayload | null>(null);
  const transparentBlobRef = useRef<Blob | null>(null);
  const fileProgressRef = useRef<Record<string, FileDownloadState>>({});

  const originalUrlRef = useRef<string | null>(null);
  const processedUrlRef = useRef<string | null>(null);

  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
    wasResized?: boolean;
  } | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [backgroundPreview, setBackgroundPreview] =
    useState<BackgroundPreviewMode>("transparent");

  const [isProcessing, setIsProcessing] = useState(false);
  const [isConvertingHeic, setIsConvertingHeic] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [device, setDevice] = useState<ExecutionDevice | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isInitializingEngine, setIsInitializingEngine] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [loadedBytes, setLoadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);

  const setSafeOriginalUrl = useCallback((nextUrl: string | null) => {
    if (originalUrlRef.current) {
      URL.revokeObjectURL(originalUrlRef.current);
    }
    originalUrlRef.current = nextUrl;
    setOriginalUrl(nextUrl);
  }, []);

  const setSafeProcessedUrl = useCallback((nextUrl: string | null) => {
    if (processedUrlRef.current) {
      URL.revokeObjectURL(processedUrlRef.current);
    }
    processedUrlRef.current = nextUrl;
    setProcessedUrl(nextUrl);
  }, []);

  const updateAggregateProgress = useCallback(() => {
    const entries = Object.values(fileProgressRef.current);
    if (entries.length === 0) return;

    let sumLoaded = 0;
    let sumTotal = 0;
    let sumPercent = 0;

    for (const entry of entries) {
      sumLoaded += entry.loaded;
      sumTotal += entry.total;
      sumPercent += entry.done ? 100 : entry.progress;
    }

    setLoadedBytes(sumLoaded);
    setTotalBytes(sumTotal);

    const aggregate =
      sumTotal > 0
        ? (sumLoaded / sumTotal) * 100
        : sumPercent / entries.length;

    setModelProgress(Math.min(100, Math.round(aggregate)));
    if (aggregate >= 99.5) {
      setIsInitializingEngine(true);
    }
  }, []);

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/bg-remover.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = async (event: MessageEvent<WorkerResponseMessage>) => {
      const msg = event.data;

      if (msg.device) {
        setDevice(msg.device);
      }

      if (msg.status === "initiate") {
        setIsModelLoading(true);
        setIsInitializingEngine(false);
        const key = msg.file || msg.name || "model";
        if (!fileProgressRef.current[key]) {
          fileProgressRef.current[key] = {
            loaded: 0,
            total: 0,
            progress: 0,
            done: false,
          };
        }
        setActiveFile(msg.file || msg.name || null);
      } else if (msg.status === "progress") {
        setIsModelLoading(true);
        const key = msg.file || msg.name || "model";
        fileProgressRef.current[key] = {
          loaded: msg.loaded ?? 0,
          total: msg.total ?? 0,
          progress: msg.progress,
          done: false,
        };
        setActiveFile(msg.file || msg.name || null);
        updateAggregateProgress();
      } else if (msg.status === "done") {
        const key = msg.file || msg.name || "model";
        const existing = fileProgressRef.current[key];
        fileProgressRef.current[key] = {
          loaded: existing?.total ?? existing?.loaded ?? 0,
          total: existing?.total ?? 0,
          progress: 100,
          done: true,
        };
        updateAggregateProgress();
      } else if (msg.status === "ready") {
        setIsModelLoading(false);
        setIsInitializingEngine(false);
        setModelProgress(100);
        setDevice(msg.device);
      } else if (msg.status === "complete") {
        if (msg.id !== activeJobIdRef.current) return;
        const sourceFile = sourceFileRef.current;
        if (!sourceFile) return;

        try {
          lastMaskRef.current = msg.mask;
          const pngBlob = await applyMaskAndExportPng(sourceFile, msg.mask);
          if (msg.id !== activeJobIdRef.current) return;

          transparentBlobRef.current = pngBlob;
          setSafeProcessedUrl(URL.createObjectURL(pngBlob));
          setDurationMs(msg.durationMs);
        } catch (err) {
          const errorMessage =
            err instanceof Error
              ? err.message
              : "Failed to composite transparent PNG.";
          setError(errorMessage);
        } finally {
          if (msg.id === activeJobIdRef.current) {
            setIsProcessing(false);
          }
        }
      } else if (msg.status === "error") {
        if (msg.id && msg.id !== activeJobIdRef.current) return;
        setIsModelLoading(false);
        setIsInitializingEngine(false);
        setIsProcessing(false);
        setError(msg.error);
      }
    };

    worker.onerror = (event) => {
      setIsModelLoading(false);
      setIsInitializingEngine(false);
      setIsProcessing(false);
      setError(event.message || "AI Web Worker encountered an unexpected error.");
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
      if (originalUrlRef.current) {
        URL.revokeObjectURL(originalUrlRef.current);
        originalUrlRef.current = null;
      }
      if (processedUrlRef.current) {
        URL.revokeObjectURL(processedUrlRef.current);
        processedUrlRef.current = null;
      }
    };
  }, [setSafeProcessedUrl, updateAggregateProgress]);

  const handleImageSelect = useCallback(
    async (rawFile: File) => {
      const worker = workerRef.current;
      if (!worker) {
        setError("AI Worker is not ready yet. Please refresh and try again.");
        return;
      }

      const jobId = String(++jobCounterRef.current);
      activeJobIdRef.current = jobId;
      sourceFileRef.current = null;
      lastMaskRef.current = null;
      transparentBlobRef.current = null;

      setError(null);
      setDurationMs(null);
      setDimensions(null);
      setSafeProcessedUrl(null);
      setSafeOriginalUrl(null);

      let file = rawFile;
      if (isLikelyHeicFile(rawFile)) {
        setIsConvertingHeic(true);
      }

      try {
        file = await ensureBrowserCompatibleImage(rawFile);
        if (activeJobIdRef.current !== jobId) return;
      } catch (err) {
        if (activeJobIdRef.current !== jobId) return;
        setError(
          err instanceof Error ? err.message : "Failed to convert HEIC image.",
        );
        return;
      } finally {
        if (activeJobIdRef.current === jobId) {
          setIsConvertingHeic(false);
        }
      }

      sourceFileRef.current = file;
      setIsProcessing(true);
      setSafeOriginalUrl(URL.createObjectURL(file));

      try {
        const prepared = await prepareImageForAI(file);
        if (activeJobIdRef.current !== jobId) return;

        setDimensions({
          width: prepared.originalWidth,
          height: prepared.originalHeight,
          wasResized: prepared.wasResized,
        });

        const message: WorkerRequestMessage = {
          type: "process",
          id: jobId,
          image: {
            buffer: prepared.buffer,
            width: prepared.width,
            height: prepared.height,
          },
        };

        worker.postMessage(message, [prepared.buffer]);
      } catch (err) {
        if (activeJobIdRef.current !== jobId) return;
        setIsProcessing(false);
        setError(
          err instanceof Error ? err.message : "Failed to prepare image for AI.",
        );
      }
    },
    [setSafeOriginalUrl, setSafeProcessedUrl],
  );

  const handleDownload = useCallback(async () => {
    const sourceFile = sourceFileRef.current;
    const mask = lastMaskRef.current;
    if (!sourceFile || !mask) return;

    const filename = buildOutputFilename(sourceFile.name);

    if (backgroundPreview === "transparent" && transparentBlobRef.current) {
      downloadPngBlob(transparentBlobRef.current, filename);
      return;
    }

    setIsExporting(true);
    try {
      const blob = await applyMaskAndExportPng(sourceFile, mask, {
        backgroundColor: BACKGROUND_HEX[backgroundPreview],
      });
      downloadPngBlob(blob, filename);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to export PNG image.",
      );
    } finally {
      setIsExporting(false);
    }
  }, [backgroundPreview]);

  const handleReset = useCallback(() => {
    activeJobIdRef.current = null;
    sourceFileRef.current = null;
    lastMaskRef.current = null;
    transparentBlobRef.current = null;
    setIsProcessing(false);
    setDurationMs(null);
    setDimensions(null);
    setError(null);
    setSafeOriginalUrl(null);
    setSafeProcessedUrl(null);
  }, [setSafeOriginalUrl, setSafeProcessedUrl]);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-sky-50/70 via-white to-blue-50/40 text-slate-900">
      <header className="border-b border-sky-100 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-blue-500/25">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                SnapBG
              </h1>
              <p className="text-xs text-slate-500">
                Client-Side AI Background Remover
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              100% Client-Side • Zero Uploads
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-medium text-blue-700">
              <Cpu className="h-3.5 w-3.5 text-blue-600" />
              {device === "webgpu"
                ? "WebGPU Accelerated"
                : device === "wasm"
                  ? "WASM Engine"
                  : "On-Device AI"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-8 sm:px-6">
        <ModelProgress
          isVisible={isModelLoading}
          progress={modelProgress}
          activeFile={activeFile}
          loadedBytes={loadedBytes}
          totalBytes={totalBytes}
          device={device}
          isInitializingEngine={isInitializingEngine}
        />

        {error && originalUrl && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="rounded-lg p-1 text-rose-500 hover:bg-rose-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {!originalUrl ? (
          <Dropzone
            onImageSelect={handleImageSelect}
            disabled={isProcessing || isConvertingHeic}
            error={error}
            statusText={
              isConvertingHeic ? "Converting HEIC image locally..." : null
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            <ImageCompare
              originalUrl={originalUrl}
              processedUrl={processedUrl}
              backgroundPreview={backgroundPreview}
              isProcessing={isProcessing}
              dimensions={dimensions}
              durationMs={durationMs}
            />
            <ExportToolbar
              backgroundPreview={backgroundPreview}
              onBackgroundChange={setBackgroundPreview}
              onDownload={handleDownload}
              onReset={handleReset}
              isExporting={isExporting}
              disabled={isProcessing || !processedUrl}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-sky-100 bg-white/70 py-4 text-center text-xs text-slate-500">
        Powered locally by BRIA RMBG-1.4 &amp; Transformers.js — No images are
        ever sent to a server.
      </footer>
    </div>
  );
}
