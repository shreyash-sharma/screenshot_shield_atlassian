const { kvs } = require('@forge/kvs');
const api = require('@forge/api');
const { route } = require('@forge/api');
const { randomUUID } = require('node:crypto');
const { encryptBuffer, decryptToBuffer, generateKey, keyToBase64, keyFromBase64 } = require('../crypto/aes');
const { shotKey, cropKey, secretKey, grantKey, issueIndexKey } = require('../storage/keys');
const { evaluateRevealAccess, canRevoke, buildExpiry } = require('../access/grants');

const DEFAULT_HOURS = 72;
const MAX_HOURS = 720;
const MAX_CROP_BYTES = 100_000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JSON_HEADERS = { headers: { Accept: 'application/json' } };

async function currentUser() {
  const res = await api.asUser().requestJira(route`/rest/api/3/myself`, JSON_HEADERS);
  if (!res.ok) throw new Error(`Failed to resolve signed-in user (${res.status})`);
  return res.json();
}

async function userCanBrowseIssue(issueIdOrKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueIdOrKey}?fields=id`, JSON_HEADERS);
  return res.ok;
}

/** The work item's attachments, or null when they cannot be read (so nothing is ever purged on a failed call). */
async function issueAttachments(issueKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=attachment`, JSON_HEADERS);
  if (!res.ok) return null;
  const list = (await res.json())?.fields?.attachment;
  return Array.isArray(list) ? list : null;
}

async function issueAttachment(issueKey, attachmentId) {
  return ((await issueAttachments(issueKey)) || []).find((a) => String(a.id) === String(attachmentId)) || null;
}

/** Deleting the attachment in Jira deletes everything the app held for it. */
async function purge(shot) {
  await kvs.deleteSecret(secretKey(shot.id));
  for (const key of [cropKey(shot.id), grantKey(shot.id), shotKey(shot.id)]) await kvs.delete(key);
  for (const ref of [shot.issueId, shot.issueKey]) {
    const index = issueIndexKey(String(ref));
    const ids = (await kvs.get(index)) || [];
    if (ids.includes(shot.id)) await kvs.set(index, ids.filter((id) => id !== shot.id));
  }
}

async function collectShotIds(issueId, issueKey) {
  const refs = [...new Set([issueId, issueKey].filter(Boolean).map(String))];
  const lists = await Promise.all(refs.map(async (ref) => (await kvs.get(issueIndexKey(ref))) || []));
  return [...new Set(lists.flat())];
}

async function addIssueShotId(issueRef, shotId) {
  const key = issueIndexKey(String(issueRef));
  const ids = (await kvs.get(key)) || [];
  if (!ids.includes(shotId)) await kvs.set(key, [shotId, ...ids].slice(0, 50));
}

function publicShotView(shot, grant, actorAccountId) {
  const access = evaluateRevealAccess({ screenshot: shot, grant, actorAccountId, hasIssueAccess: true });
  return {
    id: shot.id,
    issueKey: shot.issueKey,
    attachmentId: shot.attachmentId,
    filename: shot.filename || null,
    width: shot.width,
    height: shot.height,
    publisherDisplayName: shot.publisherDisplayName || null,
    protectedBounds: shot.protectedBounds || null,
    createdAt: shot.createdAt,
    grant: grant
      ? {
          recipientDisplayName: grant.recipientDisplayName || null,
          expiresAt: grant.expiresAt,
          revoked: Boolean(grant.revoked),
        }
      : null,
    canReveal: access.allowed,
    canRevoke: canRevoke({ screenshot: shot, actorAccountId }),
    revealDeniedReason: access.allowed ? null : access.reason,
  };
}

async function resolveDisplayName(accountId) {
  try {
    const res = await api.asUser().requestJira(route`/rest/api/3/user?accountId=${accountId}`, JSON_HEADERS);
    if (!res.ok) return null;
    return (await res.json()).displayName || null;
  } catch {
    return null;
  }
}

async function listScreenshots(req) {
  const { issueId, issueKey } = req.payload || {};
  if (!issueId && !issueKey) return { ok: false, error: 'issueId_required' };
  const me = await currentUser();
  if (!(await userCanBrowseIssue(issueKey || issueId))) return { ok: false, error: 'no_issue_access' };
  const items = [];
  const attachments = await issueAttachments(issueKey || issueId);
  for (const id of await collectShotIds(issueId, issueKey)) {
    const shot = await kvs.get(shotKey(id));
    if (!shot || shot.status !== 'active') continue;
    // An index entry must never surface a screenshot from another issue.
    if (shot.issueKey !== String(issueKey) && shot.issueId !== String(issueId)) continue;
    if (attachments && !attachments.some((a) => String(a.id) === shot.attachmentId)) {
      await purge(shot);
      continue;
    }
    items.push(publicShotView(shot, await kvs.get(grantKey(id)), me.accountId));
  }
  return { ok: true, items, me: { accountId: me.accountId, displayName: me.displayName } };
}

async function listAssignable(req) {
  const { issueKey, query = '' } = req.payload || {};
  if (!issueKey) return { ok: false, error: 'issueKey_required' };
  const q = String(query || '').slice(0, 80);
  const res = await api
    .asUser()
    .requestJira(route`/rest/api/3/user/assignable/search?issueKey=${issueKey}&maxResults=50&query=${q}`, JSON_HEADERS);
  if (!res.ok) return { ok: false, error: 'user_search_failed', status: res.status };
  const users = await res.json();
  // Names only: the picker does not need anyone's email address.
  return {
    ok: true,
    users: (users || [])
      .filter((u) => u.accountType === undefined || u.accountType === 'atlassian')
      .map((u) => ({ accountId: u.accountId, displayName: u.displayName })),
  };
}

