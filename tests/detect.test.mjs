import assert from 'node:assert/strict';
import test from 'node:test';
import { proposeMasks } from '../static/panel/src/masks/detect.js';

const line = (text, x = 40, y = 100, width = text.length * 10) => ({ text, confidence: 0.9, bounds: { x, y, width, height: 22 } });
const one = (text) => proposeMasks([line(text)]);

test('leaves the error and ordinary text readable', () => {
  const keep = [
    'ERR-PAYMENT-502', 'ERR_PAYMENT_GATEWAY_502', 'Sign-in', 'real-time sync', 'Auto-retry in 30s', 'Order ORD-88213-IN',
    'Checkout v2.4.1-beta', '2026-11-25 14:02:11', 'ap-south-1', 'HTTP 502 Bad Gateway', 'Amount 4,999.00 INR',
    'Request ID missing', 'Request failed after 3 attempts', 'Invoice 2026-000123456',
  ];
  for (const text of keep) assert.deepEqual(one(text), [], text);
});

test('suggests phones, email, test card, secret and shaped IDs', () => {
  const cases = [
    ['+91 98765 43210', 'PHONE'],
    ['(202) 555-0147', 'PHONE'],
    ['Mobile: 98765 43210', 'PHONE'],
    ['priya.nair@example.com', 'EMAIL'],
    ['4111 1111 1111 1111', 'CARD'],
    ['sk_live_DEMO_0123456789', 'SECRET'],
    ['req_8f3a9c2e71b4', 'REQUEST_ID'],
    ['Trace ID: DEMO-2026-1124', 'REQUEST_ID'],
    ['x-request-id: 7f9c2a10b3', 'REQUEST_ID'],
  ];
  for (const [text, type] of cases) assert.deepEqual(one(text).map((m) => m.type), [type], text);
});

test('finds a value to the right of, or below, its label', () => {
  const right = proposeMasks([line('Request ID', 40, 100), line('DEMO-2026-1124', 300, 100)]);
  assert.equal(right[0].text, 'DEMO-2026-1124');
  const below = proposeMasks([line('Request ID', 40, 100), line('DEMO-2026-1124', 40, 128)]);
  assert.equal(below[0].type, 'REQUEST_ID');
});

test('masks only the value part of a longer line and keeps its shape', () => {
  const [m] = one('Customer phone +91 98765 43210 (primary)');
  assert.equal(m.maskLabel, '+XX XXXXX XXXXX');
  assert.ok(m.bounds.x > 40 && m.bounds.width < 'Customer phone +91 98765 43210 (primary)'.length * 10);
});
