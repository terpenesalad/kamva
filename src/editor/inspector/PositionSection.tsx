import { useState } from 'react';
import {
  RotateCw,
  Link2,
  Unlink2,
  FlipHorizontal2,
  FlipVertical2,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Lock,
  LockOpen,
} from 'lucide-react';
import type { DesignElement } from '../../types';
import { useEditor } from '../../store/editor';
import { NumberField } from '../../components/ui';
import { fromPx, toPx } from '../../lib/units';
import { distribute, flip, toggleLock } from '../elementActions';
import { elementAABB } from '../canvas/controller';
import { unionBox } from '../canvas/snapping';
import { AlignPageButtons, S, Field, LayerButtons, patchEls, UNIT_DECIMALS, UNIT_STEP } from './fields';

/** Wrap an angle into (-180, 180] */
const normAngle = (v: number) => {
  const a = ((v % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
};

export function PositionSection({ els }: { els: DesignElement[] }) {
  const design = useEditor((s) => s.design)!;
  const u = design.unit;
  const dpi = design.dpi || 96;
  const dec = UNIT_DECIMALS[u];
  const step = UNIT_STEP[u];
  const ids = els.map((e) => e.id);
  const movable = els.filter((e) => !e.locked).map((e) => e.id);
  const single = els.length === 1 ? els[0] : null;
  const [lockRatio, setLockRatio] = useState<boolean | null>(null);
  const ratioLocked = lockRatio ?? (!!single && (single.type === 'image' || single.type === 'video' || (single.type === 'svg' && single.keepRatio !== false)));
  const box = single ? { x: single.x, y: single.y, width: single.width, height: single.height } : unionBox(els.map(elementAABB));
  const fx = (v: number) => fromPx(v, u, dpi);
  const tx = (v: number) => toPx(v, u, dpi);
  const allLocked = els.every((e) => e.locked);

  const moveTo = (nx: number | null, ny: number | null) => {
    const dx = nx === null ? 0 : tx(nx) - box.x;
    const dy = ny === null ? 0 : tx(ny) - box.y;
    patchEls(
      movable,
      (el: DesignElement) => {
        el.x += dx;
        el.y += dy;
      },
      'pos',
    );
  };

  const resize = (nw: number | null, nh: number | null) => {
    if (!single || single.locked) return;
    let w = nw === null ? single.width : Math.max(1, tx(nw));
    let h = nh === null ? single.height : Math.max(1, tx(nh));
    if (ratioLocked) {
      const r = single.width / Math.max(1, single.height);
      if (nw !== null) h = w / r;
      else w = h * r;
    }
    const cx = single.x + single.width / 2;
    const cy = single.y + single.height / 2;
    patchEls(
      ids,
      (el: any) => {
        el.width = w;
        if (el.type !== 'line') el.height = h;
        if (el.type === 'text' && nh !== null) el.autoHeight = false;
        // keep the centre where it was so rotated elements don't jump
        el.x = cx - w / 2;
        el.y = el.type === 'line' ? el.y : cy - h / 2;
      },
      'size',
    );
  };

  return (
    <S
      id="position"
      title="Position"
      defaultOpen={els.length > 1 || (!!single && single.type !== 'text' && single.type !== 'image' && single.type !== 'video')}
    >
      <div className="grid2">
        <NumberField label="X" value={fx(box.x)} decimals={dec} step={step} onChange={(v) => moveTo(v, null)} title="Horizontal position" />
        <NumberField label="Y" value={fx(box.y)} decimals={dec} step={step} onChange={(v) => moveTo(null, v)} title="Vertical position" />
      </div>
      {single && (
        <div className="insp-wh">
          <NumberField label="W" value={fx(single.width)} decimals={dec} step={step} min={step} onChange={(v) => resize(v, null)} title="Width" />
          <button
            type="button"
            className={'icon-btn sm' + (ratioLocked ? ' active' : '')}
            onClick={() => {
              const next = !ratioLocked;
              setLockRatio(next);
              if (single.type === 'svg') patchEls(ids, { keepRatio: next });
            }}
            data-tip={ratioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            aria-label="Lock aspect ratio"
          >
            {ratioLocked ? <Link2 size={14} /> : <Unlink2 size={14} />}
          </button>
          {single.type === 'line' ? (
            <div />
          ) : (
            <NumberField label="H" value={fx(single.height)} decimals={dec} step={step} min={step} onChange={(v) => resize(null, v)} title="Height" />
          )}
        </div>
      )}
      <div className="grid2">
        {single ? (
          <NumberField
            label={<RotateCw size={11} />}
            value={single.rotation}
            decimals={1}
            min={-360}
            max={360}
            unit="°"
            onChange={(v) => patchEls(movable, { rotation: normAngle(v) }, 'rot')}
            title="Rotation"
          />
        ) : (
          <div />
        )}
        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className={'icon-btn sm' + (els.some((e) => e.flipX) ? ' active' : '')}
            onClick={() => flip('x')}
            data-tip="Flip horizontal"
            aria-label="Flip horizontal"
          >
            <FlipHorizontal2 size={16} />
          </button>
          <button
            type="button"
            className={'icon-btn sm' + (els.some((e) => e.flipY) ? ' active' : '')}
            onClick={() => flip('y')}
            data-tip="Flip vertical"
            aria-label="Flip vertical"
          >
            <FlipVertical2 size={16} />
          </button>
          <button
            type="button"
            className={'icon-btn sm' + (allLocked ? ' active' : '')}
            onClick={toggleLock}
            data-tip={allLocked ? 'Unlock' : 'Lock'}
            aria-label="Lock"
          >
            {allLocked ? <Lock size={15} /> : <LockOpen size={15} />}
          </button>
        </div>
      </div>
      <Field label="Align to page">
        <AlignPageButtons />
      </Field>
      {els.length > 1 && (
        <Field label="Align to each other">
          <AlignPageButtons toPage={false} />
        </Field>
      )}
      {els.length >= 3 && (
        <Field label="Distribute">
          <div className="grid2">
            <button type="button" className="btn sm" onClick={() => distribute('h')}>
              <AlignHorizontalDistributeCenter size={15} /> Horizontally
            </button>
            <button type="button" className="btn sm" onClick={() => distribute('v')}>
              <AlignVerticalDistributeCenter size={15} /> Vertically
            </button>
          </div>
        </Field>
      )}
      <Field label="Layer">
        <LayerButtons ids={ids} />
      </Field>
    </S>
  );
}
