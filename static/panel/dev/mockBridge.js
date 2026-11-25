// LOCAL PREVIEW ONLY (`vite --mode mock`): stands in for @forge/bridge so the panel can be tried without Jira.
// It is never part of the deployed build. Open with ?as=shreyash (publisher) or ?as=kritika, and &theme=dark.
const people = { shreyash: 'Shreyash', kritika: 'Kritika' };
const params = new URLSearchParams(location.search);
const me = people[params.get('as')] ? params.get('as') : 'shreyash';
const KEY = 'shield.mock';
const load = () => JSON.parse(sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || '{"shots":[],"files":{}}');
const save = (db) => localStorage.setItem(KEY, JSON.stringify(db));

const view_ = (s) => {
  const g = s.grant;
  const allowed = g && !g.revoked && g.to === me;
  return {
    ...s.shot,
    grant: g ? { recipientDisplayName: people[g.to], expiresAt: g.expiresAt, revoked: g.revoked } : null,
    canReveal: Boolean(allowed),
    canRevoke: s.publisher === me,
    revealDeniedReason: allowed ? null : !g ? 'no_grant' : g.revoked ? 'revoked' : 'not_recipient',
  };
};

export const view = {
  getContext: async () => ({ extension: { issue: { id: '1', key: 'SUP-12' }, project: { key: 'SUP' } } }),
  theme: {
    enable: async () => {
      if (params.get('theme') !== 'dark') return;
      const dark = { '--ds-surface': '#1d2125', '--ds-text': '#b6c2cf', '--ds-surface-sunken': '#161a1d', '--ds-border': '#a6c5e229', '--ds-surface-raised': '#22272b', '--ds-text-subtlest': '#8c9bab', '--ds-background-neutral': '#a1bdd914' };
      for (const [k, v] of Object.entries(dark)) document.documentElement.style.setProperty(k, v);
    },
  },
};

export async function invoke(name, payload = {}) {
  const db = load();
  if (name === 'listScreenshots') return { ok: true, items: db.shots.map(view_), me: { accountId: me, displayName: people[me] } };
  if (name === 'listAssignable') return { ok: true, users: Object.entries(people).map(([accountId, displayName]) => ({ accountId, displayName })) };
  if (name === 'publishScreenshot') {
    const shot = { id: `s${Date.now()}`, issueKey: payload.issueKey, attachmentId: payload.attachmentId, filename: db.files[payload.attachmentId].name, width: payload.width, height: payload.height, protectedBounds: payload.protectedBounds, publisherDisplayName: people[me], createdAt: new Date().toISOString() };
    const grant = payload.recipientAccountId ? { to: payload.recipientAccountId, revoked: false, expiresAt: new Date(Date.now() + payload.expiryHours * 3600000).toISOString() } : null;
    db.shots.unshift({ shot, grant, publisher: me, crop: payload.cropPngBase64 });
    save(db);
    return { ok: true, screenshot: view_(db.shots[0]) };
  }
  const entry = db.shots.find((s) => s.shot.id === payload.screenshotId);
  if (name === 'revealScreenshot') {
    const v = view_(entry);
    return v.canReveal ? { ok: true, bounds: entry.shot.protectedBounds, cropPngBase64: entry.crop } : { ok: false, error: 'denied', reason: v.revealDeniedReason };
  }
  entry.grant.revoked = true;
  delete entry.crop;
  save(db);
  return { ok: true };
}

export async function requestJira(path, init = {}) {
  const db = load();
  if (init.method === 'POST') {
    const file = init.body.get('file');
    const dataUrl = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(file);
    });
    const id = String(Date.now());
    db.files[id] = { name: file.name, dataUrl };
    save(db);
    return new Response(JSON.stringify([{ id }]), { status: 200 });
  }
  const file = db.files[path.split('/').pop()];
  return file ? new Response(await (await fetch(file.dataUrl)).blob()) : new Response('', { status: 404 });
}
