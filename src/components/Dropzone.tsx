"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ClipboardPaste, ImageIcon, ShieldCheck, Upload } from "lucide-react";

export interface DropzoneProps {
  onImageSelect: (file: File) => void;
  disabled?: boolean;
  error?: string | null;
}

const ACCEPTED_MIME_TYPES = "image/png,image/jpeg,image/webp,image/avif";

export function Dropzone({
  onImageSelect,
  disabled = false,
  error = null,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const validateAndSelect = useCallback(
    (file: File | null | undefined) => {
      if (!file || disabled) return;
      if (!file.type.startsWith("image/")) {
        setLocalError("Please select a valid image file (PNG, JPG, WebP, or AVIF).");
        return;
      }
      setLocalError(null);
      onImageSelect(file);
    },
    [disabled, onImageSelect],
  );

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (disabled) return;
      const items = event.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            validateAndSelect(file);
            return;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [disabled, validateAndSelect]);

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (disabled) return;

    const file = event.dataTransfer.files?.[0];
    validateAndSelect(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    validateAndSelect(file);
    event.target.value = "";
  };

  const openFilePicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  };

  const displayError = localError || error;

  return (
    <div className="w-full space-y-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload or drop an image to remove its background"
        aria-disabled={disabled}
        onClick={openFilePicker}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group relative flex min-h-[320px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
            : isDragging
              ? "border-blue-500 bg-sky-50 shadow-lg shadow-blue-500/10"
              : "border-sky-200 bg-white hover:border-blue-400 hover:bg-sky-50/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME_TYPES}
          disabled={disabled}
          onChange={handleFileChange}
          className="hidden"
        />

        <div
          className={`mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border transition-transform duration-200 ${
            isDragging
              ? "scale-105 border-blue-300 bg-blue-100 text-blue-700"
              : "border-sky-100 bg-sky-50 text-blue-600 group-hover:scale-105 group-hover:border-blue-200"
          }`}
        >
          <Upload className="h-7 w-7" />
        </div>

        <h2 className="text-lg font-semibold text-slate-900">
          {isDragging ? "Drop your image here" : "Drop an image, click to browse, or paste"}
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-slate-500">
          Remove backgrounds instantly in your browser. Images never leave your device.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-700">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1">
            <ImageIcon className="h-3.5 w-3.5 text-blue-600" />
            PNG, JPG, WebP
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1">
            <ClipboardPaste className="h-3.5 w-3.5 text-blue-600" />
            Ctrl+V to Paste
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            100% Local Processing
          </span>
        </div>
      </div>

      {displayError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{displayError}</span>
        </div>
      )}
    </div>
  );
}
