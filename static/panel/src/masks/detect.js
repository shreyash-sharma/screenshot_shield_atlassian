// Suggests masks from OCR lines. Deliberately narrow: a screenshot exists to show an error, so error codes,
// order numbers, versions and ordinary hyphenated words must stay readable. A request or trace ID is only
// suggested when it is labelled as one, or has an unmistakable shape. The person reviews every suggestion.
import isCreditCard from 'validator/lib/isCreditCard.js';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SECRET_RE = /\b(?:sk_(?:live|test)_[A-Za-z0-9_]{6,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,})/g;
const CARD_RE = /\b\d(?:[ -]?\d){12,18}\b/g;
const PHONE_RES = [
  /\+\d{1,3}[\s.-]?(?:\(\d{1,4}\)[\s.-]?)?\d(?:[\s.-]?\d){6,12}\b/g, // international, with a country code
  /\(\d{3}\)\s?\d{3}[\s.-]?\d{4}\b/g, // (202) 555-0147
  /\b\d{3}[.-]\d{3}[.-]\d{4}\b/g, // 202-555-0147
];
const SHAPED_ID_RES = [
  /\b(?:req|trace|txn|corr)_[A-Za-z0-9]{6,}\b/gi,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
];
const ID_LABEL = /\b(?:x-)?(?:request|trace|correlation|req)[\s_-]*id\b\s*[:=#]?\s*/i;
const PHONE_LABEL = /\b(?:phone|mobile|tel|contact number)\b\s*[:=]?\s*/i;
const ID_VALUE = /^["']?([A-Za-z0-9][A-Za-z0-9_.-]{5,63})/;

function isCard(text) {
  const compact = text.replace(/[\s-]/g, '');
  return /^\d{13,19}$/.test(compact) && isCreditCard(compact);
}

const looksLikeId = (v) => /\d/.test(v) && v.length >= 6;

/** The slice of an OCR line box that holds characters [start, end). */
function slice(bounds, text, start, end) {
  const len = Math.max(text.length, 1);
  if (start <= 0 && end >= len) return pad(bounds, 3, 3);
  const per = bounds.width / len;
  // Proportional estimate, widened because fonts are not monospaced.
  return pad({ x: bounds.x + start * per, y: bounds.y, width: (end - start) * per, height: bounds.height }, per * 0.9, 3);
}

function pad(b, px, py) {
  const x = Math.max(0, Math.round(b.x - px));
  const y = Math.max(0, Math.round(b.y - py));
  return { x, y, width: Math.round(b.width + (b.x - x) + px), height: Math.round(b.height + (b.y - y) + py) };
}

export function maskLabelFor(type, value) {
  if (type === 'EMAIL') return 'xxxx@xxxx';
  if (type === 'CARD') return 'XXXX XXXX XXXX XXXX';
  if (type === 'SECRET') return '••••••••';
  if (type === 'PHONE' || type === 'REQUEST_ID') return String(value).replace(/[A-Za-z0-9]/g, 'X');
  return '████';
}

function sameLine(a, b) {
  const ay = a.bounds.y + a.bounds.height / 2;
  const by = b.bounds.y + b.bounds.height / 2;
  return Math.abs(ay - by) < Math.max(a.bounds.height, b.bounds.height) * 0.6;
}

/** The nearest OCR item to the right of a label, or directly below it (form layouts). */
function neighbour(label, items, test) {
  const right = items
    .filter((it) => it !== label && sameLine(label, it) && it.bounds.x >= label.bounds.x + label.bounds.width - 4)
    .sort((a, b) => a.bounds.x - b.bounds.x);
  const below = items
    .filter((it) => {
      const gap = it.bounds.y - (label.bounds.y + label.bounds.height);
      return it !== label && gap >= -2 && gap < label.bounds.height * 1.6 && Math.abs(it.bounds.x - label.bounds.x) < label.bounds.height * 2;
    })
    .sort((a, b) => a.bounds.y - b.bounds.y);
  return [right[0], below[0]].find((it) => it && test(it.text)) || null;
}

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y + a.height / 2 > b.y && a.y + a.height / 2 < b.y + b.height;

export function proposeMasks(ocrItems) {
  const items = ocrItems || [];
  const out = [];
  let seq = 0;
  const add = (type, value, bounds, confidence) => {
    if (out.some((m) => overlaps(m.bounds, bounds))) return;
    out.push({
      id: `${type.toLowerCase()}-${++seq}`,
      type,
      bounds,
      text: value,
      confidence,
      selected: true,
      maskLabel: maskLabelFor(type, value),
    });
  };
  const scan = (type, re, accept = () => true) => {
    for (const item of items) {
      for (const m of item.text.matchAll(re)) {
        if (accept(m[0])) add(type, m[0], slice(item.bounds, item.text, m.index, m.index + m[0].length), item.confidence);
      }
    }
  };

  // Labelled request and trace IDs first, so a numeric ID is never mistaken for a phone or card.
  for (const item of items) {
    const label = item.text.match(ID_LABEL);
    if (!label) continue;
    const rest = item.text.slice(label.index + label[0].length);
    const inline = rest.match(ID_VALUE);
    if (inline && looksLikeId(inline[1])) {
      const start = label.index + label[0].length + rest.indexOf(inline[1]);
      add('REQUEST_ID', inline[1], slice(item.bounds, item.text, start, start + inline[1].length), item.confidence);
      continue;
    }
    const value = neighbour(item, items, (t) => {
      const v = t.trim().match(ID_VALUE);
      return Boolean(v && looksLikeId(v[1]));
    });
    if (value) add('REQUEST_ID', value.text.trim(), pad(value.bounds, 3, 3), value.confidence);
  }
  for (const re of SHAPED_ID_RES) scan('REQUEST_ID', re);

  scan('SECRET', SECRET_RE);
  scan('EMAIL', EMAIL_RE);
  scan('CARD', CARD_RE, isCard);
  for (const re of PHONE_RES) scan('PHONE', re, (v) => !isCard(v));

  // A labelled number without a country code, for example "Mobile: 98765 43210".
  for (const item of items) {
    const label = item.text.match(PHONE_LABEL);
    if (!label) continue;
    const rest = item.text.slice(label.index + label[0].length);
    const m = rest.match(/^\d(?:[\s.-]?\d){7,12}/);
    if (m) {
      const start = label.index + label[0].length;
      add('PHONE', m[0], slice(item.bounds, item.text, start, start + m[0].length), item.confidence);
    }
  }

  return out.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
}