function validBounds(b, width, height) {
  return (
    b &&
    [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
    b.x >= 0 &&
    b.y >= 0 &&
    b.width >= 1 &&
    b.height >= 1 &&
    b.x < width &&
    b.y < height
  );
}

async function publishScreenshot(req) {
  const p = req.payload || {};
  for (const key of ['issueId', 'issueKey', 'attachmentId', 'width', 'height']) {
    if (p[key] == null || p[key] === '') return { ok: false, error: `${key}_required` };
  }
  const width = Number(p.width);
  const height = Number(p.height);
  const recipient = p.recipientAccountId ? String(p.recipientAccountId) : null;

  const me = await currentUser();
  if (!(await userCanBrowseIssue(p.issueKey))) return { ok: false, error: 'no_issue_access' };
  const attachment = await issueAttachment(p.issueKey, p.attachmentId);
  if (!attachment) return { ok: false, error: 'attachment_not_on_issue' };
  if (attachment.author?.accountId && attachment.author.accountId !== me.accountId) {
    return { ok: false, error: 'attachment_not_yours' };
  }

  // A crop is only accepted, and only stored, when someone is allowed to reveal it.
  let crop = null;
  let protectedBounds = null;
  if (recipient) {
    if (!validBounds(p.protectedBounds, width, height)) return { ok: false, error: 'protectedBounds_invalid' };
    crop = Buffer.from(String(p.cropPngBase64 || ''), 'base64');
    if (crop.length < 32 || !crop.subarray(0, 4).equals(PNG_MAGIC)) return { ok: false, error: 'crop_invalid' };
    if (crop.length > MAX_CROP_BYTES) return { ok: false, error: 'crop_too_large' };
    protectedBounds = p.protectedBounds;
  }

  const id = randomUUID();
  const shot = {
    id,
    issueId: String(p.issueId),
    issueKey: String(p.issueKey),
    attachmentId: String(p.attachmentId),
    filename: attachment.filename || null,
    width,
    height,
    publisherAccountId: me.accountId,
    publisherDisplayName: me.displayName || null,
    protectedBounds,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  let grant = null;
  if (recipient) {
    const key = generateKey();
    await kvs.set(cropKey(id), encryptBuffer(crop, key));
    await kvs.setSecret(secretKey(id), keyToBase64(key));
    const hours = Math.min(MAX_HOURS, Number(p.expiryHours) || DEFAULT_HOURS);
    grant = {
      screenshotId: id,
      recipientAccountId: recipient,
      recipientDisplayName: (await resolveDisplayName(recipient)) || null,
      issuerAccountId: me.accountId,
      expiresAt: buildExpiry(hours),
      revoked: false,
    };
    await kvs.set(grantKey(id), grant);
  }

  // The record is written last, so a failure above never leaves a half-granted screenshot listed.
  await kvs.set(shotKey(id), shot);
  await addIssueShotId(shot.issueId, id);
  await addIssueShotId(shot.issueKey, id);

  return { ok: true, screenshot: publicShotView(shot, grant, me.accountId) };
}

const deny = (reason) => ({ ok: false, error: 'denied', reason });

async function revealScreenshot(req) {
  const { screenshotId } = req.payload || {};
  if (!screenshotId) return { ok: false, error: 'screenshotId_required' };

  const me = await currentUser();
  const shot = await kvs.get(shotKey(screenshotId));
  if (!shot) return { ok: false, error: 'not_found' };

  const access = evaluateRevealAccess({
    screenshot: shot,
    grant: await kvs.get(grantKey(screenshotId)),
    actorAccountId: me.accountId,
    hasIssueAccess: await userCanBrowseIssue(shot.issueKey),
  });
  // Never return crop or key material on deny.
  if (!access.allowed) return deny(access.reason);

  const keyB64 = await kvs.getSecret(secretKey(screenshotId));
  if (!keyB64) return deny('key_missing');
  const encrypted = await kvs.get(cropKey(screenshotId));
  if (!encrypted) return deny('crop_missing');
  let png;
  try {
    png = decryptToBuffer(encrypted, keyFromBase64(keyB64));
  } catch {
    return deny('decrypt_failed');
  }
  return { ok: true, bounds: shot.protectedBounds, cropPngBase64: png.toString('base64') };
}

async function revokeGrant(req) {
  const { screenshotId } = req.payload || {};
  if (!screenshotId) return { ok: false, error: 'screenshotId_required' };

  const me = await currentUser();
  const shot = await kvs.get(shotKey(screenshotId));
  if (!shot) return { ok: false, error: 'not_found' };
  if (!canRevoke({ screenshot: shot, actorAccountId: me.accountId })) return { ok: false, error: 'not_publisher' };

  const grant = await kvs.get(grantKey(screenshotId));
  if (grant) {
    grant.revoked = true;
    grant.revokedAt = new Date().toISOString();
    await kvs.set(grantKey(screenshotId), grant);
  }
  // Destroy the key and the ciphertext: the stored value cannot be revealed again.
  await kvs.deleteSecret(secretKey(screenshotId));
  await kvs.delete(cropKey(screenshotId));

  return { ok: true, screenshot: publicShotView(shot, grant, me.accountId) };
}

module.exports = { listScreenshots, listAssignable, publishScreenshot, revealScreenshot, revokeGrant };
