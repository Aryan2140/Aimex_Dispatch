// In-browser OCR using Tesseract.js v6 (WebAssembly). Runs entirely on the
// user's device; the recognized text never leaves the browser unless the
// operator chooses to save it as part of the order.

import { createWorker, PSM } from 'tesseract.js';

export type OcrLine = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

export type OcrResult = {
  text: string;
  lines: OcrLine[];
};

type TesseractWorker = {
  recognize: (image: Blob | string) => Promise<{
    data: {
      text?: string;
      blocks?: Array<{
        lines?: Array<{
          text?: string;
          confidence?: number;
          bbox?: { x0: number; y0: number; x1: number; y1: number };
        }>;
      }>;
    };
  }>;
  terminate: () => Promise<void>;
  setParameters: (params: Record<string, unknown>) => Promise<void>;
};

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(onProgress?: (p: number) => void): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = (await createWorker('eng', 1, {
        logger: (m: { status?: string; progress?: number }) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number' && onProgress) {
            onProgress(m.progress);
          }
        },
      })) as unknown as TesseractWorker;
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      return worker;
    })();
  }
  return workerPromise;
}

export async function runOcr(blob: Blob, onProgress?: (p: number) => void): Promise<OcrResult> {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(blob);
  const lines: OcrLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const line of block.lines ?? []) {
      const text = (line.text ?? '').trim();
      if (text) {
        lines.push({
          text,
          confidence: line.confidence ?? 0,
          bbox: line.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
        });
      }
    }
  }
  return {
    text: data.text ?? '',
    lines,
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (workerPromise) {
      void workerPromise.then((w) => w.terminate()).catch(() => {});
      workerPromise = null;
    }
  });
}
