import { useEffect, useState } from 'react';
import { useEditor } from '../../store/editor';
import { useUI } from '../../store/ui';
import { PagesStrip } from './PagesStrip';
import { ExpandedTimeline } from './ExpandedTimeline';
import { pointerDrag, readNum, writeNum } from './common';
import './timeline.css';

const H_KEY = 'kamva.timeline.height';
const H_MIN = 170;
const H_DEFAULT = 248;

export function Timeline() {
  const design = useEditor((s) => s.design);
  const open = useUI((s) => s.timelineOpen);
  const [height, setHeight] = useState(() => readNum(H_KEY, H_DEFAULT));

  // never let the bottom area take over the canvas
  useEffect(() => {
    const onResize = () => setHeight((h) => Math.min(h, maxHeight()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!design) return null;

  const h = Math.max(H_MIN, Math.min(height, maxHeight()));

  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const h0 = h;
    let last = h0;
    pointerDrag(
      e,
      (_dx, dy) => {
        last = Math.round(Math.max(H_MIN, Math.min(maxHeight(), h0 - dy)));
        setHeight(last);
      },
      () => writeNum(H_KEY, last),
      'ns-resize',
    );
  };

  return (
    <div className={'timeline-root' + (open ? ' open' : '')}>
      {open ? (
        <>
          <div
            className="tl-resize"
            onPointerDown={startResize}
            onDoubleClick={() => {
              setHeight(H_DEFAULT);
              writeNum(H_KEY, H_DEFAULT);
            }}
            title="Drag to resize the timeline"
          />
          <ExpandedTimeline design={design} height={h} />
        </>
      ) : (
        <PagesStrip design={design} />
      )}
    </div>
  );
}

function maxHeight() {
  return Math.max(H_MIN, Math.round(window.innerHeight * 0.5));
}
