import type { MaskOutputPayload } from "@/types/worker.types";

export const MAX_AI_DIMENSION = 2048;

export interface ResizedDimensions {
  width: number;
  height: number;
  wasResized: boolean;
}

export interface PreparedImageForAI {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  wasResized: boolean;
}

export interface CompositeOptions {
  /** Optional background fill color (e.g. '#ffffff' or '#000000'). Omit or pass null for transparent PNG. */
  backgroundColor?: string | null;
}

const HEIC_EXTENSION_REGEX = /\.(heic|heif)$/i;

/**
 * Checks whether a filename has a .heic or .heif extension.
 */
export function isHeicFilename(name: string): boolean {
  return HEIC_EXTENSION_REGEX.test(name);
}

/**
 * Checks whether a File is likely HEIC/HEIF based on extension or MIME type.
 */
export function isLikelyHeicFile(file: File): boolean {
  return (
    isHeicFilename(file.name) ||
    file.type === "image/heic" ||
    file.type === "image/heif"
  );
}

/**
 * Checks whether a File is a supported image (standard browser image MIME or .heic/.heif).
 */
export function isSupportedImageFile(file: File): boolean {
  return file.type.startsWith("image/") || isHeicFilename(file.name);
}

/**
 * Converts a HEIC/HEIF file into a browser-decodable PNG File entirely client-side
 * using lazy-loaded WebAssembly (`heic-to/next`). Non-HEIC images are returned as-is.
 */
export async function ensureBrowserCompatibleImage(file: File): Promise<File> {
  if (!isLikelyHeicFile(file) && file.type.startsWith("image/")) {
    return file;
  }

  const { isHeic, heicTo } = await import("heic-to/next");
  const heic = await isHeic(file);

  if (!heic) {
    if (file.type.startsWith("image/")) {
      return file;
    }
    throw new Error("Unsupported image format.");
  }

  const convertedBlob = await heicTo({
    blob: file,
    type: "image/png",
  });

  const lastDot = file.name.lastIndexOf(".");
  const baseName = lastDot > 0 ? file.name.slice(0, lastDot) : file.name;

  return new File([convertedBlob], `${baseName}.png`, {
    type: convertedBlob.type || "image/png",
    lastModified: file.lastModified,
  });
}

/**
 * Calculates target dimensions keeping aspect ratio, scaling down only if
 * the longest side exceeds maxDimension.
 */
export function calculateResizedDimensions(
  width: number,
  height: number,
  maxDimension: number = MAX_AI_DIMENSION,
): ResizedDimensions {
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid image dimensions: ${width}x${height}`);
  }

  const longestSide = Math.max(width, height);
  if (longestSide <= maxDimension) {
    return { width, height, wasResized: false };
  }

  const scale = maxDimension / longestSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    wasResized: true,
  };
}

/**
 * Loads a File or Blob into an HTMLImageElement and immediately revokes the
 * temporary Object URL once loaded or errored.
 */
export function loadImageElement(source: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(source);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode image file."));
    };

    img.src = objectUrl;
  });
}

function getSourceDimensions(
  source: HTMLImageElement | HTMLCanvasElement,
): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }
  return { width: source.width, height: source.height };
}

/**
 * Prepares an image for AI inference: downscales if either dimension exceeds
 * maxDimension (default 2048px) to prevent OOM on mobile browsers, and returns
 * a transferable RGBA ArrayBuffer.
 */
export async function prepareImageForAI(
  source: File | Blob,
  maxDimension: number = MAX_AI_DIMENSION,
): Promise<PreparedImageForAI> {
  const img = await loadImageElement(source);
  const originalWidth = img.naturalWidth || img.width;
  const originalHeight = img.naturalHeight || img.height;

  const { width, height, wasResized } = calculateResizedDimensions(
    originalWidth,
    originalHeight,
    maxDimension,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Unable to acquire 2D canvas context.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);

  return {
    buffer: imageData.data.buffer,
    width,
    height,
    originalWidth,
    originalHeight,
    wasResized,
  };
}

/**
 * Composites a single-channel AI alpha mask onto the original full-resolution
 * image using HTML5 Canvas. Optionally fills a solid background color behind
 * the cutout.
 */
export async function compositeMaskWithImage(
  source: File | Blob | HTMLImageElement | HTMLCanvasElement,
  mask: MaskOutputPayload,
  options?: CompositeOptions,
): Promise<HTMLCanvasElement> {
  const drawable =
    source instanceof Blob ? await loadImageElement(source) : source;
  const { width: originalWidth, height: originalHeight } =
    getSourceDimensions(drawable);

  // 1. Render alpha mask onto an offscreen canvas
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = mask.width;
  maskCanvas.height = mask.height;

  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) {
    throw new Error("Unable to acquire 2D context for mask canvas.");
  }

  const maskImageData = maskCtx.createImageData(mask.width, mask.height);
  const rgba = maskImageData.data;
  const pixelCount = mask.width * mask.height;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    rgba[offset] = 255;
    rgba[offset + 1] = 255;
    rgba[offset + 2] = 255;
    rgba[offset + 3] = mask.data[i];
  }
  maskCtx.putImageData(maskImageData, 0, 0);

  // 2. Composite mask onto full-resolution output canvas
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = originalWidth;
  outputCanvas.height = originalHeight;

  const outCtx = outputCanvas.getContext("2d");
  if (!outCtx) {
    throw new Error("Unable to acquire 2D context for output canvas.");
  }

  outCtx.drawImage(drawable, 0, 0, originalWidth, originalHeight);

  outCtx.globalCompositeOperation = "destination-in";
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(maskCanvas, 0, 0, originalWidth, originalHeight);

  if (options?.backgroundColor) {
    outCtx.globalCompositeOperation = "destination-over";
    outCtx.fillStyle = options.backgroundColor;
    outCtx.fillRect(0, 0, originalWidth, originalHeight);
  }

  outCtx.globalCompositeOperation = "source-over";
  return outputCanvas;
}

/**
 * Encodes an HTMLCanvasElement as a lossless PNG Blob.
 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode canvas to PNG Blob."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

/**
 * Composites an alpha mask onto the original image and exports a PNG Blob.
 */
export async function applyMaskAndExportPng(
  source: File | Blob | HTMLImageElement | HTMLCanvasElement,
  mask: MaskOutputPayload,
  options?: CompositeOptions,
): Promise<Blob> {
  const canvas = await compositeMaskWithImage(source, mask, options);
  return canvasToPngBlob(canvas);
}

/**
 * Triggers a browser file download for a PNG Blob and cleans up the Object URL.
 */
export function downloadPngBlob(
  blob: Blob,
  filename: string = "snapbg-cutout.png",
): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
