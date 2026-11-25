function clampBox(bounds, width, height) {
  const x = Math.max(0, Math.min(width - 1, Math.round(bounds.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(bounds.y)));
  const w = Math.max(1, Math.min(width - x, Math.round(bounds.width)));
  const h = Math.max(1, Math.min(height - y, Math.round(bounds.height)));
  return { x, y, width: w, height: h };
}

export function drawMaskedImage(sourceCanvas, masks) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);

  for (const mask of masks) {
    if (mask.selected === false) continue;
    const b = clampBox(mask.bounds, width, height);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(b.x, b.y, b.width, b.height);
    const label = mask.maskLabel || 'REDACTED';
    ctx.fillStyle = '#f4f4f4';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const fontSize = Math.max(10, Math.min(18, Math.floor(b.height * 0.55)));
    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillText(label, b.x + b.width / 2, b.y + b.height / 2, b.width - 4);
  }
  return out;
}

export function cropRegion(sourceCanvas, bounds) {
  const b = clampBox(bounds, sourceCanvas.width, sourceCanvas.height);
  const c = document.createElement('canvas');
  c.width = b.width;
  c.height = b.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(sourceCanvas, b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);
  return c;
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('png_encode_failed'));
      else resolve(blob);
    }, 'image/png');
  });
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const i = result.indexOf(',');
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
}

/** Pixel check helper: every pixel in region must differ from source (opaque cover). */
export function regionFullyCovered(sourceCanvas, maskedCanvas, bounds) {
  const b = clampBox(bounds, sourceCanvas.width, sourceCanvas.height);
  const s = sourceCanvas.getContext('2d').getImageData(b.x, b.y, b.width, b.height).data;
  const m = maskedCanvas.getContext('2d').getImageData(b.x, b.y, b.width, b.height).data;
  let covered = 0;
  const total = b.width * b.height;
  for (let i = 0; i < s.length; i += 4) {
    const same = s[i] === m[i] && s[i + 1] === m[i + 1] && s[i + 2] === m[i + 2];
    if (!same) covered += 1;
  }
  return { covered, total, ratio: covered / total };
}
