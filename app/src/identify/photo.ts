import type { PhotoCheck } from "./types";

const LONG_EDGE = 1600;
const JPEG_QUALITY = 0.85;
const ANALYSIS_EDGE = 320;

/** Mean luminance out of 255. The fixture photos read 82 to 151, the same photos at 25% brightness 20 to 37. */
export const DARK_BELOW = 40;
/** Variance of the Laplacian at ANALYSIS_EDGE px. The fixture photos read 673 and up, with a 6 px blur 23 to 74. */
export const BLURRED_BELOW = 80;

function drawScaled(source: ImageBitmap, longEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, longEdge / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** A JPEG data URL at most LONG_EDGE px on the long side. */
export async function preparePhoto(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    return drawScaled(bitmap, LONG_EDGE).toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}

export async function checkPhotoOnDevice(photo: string): Promise<PhotoCheck> {
  const bitmap = await createImageBitmap(await (await fetch(photo)).blob());
  try {
    const canvas = drawScaled(bitmap, ANALYSIS_EDGE);
    const { data, width, height } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    return assess(measure(data, width, height));
  } finally {
    bitmap.close();
  }
}

export type PhotoMeasure = { luminance: number; sharpness: number };

export function measure(rgba: Uint8ClampedArray, width: number, height: number): PhotoMeasure {
  const gray = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    const y = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
    gray[i] = y;
    sum += y;
  }

  let n = 0;
  let lapSum = 0;
  let lapSq = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = gray[i - 1]! + gray[i + 1]! + gray[i - width]! + gray[i + width]! - 4 * gray[i]!;
      lapSum += lap;
      lapSq += lap * lap;
      n++;
    }
  }
  const mean = n > 0 ? lapSum / n : 0;
  return { luminance: gray.length > 0 ? sum / gray.length : 0, sharpness: n > 0 ? lapSq / n - mean * mean : 0 };
}

export function assess({ luminance, sharpness }: PhotoMeasure): PhotoCheck {
  if (luminance < DARK_BELOW) return "dark";
  if (sharpness < BLURRED_BELOW) return "blurred";
  return "ok";
}
