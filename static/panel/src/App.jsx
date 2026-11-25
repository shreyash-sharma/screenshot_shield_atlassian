import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getIssueContext, uploadMaskedPng, listScreenshots, listAssignable, publishScreenshot } from './api/jira.js';
import { runOcr } from './ocr/paddle.js';
import { proposeMasks } from './masks/detect.js';
import Editor from './masks/Editor.jsx';
import Published from './Published.jsx';
import { drawMaskedImage, cropRegion, canvasToPngBlob, blobToBase64 } from './export/maskPng.js';
import { humanPublishError, typeLabel } from './copy.js';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_CROP_BYTES = 100_000;
const EXPIRY = [
  [24, '1 day'],
  [72, '3 days'],
  [168, '7 days'],
  [720, '30 days'],
];

function attachmentName(issueKey) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  return `protected-${issueKey || 'shot'}-${stamp}.png`;
}

export default function App() {
  const [ctx, setCtx] = useState(null);
  const [notice, setNotice] = useState(null);
  const [users, setUsers] = useState([]);
  const [me, setMe] = useState(null);
  const [published, setPublished] = useState([]);
  const [draft, setDraft] = useState(null); // { canvas, url }
  const [masks, setMasks] = useState([]);
  const [maskedUrl, setMaskedUrl] = useState(null);
  const [preview, setPreview] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [revealId, setRevealId] = useState(null);
  const [recipientId, setRecipientId] = useState('');
  const [expiryHours, setExpiryHours] = useState(72);
  const [busy, setBusy] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const notify = useCallback((tone, text) => setNotice({ tone, text }), []);

  const refresh = useCallback(async (context) => {
    const res = await listScreenshots(context.issueId, context.issueKey);
    if (res?.ok) {
      setPublished(res.items || []);
      setMe(res.me || null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const context = await getIssueContext();
        if (cancelled) return;
        setCtx(context);
        await refresh(context);
        const assign = await listAssignable(context.issueKey, '');
        if (!cancelled && assign?.ok) setUsers(assign.users || []);
      } catch (err) {
        if (!cancelled) notify('error', `Could not load this work item. ${err?.message || err}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, notify]);

  // The exact image Jira will receive.
  useEffect(() => {
    if (!draft) return undefined;
    let gone = false;
    let url = null;
    canvasToPngBlob(drawMaskedImage(draft.canvas, masks))
      .then((blob) => {
        if (gone) return;
        url = URL.createObjectURL(blob);
        setMaskedUrl(url);
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [draft, masks]);

  const discard = () => {
    if (draft) URL.revokeObjectURL(draft.url);
    setDraft(null);
    setMasks([]);
    setMaskedUrl(null);
    setPreview(false);
    setRevealId(null);
    setActiveId(null);
    setRecipientId('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const loadFile = async (file) => {
    if (!file || !String(file.type || '').startsWith('image/')) return notify('error', 'Choose a PNG, JPEG or WebP image.');
    if (file.size > MAX_BYTES) return notify('error', 'The image is larger than 8 MB.');
    setBusy('Reading the screenshot in your browser…');
    setNotice(null);
    let loaded = false;
    try {
      const bmp = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      canvas.getContext('2d').drawImage(bmp, 0, 0);
      bmp.close();
      setDraft({ canvas, url: URL.createObjectURL(file) });
      loaded = true;
      const ocr = await runOcr(canvas);
      const found = proposeMasks(ocr.items);
      setMasks(found);
      setRevealId(found.find((m) => m.type === 'REQUEST_ID')?.id || null);
      setActiveId(null);
      notify(
        found.length ? 'info' : 'warning',
        found.length
          ? `${found.length} suggested mask${found.length === 1 ? '' : 's'}. Check them: move, resize, remove or draw your own.`
          : 'No suggestions. Drag on the image to draw a mask.',
      );
    } catch (err) {
      notify('error', loaded ? 'Text recognition failed. Draw the masks yourself.' : `Could not open the image. ${err?.message || err}`);
    } finally {
      setBusy('');
    }
    return undefined;
  };

  // Paste a screenshot straight from the clipboard.
  const loadRef = useRef(loadFile);
  loadRef.current = loadFile;
  const canPaste = !draft && !busy;
  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (canPaste && file) {
        e.preventDefault();
        loadRef.current(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [canPaste]);

  const selected = masks.filter((m) => m.selected !== false);
  const revealMask = selected.find((m) => m.id === revealId) || null;
  const recipients = useMemo(() => users.filter((u) => u.accountId !== me?.accountId), [users, me]);

  const addMask = (bounds) => {
    const box = { id: `manual-${Date.now()}`, type: 'MANUAL', bounds, selected: true, maskLabel: '████' };
    setMasks((prev) => [...prev, box]);
    setActiveId(box.id);
  };
  const patch = (id, change) => setMasks((prev) => prev.map((m) => (m.id === id ? { ...m, ...change } : m)));

  const publish = async () => {
    if (!ctx || !draft || !selected.length) return;
    const grantee = revealMask && recipientId ? recipientId : null;
    setBusy('Preparing the masked image…');
    setNotice(null);
    try {
      // Check the revealable area before anything is uploaded, so a failure leaves nothing behind.
      let crop = '';
      if (grantee) {
        const blob = await canvasToPngBlob(cropRegion(draft.canvas, revealMask.bounds));
        if (blob.size > MAX_CROP_BYTES) throw new Error(humanPublishError('crop_too_large'));
        crop = await blobToBase64(blob);
      }
      const filename = attachmentName(ctx.issueKey);
      const png = await canvasToPngBlob(drawMaskedImage(draft.canvas, selected));
      setBusy('Attaching the masked image to Jira…');
      const attachment = await uploadMaskedPng(ctx.issueKey, png, filename);
      const res = await publishScreenshot({
        issueId: String(ctx.issueId),
        issueKey: String(ctx.issueKey),
        attachmentId: String(attachment.id),
        width: draft.canvas.width,
        height: draft.canvas.height,
        protectedBounds: grantee ? revealMask.bounds : undefined,
        cropPngBase64: grantee ? crop : undefined,
        recipientAccountId: grantee || undefined,
        expiryHours,
      });
      if (!res?.ok) throw new Error(`${humanPublishError(res?.error)} The masked image ${filename} is attached.`);
      discard();
      notify('success', `Attached ${filename}.`);
      await refresh(ctx);
    } catch (err) {
      notify('error', String(err?.message || err));
    } finally {
      setBusy('');
    }
  };

  return (
    <main className="app">
      <p className="lede">Everyone sees the error. Only the person you choose can reveal the private detail.</p>

      {notice && (
        <div className={`section-message ${notice.tone}`} role="status">
          <span>{notice.text}</span>
          <button type="button" className="dismiss" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
        </div>
      )}
      {busy && (
        <div className="busy" role="status">
          <span className="spinner" aria-hidden="true" />
          {busy}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => loadFile(e.target.files?.[0])} />

      {!draft && (
        <div
          className={`dropzone ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            loadFile(e.dataTransfer.files?.[0]);
          }}
        >
          <button type="button" className="btn primary" disabled={Boolean(busy) || !ctx} onClick={() => fileRef.current?.click()}>
            Protect a screenshot
          </button>
          <span className="subtle">or drop or paste an image. It is read in your browser.</span>
        </div>
      )}

      {draft && (
        <section className="review">
          <div className="toolbar">
            <div className="segmented" role="tablist">
              <button type="button" role="tab" aria-selected={!preview} onClick={() => setPreview(false)}>Edit masks</button>
              <button type="button" role="tab" aria-selected={preview} disabled={!maskedUrl} onClick={() => setPreview(true)}>
                What Jira will store
              </button>
            </div>
            <button type="button" className="btn subtle-btn" disabled={Boolean(busy)} onClick={discard}>Cancel</button>
          </div>

          <Editor
            src={preview && maskedUrl ? maskedUrl : draft.url}
            width={draft.canvas.width}
            height={draft.canvas.height}
            masks={masks}
            activeId={activeId}
            revealId={revealId}
            preview={preview}
            onSelect={setActiveId}
            onChange={(id, bounds) => patch(id, { bounds })}
            onAdd={addMask}
          />

          <table className="masks">
            <thead>
              <tr>
                <th>Mask</th>
                <th>Found</th>
                <th>Can be revealed</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {masks.map((m) => (
                <tr key={m.id} className={m.id === activeId ? 'active' : ''} onClick={() => setActiveId(m.id)}>
                  <td>
                    <label>
                      <input type="checkbox" checked={m.selected !== false} onChange={(e) => patch(m.id, { selected: e.target.checked })} />
                      <span className="lozenge neutral">{typeLabel(m.type)}</span>
                    </label>
                  </td>
                  <td className="value">{m.text || 'Area you drew'}</td>
                  <td>
                    <input
                      type="radio"
                      name="reveal"
                      aria-label={`Allow reveal of ${typeLabel(m.type)}`}
                      checked={revealId === m.id}
                      disabled={m.selected === false}
                      onChange={() => setRevealId(m.id)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn subtle-btn"
                      onClick={() => {
                        setMasks((prev) => prev.filter((x) => x.id !== m.id));
                        if (revealId === m.id) setRevealId(null);
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {!masks.length && (
                <tr>
                  <td colSpan={4} className="subtle">No masks yet. Drag on the image.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="share">
            <label>
              Who can reveal {revealMask ? `the ${typeLabel(revealMask.type).toLowerCase()}` : 'a value'}
              <select value={recipientId} disabled={!revealMask} onChange={(e) => setRecipientId(e.target.value)}>
                <option value="">Nobody</option>
                {recipients.map((u) => (
                  <option key={u.accountId} value={u.accountId}>{u.displayName}</option>
                ))}
              </select>
            </label>
            <label>
              Access ends after
              <select value={expiryHours} disabled={!recipientId} onChange={(e) => setExpiryHours(Number(e.target.value))}>
                {EXPIRY.map(([hours, text]) => (
                  <option key={hours} value={hours}>{text}</option>
                ))}
              </select>
            </label>
            <button type="button" className="btn primary" disabled={Boolean(busy) || !selected.length} onClick={publish}>
              Attach masked screenshot
            </button>
          </div>
          <p className="subtle">Jira receives only the masked image. All other masked values are discarded.</p>
        </section>
      )}

      <section>
        <div className="toolbar">
          <h2>Protected screenshots</h2>
          <button type="button" className="btn subtle-btn" disabled={!ctx} onClick={() => ctx && refresh(ctx)}>Refresh</button>
        </div>
        {!published.length && <p className="subtle">None on this work item yet.</p>}
        {published.map((shot) => (
          <Published key={shot.id} shot={shot} notify={notify} onChanged={() => refresh(ctx)} />
        ))}
      </section>
    </main>
  );
}
