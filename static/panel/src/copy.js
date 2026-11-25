// User-facing wording for reasons, errors, mask types and grant status.
const DENY_REASONS = {
  no_issue_access: 'You cannot access this work item.',
  not_active: 'This protected screenshot is not active.',
  no_grant: 'Nobody was given reveal access.',
  revoked: 'Reveal access was revoked.',
  not_recipient: 'Only the named person can reveal this value.',
  grant_mismatch: 'This grant does not match the screenshot.',
  expired: 'Reveal access has expired.',
  key_missing: 'Reveal access is no longer available.',
  crop_missing: 'The protected value is no longer stored.',
  decrypt_failed: 'The protected value could not be opened.',
  denied: 'Reveal denied.',
};

export function humanDenyReason(code) {
  if (!code) return 'Reveal denied.';
  return DENY_REASONS[code] || `Reveal denied (${code}).`;
}

const PUBLISH_ERRORS = {
  no_issue_access: 'You cannot access this work item.',
  attachment_not_on_issue: 'Jira did not list the new attachment on this work item. Try again.',
  attachment_not_yours: 'That attachment was uploaded by someone else.',
  crop_too_large: 'The revealable area is too large. Draw a tighter box around just the value.',
  crop_invalid: 'The revealable area could not be read. Draw the box again.',
};

export function humanPublishError(code) {
  return PUBLISH_ERRORS[code] || `Could not save (${code || 'unknown error'}).`;
}

const TYPE_LABELS = {
  PHONE: 'Phone',
  CARD: 'Card number',
  EMAIL: 'Email',
  SECRET: 'Secret key',
  REQUEST_ID: 'Request ID',
  MANUAL: 'Drawn by you',
};

export function typeLabel(type) {
  return TYPE_LABELS[type] || String(type || 'Mask');
}

export function shortDate(iso) {
  return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

/** Lozenge shown on each published screenshot: [tone, text]. */
export function grantStatus(shot, now = Date.now()) {
  if (!shot.grant) return ['neutral', 'Masked only'];
  if (shot.grant.revoked) return ['removed', 'Access revoked'];
  if (new Date(shot.grant.expiresAt).getTime() <= now) return ['moved', 'Access expired'];
  return ['success', `${shot.grant.recipientDisplayName || 'Named person'} can reveal`];
}
