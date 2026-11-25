// One published screenshot: the masked image Jira holds, with the revealed value drawn back where it was.
import React, { useEffect, useState } from 'react';
import { attachmentUrl, revealScreenshot, revokeGrant } from './api/jira.js';
import { grantStatus, humanDenyReason, shortDate } from './copy.js';

export default function Published({ shot, onChanged, notify }) {
  const [image, setImage] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [reveal, setReveal] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let url = null;
    let gone = false;
    attachmentUrl(shot.attachmentId)
      .then((u) => {
        url = u;
        if (!gone) setImage(u);
      })
      .catch(() => !gone && setImageFailed(true));
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [shot.attachmentId]);

  // Access can end while the panel is open.
  useEffect(() => {
    if (!shot.canReveal) setReveal(null);
  }, [shot.canReveal]);

  const run = async (work) => {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      notify('error', String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const onReveal = () =>
    run(async () => {
      const res = await revealScreenshot(shot.id);
      if (!res?.ok) {
        setReveal(null);
        notify('warning', humanDenyReason(res?.reason || res?.error));
        await onChanged();
        return;
      }
      setReveal({ bounds: res.bounds, url: `data:image/png;base64,${res.cropPngBase64}` });
      notify('success', 'Revealed on your screen only. The attachment in Jira is still masked.');
    });

  const onRevoke = () =>
    run(async () => {
      const res = await revokeGrant(shot.id);
      if (!res?.ok) throw new Error(res?.error || 'revoke_failed');
      setReveal(null);
      setConfirming(false);
      notify('success', 'Reveal access revoked. The masked attachment stays on the work item.');
      await onChanged();
    });

  const [tone, label] = grantStatus(shot);
  const pct = (v, of) => `${(v / of) * 100}%`;

  return (
    <article className="shot">
      <header>
        <div>
          <strong className="filename">{shot.filename || `Attachment ${shot.attachmentId}`}</strong>
          <div className="subtle">
            {shot.publisherDisplayName || 'Someone'} · {shortDate(shot.createdAt)}
            {shot.grant && !shot.grant.revoked ? ` · until ${shortDate(shot.grant.expiresAt)}` : ''}
          </div>
        </div>
        <span className={`lozenge ${tone}`}>{label}</span>
      </header>

      <div className="shot-image" style={image ? undefined : { aspectRatio: `${shot.width} / ${shot.height}` }}>
        {image ? <img className="masked" alt="Masked screenshot as stored in Jira" src={image} /> : (
          <span className="subtle">{imageFailed ? 'Preview unavailable. Open the attachment in Jira.' : 'Loading preview…'}</span>
        )}
        {reveal && (
          <img
            className="revealed"
            alt="Revealed value"
            src={reveal.url}
            style={{
              left: pct(reveal.bounds.x, shot.width),
              top: pct(reveal.bounds.y, shot.height),
              width: pct(reveal.bounds.width, shot.width),
              height: pct(reveal.bounds.height, shot.height),
            }}
          />
        )}
      </div>

      <div className="actions">
        {reveal ? (
          <button type="button" className="btn" onClick={() => setReveal(null)}>Hide</button>
        ) : (
          <button type="button" className="btn primary" disabled={busy || !shot.canReveal} onClick={onReveal}>
            Reveal in place
          </button>
        )}
        {!shot.canReveal && <span className="subtle deny">{humanDenyReason(shot.revealDeniedReason)}</span>}
        {shot.canRevoke && shot.grant && !shot.grant.revoked && !confirming && (
          <button type="button" className="btn subtle-btn push" disabled={busy} onClick={() => setConfirming(true)}>
            Revoke access
          </button>
        )}
      </div>

      {/* Forge panels cannot open browser confirm dialogs, so the confirmation is part of the page. */}
      {confirming && (
        <div className="section-message warning" role="alertdialog">
          <span>Revoke {shot.grant.recipientDisplayName || 'this person'}’s access? Anyone who already saw the value may have kept it.</span>
          <span className="actions">
            <button type="button" className="btn danger" disabled={busy} onClick={onRevoke}>Revoke</button>
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
          </span>
        </div>
      )}
    </article>
  );
}
