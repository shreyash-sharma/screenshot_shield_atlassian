import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { generateKey, encryptBuffer, decryptToBuffer } = require('../src/crypto/aes.js');

test('encrypt/decrypt round trip', () => {
  const key = generateKey();
  const plain = Buffer.from('DEMO-2026-1124-secret-pixels');
  const enc = encryptBuffer(plain, key);
  assert.equal(enc.algorithm, 'aes-256-gcm');
  assert.ok(enc.ivBase64);
  assert.ok(enc.tagBase64);
  const out = decryptToBuffer(enc, key);
  assert.equal(out.toString(), plain.toString());
});

test('wrong key fails closed', () => {
  const enc = encryptBuffer(Buffer.from('x'), generateKey());
  assert.throws(() => decryptToBuffer(enc, generateKey()));
});
