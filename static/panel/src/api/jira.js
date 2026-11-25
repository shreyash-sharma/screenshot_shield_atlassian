// The panel's calls out: Jira REST (attachments) and Forge invoke (the resolver).
import { invoke, requestJira, view } from '@forge/bridge';

export async function getIssueContext() {
  const ctx = await view.getContext();
  return {
    issueId: ctx.extension?.issue?.id || ctx.issueId,
    issueKey: ctx.extension?.issue?.key || ctx.issueKey,
    projectKey: ctx.extension?.project?.key || ctx.projectKey,
    localId: ctx.localId,
  };
}

export async function uploadMaskedPng(issueKey, blob, filename = 'protected-screenshot.png') {
  const form = new FormData();
  form.append('file', blob, filename);
  const res = await requestJira(`/rest/api/3/issue/${issueKey}/attachments`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-Atlassian-Token': 'no-check',
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upload_failed:${res.status}:${text.slice(0, 200)}`);
  }
  const body = await res.json();
  const attachment = Array.isArray(body) ? body[0] : body;
  if (!attachment?.id) throw new Error('upload_missing_id');
  return attachment;
}

export function listScreenshots(issueId, issueKey) {
  return invoke('listScreenshots', { issueId, issueKey });
}

export function listAssignable(issueKey, query = '') {
  return invoke('listAssignable', { issueKey, query });
}

export function publishScreenshot(payload) {
  return invoke('publishScreenshot', payload);
}

export function revealScreenshot(screenshotId) {
  return invoke('revealScreenshot', { screenshotId });
}

export function revokeGrant(screenshotId) {
  return invoke('revokeGrant', { screenshotId });
}

/** The masked PNG that Jira stores, as an object URL the panel can draw. */
export async function attachmentUrl(attachmentId) {
  const res = await requestJira(`/rest/api/3/attachment/content/${attachmentId}`, { headers: { Accept: '*/*' } });
  if (!res.ok) throw new Error(`attachment_${res.status}`);
  const blob = await res.blob();
  if (!blob.size) throw new Error('attachment_empty');
  return URL.createObjectURL(blob.type.startsWith('image/') ? blob : new Blob([blob], { type: 'image/png' }));
}
