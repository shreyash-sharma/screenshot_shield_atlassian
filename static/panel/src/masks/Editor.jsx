// The review canvas: draw a box on empty space, drag a box to move it, drag its corner to resize.
import React, { useRef, useState } from 'react';
import { typeLabel } from '../copy.js';

const MIN = 8;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function Editor({ src, width, height, masks, activeId, revealId, preview, onSelect, onChange, onAdd }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);

  const point = (e) => {
    const r = ref.current.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - r.left) / r.width) * width, 0, width),
      y: clamp(((e.clientY - r.top) / r.height) * height, 0, height),
    };
  };

  const start = (e, mode, mask) => {
    if (preview || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    ref.current.setPointerCapture(e.pointerId);
    if (mask) onSelect(mask.id);
    setDrag({ mode, id: mask?.id, from: point(e), orig: mask?.bounds, box: null });
  };

  const move = (e) => {
    if (!drag) return;
    const p = point(e);
    const { from, orig, mode, id } = drag;
    if (mode === 'draw') {
      setDrag({ ...drag, box: { x: Math.min(from.x, p.x), y: Math.min(from.y, p.y), width: Math.abs(p.x - from.x), height: Math.abs(p.y - from.y) } });
    } else if (mode === 'move') {
      onChange(id, {
        ...orig,
        x: clamp(orig.x + p.x - from.x, 0, width - orig.width),
        y: clamp(orig.y + p.y - from.y, 0, height - orig.height),
      });
    } else {
      onChange(id, {
        ...orig,
        width: clamp(orig.width + p.x - from.x, MIN, width - orig.x),
        height: clamp(orig.height + p.y - from.y, MIN, height - orig.y),
      });
    }
  };

  const end = () => {
    if (drag?.mode === 'draw' && drag.box && drag.box.width >= MIN && drag.box.height >= MIN) onAdd(drag.box);
    setDrag(null);
  };

  const style = (b) => ({
    left: `${(b.x / width) * 100}%`,
    top: `${(b.y / height) * 100}%`,
    width: `${(b.width / width) * 100}%`,
    height: `${(b.height / height) * 100}%`,
  });

  return (
    <div
      className={`canvas ${preview ? 'preview' : ''}`}
      ref={ref}
      onPointerDown={(e) => start(e, 'draw')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => setDrag(null)}
    >
      <img alt={preview ? 'Masked preview' : 'Screenshot being reviewed'} src={src} draggable={false} />
      {!preview &&
        masks
          .filter((m) => m.selected !== false)
          .map((m) => (
            <div
              key={m.id}
              data-mask={m.type}
              title={typeLabel(m.type)}
              className={`box ${m.id === activeId ? 'active' : ''} ${m.id === revealId ? 'revealable' : ''}`}
              style={style(m.bounds)}
              onPointerDown={(e) => start(e, 'move', m)}
            >
              <span className="handle" onPointerDown={(e) => start(e, 'resize', m)} />
            </div>
          ))}
      {drag?.box && <div className="box drawing" style={style(drag.box)} />}
    </div>
  );
}
