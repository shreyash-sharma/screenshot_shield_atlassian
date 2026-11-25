// The backend actions, with Forge storage and the Jira API replaced by in-memory fakes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const store = new Map();
const secrets = new Map();
const kvs = {
  get: async (k) => (store.has(k) ? structuredClone(store.get(k)) : undefined),
  set: async (k, v) => void store.set(k, structuredClone(v)),
  delete: async (k) => void store.delete(k),
  getSecret: async (k) => secrets.get(k),
  setSecret: async (k, v) => void secrets.set(k, v),
  deleteSecret: async (k) => void secrets.delete(k),
};

let actor = 'shreyash';
const people = { shreyash: 'Shreyash', kritika: 'Kritika', sam: 'Sam' };
const attachments = [{ id: '100', filename: 'protected-KAN-1.png', author: { accountId: 'shreyash' } }];
const reply = (body, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => body });
const api = {
  route: (strings, ...values) => strings.reduce((a, s, i) => a + s + (values[i] ?? ''), ''),
  asUser: () => ({
    requestJira: async (url) => {
      if (url.startsWith('/rest/api/3/myself')) return reply({ accountId: actor, displayName: people[actor] });
      if (url.includes('fields=attachment')) return reply({ fields: { attachment: attachments } });
      if (url.includes('assignable/search')) {
        return reply([{ accountId: 'kritika', displayName: 'Kritika', emailAddress: 'kritika@example.com', accountType: 'atlassian' }]);
      }
      if (url.startsWith('/rest/api/3/user?')) return reply({ displayName: people[url.split('=')[1]] });
      return reply({});
    },
  }),
};

function fake(name, exports) {
  const path = require.resolve(name);
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
}
fake('@forge/kvs', { kvs });
fake('@forge/api', { ...api, default: api, __esModule: false });

const r = require('../src/resolvers/screenshots.js');
const CROP = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(60, 7)]).toString('base64');
const base = { issueId: '1', issueKey: 'KAN-1', attachmentId: '100', width: 800, height: 600 };
const as = (who, fn, payload) => {
  actor = who;
  return fn({ payload });
};
const bounds = { x: 10, y: 20, width: 100, height: 20 };
const publishWithGrant = () =>
  as('shreyash', r.publishScreenshot, { ...base, recipientAccountId: 'kritika', protectedBounds: bounds, cropPngBase64: CROP });

test('only the named person can reveal; the publisher and others get no pixels', async () => {
  const { screenshot } = await publishWithGrant();
  const ok = await as('kritika', r.revealScreenshot, { screenshotId: screenshot.id });
  assert.equal(ok.ok, true);
  assert.equal(ok.cropPngBase64, CROP);
  for (const who of ['shreyash', 'sam']) {
    const denied = await as(who, r.revealScreenshot, { screenshotId: screenshot.id });
    assert.equal(denied.reason, 'not_recipient');
    assert.equal(denied.cropPngBase64, undefined);
  }
});

test('revoke is publisher only and destroys the key and ciphertext', async () => {
  const { screenshot } = await publishWithGrant();
  assert.equal((await as('kritika', r.revokeGrant, { screenshotId: screenshot.id })).error, 'not_publisher');
  assert.equal((await as('shreyash', r.revokeGrant, { screenshotId: screenshot.id })).ok, true);
  assert.equal(secrets.has(`key:${screenshot.id}`), false);
  assert.equal(store.has(`crop:${screenshot.id}`), false);
  assert.equal((await as('kritika', r.revealScreenshot, { screenshotId: screenshot.id })).reason, 'revoked');
});

test('mask-only publishing stores no crop and no key', async () => {
  const { screenshot } = await as('shreyash', r.publishScreenshot, { ...base, cropPngBase64: CROP, protectedBounds: bounds });
  assert.equal(store.has(`crop:${screenshot.id}`), false);
  assert.equal(secrets.has(`key:${screenshot.id}`), false);
  assert.equal(screenshot.protectedBounds, null);
});

test('rejects someone else’s attachment, a non-PNG crop and an oversized crop', async () => {
  const other = await as('sam', r.publishScreenshot, base);
  assert.equal(other.error, 'attachment_not_yours');
  const grant = { ...base, recipientAccountId: 'kritika', protectedBounds: bounds };
  const notPng = await as('shreyash', r.publishScreenshot, { ...grant, cropPngBase64: Buffer.alloc(60).toString('base64') });
  assert.equal(notPng.error, 'crop_invalid');
  const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200_000)]).toString('base64');
  assert.equal((await as('shreyash', r.publishScreenshot, { ...grant, cropPngBase64: big })).error, 'crop_too_large');
});

test('the list shows who can reveal and never an email or key', async () => {
  const list = await as('kritika', r.listScreenshots, { issueId: '1', issueKey: 'KAN-1' });
  assert.ok(list.items.length >= 2);
  assert.ok(list.items.some((s) => s.canReveal && s.grant.recipientDisplayName === 'Kritika'));
  assert.equal(JSON.stringify(list).includes('ciphertext'), false);
  const users = await as('shreyash', r.listAssignable, { issueKey: 'KAN-1' });
  assert.deepEqual(users.users, [{ accountId: 'kritika', displayName: 'Kritika' }]);
});

test('deleting the Jira attachment removes the key, crop and entry', async () => {
  const { screenshot } = await publishWithGrant();
  const kept = attachments.splice(0, attachments.length);
  const list = await as('shreyash', r.listScreenshots, { issueId: '1', issueKey: 'KAN-1' });
  attachments.push(...kept);
  assert.deepEqual(list.items, []);
  assert.equal(secrets.has(`key:${screenshot.id}`), false);
  assert.equal(store.has(`crop:${screenshot.id}`), false);
  assert.equal(store.has(`shot:${screenshot.id}`), false);
});
