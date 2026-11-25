const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_LEN = 32;

function generateKey() {
  return randomBytes(KEY_LEN);
}

function encryptBuffer(plaintext, key) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: ALGO,
    ivBase64: iv.toString('base64'),
    tagBase64: tag.toString('base64'),
    ciphertextBase64: encrypted.toString('base64'),
  };
}

function decryptToBuffer(payload, key) {
  const iv = Buffer.from(payload.ivBase64, 'base64');
  const tag = Buffer.from(payload.tagBase64, 'base64');
  const ciphertext = Buffer.from(payload.ciphertextBase64, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function keyToBase64(key) {
  return Buffer.from(key).toString('base64');
}

function keyFromBase64(value) {
  return Buffer.from(value, 'base64');
}

module.exports = {
  generateKey,
  encryptBuffer,
  decryptToBuffer,
  keyToBase64,
  keyFromBase64,
};
