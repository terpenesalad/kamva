import { memo, useRef } from 'react';
import { Film, Layers, Trash2 } from 'lucide-react';
import type { Template } from '../types';
import { useInView, useTemplateThumb } from '../lib/templates/thumbs';
import { templateIsAnimated } from '../lib/templates';
import './home.css';

export const THUMB_SIZE = 320;

/**
 * A template preview tile.
 * - `fit="aspect"`: the thumbnail box takes the template's own proportions (masonry columns).
 * - `fit="contain"`: a fixed-height box with the page centred inside (calm, even grids).
 */
export const TemplateCard = memo(function TemplateCard({
  t,
  onOpen,
  onDelete,
  fit = 'contain',
  showName = true,
  showSize = false,
}: {
  t: Template;
  onOpen: (t: Template) => void;
  onDelete?: (t: Template) => void;
  fit?: 'aspect' | 'contain';
  showName?: boolean;
  showSize?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  const url = useTemplateThumb(t, THUMB_SIZE, visible);
  const pages = t.pages.length;
  const animated = !t.thumb && templateIsAnimated(t);
  const ratio = `${t.width} / ${t.height}`;
  const label = `${t.name}${pages > 1 ? `, ${pages} pages` : ''}`;
  return (
    <div className={'tcard ' + fit} ref={ref}>
      <button type="button" className="tcard-hit" onClick={() => onOpen(t)} aria-label={`Use template: ${label}`} title={t.name}>
        <span className="tcard-frame" style={fit === 'aspect' ? { aspectRatio: ratio } : undefined}>
          <span
            className="tcard-page"
            style={fit === 'contain' ? { aspectRatio: ratio, ...(t.width >= t.height ? { width: '100%' } : { height: '100%' }) } : undefined}
          >
            {url ? <img src={url} alt="" draggable={false} /> : <span className="tcard-skeleton" />}
          </span>
          {(pages > 1 || animated) && (
            <span className="tcard-badges">
              {animated && (
                <span className="tcard-badge" title="Animated">
                  <Film size={11} />
                </span>
              )}
              {pages > 1 && (
                <span className="tcard-badge" title={`${pages} pages`}>
                  <Layers size={11} />
                  {pages}
                </span>
              )}
            </span>
          )}
        </span>
        {showName && (
          <span className="tcard-meta">
            <span className="tcard-name">{t.name}</span>
            {showSize && <span className="tcard-sub">{t.category}</span>}
          </span>
        )}
      </button>
      {onDelete && (
        <button
          type="button"
          className="tcard-del icon-btn sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(t);
          }}
          aria-label={`Delete ${t.name}`}
          data-tip="Delete"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
});
