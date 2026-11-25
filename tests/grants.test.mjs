import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { evaluateRevealAccess, canRevoke, buildExpiry } = require('../src/access/grants.js');

const shot = {
  id: 's1',
  status: 'active',
  publisherAccountId: 'shreyash',
};

const grant = {
  screenshotId: 's1',
  recipientAccountId: 'kritika',
  issuerAccountId: 'shreyash',
  expiresAt: buildExpiry(24),
  revoked: false,
};

test('recipient with issue access can reveal', () => {
  const r = evaluateRevealAccess({
    screenshot: shot,
    grant,
    actorAccountId: 'kritika',
    hasIssueAccess: true,
  });
  assert.equal(r.allowed, true);
});

test('publisher cannot reveal without being recipient', () => {
  const r = evaluateRevealAccess({
    screenshot: shot,
    grant,
    actorAccountId: 'shreyash',
    hasIssueAccess: true,
  });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'not_recipient');
});

test('denied response reasons never imply success', () => {
  for (const actor of ['shreyash', 'stranger']) {
    const r = evaluateRevealAccess({
      screenshot: shot,
      grant,
      actorAccountId: actor,
      hasIssueAccess: true,
    });
    assert.equal(r.allowed, false);
  }
});

test('revoked grant is denied', () => {
  const r = evaluateRevealAccess({
    screenshot: shot,
    grant: { ...grant, revoked: true },
    actorAccountId: 'kritika',
    hasIssueAccess: true,
  });
  assert.equal(r.reason, 'revoked');
});

test('expired grant is denied', () => {
  const r = evaluateRevealAccess({
    screenshot: shot,
    grant: { ...grant, expiresAt: new Date(Date.now() - 1000).toISOString() },
    actorAccountId: 'kritika',
    hasIssueAccess: true,
  });
  assert.equal(r.reason, 'expired');
});

test('no issue access is denied', () => {
  const r = evaluateRevealAccess({
    screenshot: shot,
    grant,
    actorAccountId: 'kritika',
    hasIssueAccess: false,
  });
  assert.equal(r.reason, 'no_issue_access');
});

test('only publisher can revoke', () => {
  assert.equal(canRevoke({ screenshot: shot, actorAccountId: 'shreyash' }), true);
  assert.equal(canRevoke({ screenshot: shot, actorAccountId: 'kritika' }), false);
});
