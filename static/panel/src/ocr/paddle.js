import { PaddleOCR } from '@paddleocr/paddleocr-js';

let singleton = null;
let initPromise = null;

async function getOcr() {
  if (singleton) return singleton;
  if (initPromise) return initPromise;
  initPromise = PaddleOCR.create({
    textDetectionModelName: 'PP-OCRv6_tiny_det',
    textRecognitionModelName: 'PP-OCRv6_tiny_rec',
    textDetectionModelAsset: { url: './models/det.tar' },
    textRecognitionModelAsset: { url: './models/rec.tar' },
    ortOptions: {
      backend: 'wasm',
      // Resolve from the HTML page URL, not the JS chunk path under /assets/.
      wasmPaths: new URL('ort/', document.baseURI || window.location.href).href,
      numThreads: 1,
      simd: true,
      proxy: false,
      disableWasmProxy: true,
    },
    worker: false,
  }).then((ocr) => {
    singleton = ocr;
    return ocr;
  });
  return initPromise;
}

function polyToBounds(poly) {
  const xs = poly.map((p) => p[0] ?? p.x);
  const ys = poly.map((p) => p[1] ?? p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
  };
}

function normalizeItems(result) {
  const items = result?.items || [];
  return items.map((item, index) => {
    const poly = item.poly || item.box || [];
    return {
      id: `ocr-${index}`,
      text: String(item.text || '').trim(),
      confidence: Number(item.score ?? item.confidence ?? 0),
      poly,
      bounds: polyToBounds(poly),
    };
  });
}

export async function runOcr(source) {
  const ocr = await getOcr();
  const started = performance.now();
  const [result] = await ocr.predict(source);
  return {
    ms: Math.round(performance.now() - started),
    items: normalizeItems(result),
  };
}
