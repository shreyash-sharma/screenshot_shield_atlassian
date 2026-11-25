// Pure access decisions: no storage or network, so they can be tested on their own.
function evaluateRevealAccess({
  screenshot,
  grant,
  actorAccountId,
  hasIssueAccess,
  now = new Date(),
}) {
  if (!hasIssueAccess) {
    return deny('no_issue_access');
  }
  if (!screenshot || screenshot.status !== 'active') {
    return deny('not_active');
  }
  if (!grant) {
    return deny('no_grant');
  }
  if (grant.revoked) {
    return deny('revoked');
  }
  if (grant.recipientAccountId !== actorAccountId) {
    return deny('not_recipient');
  }
  if (grant.screenshotId !== screenshot.id) {
    return deny('grant_mismatch');
  }
  if (new Date(grant.expiresAt).getTime() <= now.getTime()) {
    return deny('expired');
  }
  return { allowed: true, reason: 'ok' };
}

function deny(reason) {
  return { allowed: false, reason };
}

function canRevoke({ screenshot, actorAccountId }) {
  return Boolean(screenshot && screenshot.publisherAccountId === actorAccountId);
}

function buildExpiry(hours, now = new Date()) {
  const ms = Math.max(1, Number(hours) || 72) * 60 * 60 * 1000;
  return new Date(now.getTime() + ms).toISOString();
}

module.exports = {
  evaluateRevealAccess,
  canRevoke,
  buildExpiry,
};
