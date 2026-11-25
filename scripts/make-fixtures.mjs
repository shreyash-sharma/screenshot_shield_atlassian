// Renders fixtures/source/checkout.html to a PNG with headless Chrome. No OCR output is ever written by hand.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const out = path.join(root, 'fixtures', 'payment-failed.png');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'));
const result = spawnSync(chrome, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`,
  '--window-size=1280,640', '--force-device-scale-factor=1', `--screenshot=${out}`,
  pathToFileURL(path.join(root, 'fixtures', 'source', 'checkout.html')).href,
], { stdio: 'inherit', timeout: 60000 });
fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
if (result.status !== 0 || !fs.existsSync(out)) process.exit(1);
console.log('wrote', out);
