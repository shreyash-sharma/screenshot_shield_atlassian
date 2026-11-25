import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ortDist = path.join(root, 'static/panel/node_modules/onnxruntime-web/dist');
const dest = path.join(root, 'static/panel/public/ort');
fs.mkdirSync(dest, { recursive: true });

// PaddleOCR/ORT requests the jsep pair when backend=wasm in current onnxruntime-web.
const files = [
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.mjs',
];

for (const name of files) {
  const from = path.join(ortDist, name);
  if (!fs.existsSync(from)) {
    console.warn('missing', from);
    continue;
  }
  fs.copyFileSync(from, path.join(dest, name));
  console.log('copied', name, fs.statSync(path.join(dest, name)).size);
}

// Drop unused non-jsep wasm to stay under Forge's 100MB resource limit.
const unused = path.join(dest, 'ort-wasm-simd-threaded.wasm');
if (fs.existsSync(unused)) {
  fs.unlinkSync(unused);
  console.log('removed unused ort-wasm-simd-threaded.wasm');
}

const models = path.join(root, 'static/panel/public/models');
for (const name of ['det.tar', 'rec.tar']) {
  const p = path.join(models, name);
  console.log(name, fs.existsSync(p) ? fs.statSync(p).size : 'MISSING');
}
