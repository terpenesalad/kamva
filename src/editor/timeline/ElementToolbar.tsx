// Toolbar shown above the timeline tracks when elements on the active page are
// selected: timing, and for videos the sound, speed and clip tools.
import { AudioLines, Clock, Copy, Repeat, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import type { Design, DesignElement, Page, VideoElement } from '../../types';
import { useEditor } from '../../store/editor';
import { NumberField } from '../../components/ui';
import { MIN_LEN, elementSpan, moveSpan, trimSpan, trimVideoEnd, videoClipLength } from '../../lib/timing';
import { defaultName } from '../panels/LayersPanel';
import { TypeIcon } from './LayerTracks';
import { assetDuration, detachAudio, fitPageToVideos } from './edits';
import { fmtDur } from './common';

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const r2 = (v: number) => Math.round(v * 100) / 100;

export function ElementToolbar({ design, page, els, onClose }: { design: Design; page: Page; els: DesignElement[]; onClose: () => void }) {
  const st = useEditor.getState();
  const el = els[0];
  const ids = els.map((e) => e.id);
  const pageDur = page.duration;
  const span = elementSpan(el, pageDur);
  const len = span.end - span.start;
  const single = els.length === 1;
  const v = el.type === 'video' && single ? (el as VideoElement) : null;
  const dur = v ? assetDuration(design, v.assetId) : 0;
  const upV = (patch: Partial<VideoElement>, key: string) => st.updateElements([el.id], patch as Partial<DesignElement>, `tl-v-${key}:${el.id}`);
  const vol = v ? Math.round(v.volume * 100) : 0;
  const soundLen = v ? Math.max(0, Math.min(len, v.loop ? len : videoClipLength(v, dur))) : 0;

  const setStart = (t: number) =>
    st.updateElements(
      ids,
      (x) => {
        moveSpan(x, t, pageDur);
      },
      'tl-el-start:' + ids.join(),
    );
  const setLength = (l: number) =>
    st.updateElements(
      [el.id],
      (x) => {
        const s = elementSpan(x, pageDur);
        if (x.type === 'video') trimVideoEnd(x, s.start + l, pageDur, dur);
        else trimSpan(x, 'end', s.start + l, pageDur);
      },
      'tl-el-len:' + el.id,
    );

  return (
    <div className="tl-cliptools" onPointerDown={(e) => e.stopPropagation()}>
      <span className="tl-cliptools-name" title={single ? defaultName(el) : `${els.length} elements`}>
        <TypeIcon el={el} size={13} /> {single ? defaultName(el).replace(/\.[a-z0-9]{2,5}$/i, '') : `${els.length} elements`}
      </span>
      <div className="vdivider" />
      <div className="tl-fade" title="When it appears, in seconds from the start of the page">
        <span>Start</span>
        <NumberField value={r2(span.start)} min={0} max={Math.max(0, pageDur - len)} step={0.1} decimals={2} unit="s" onChange={setStart} />
      </div>
      {single && (
        <div className="tl-fade" title={v ? 'How long it stays on screen (shortening trims the clip)' : 'How long it stays on screen'}>
          <span>Length</span>
          <NumberField value={r2(len)} min={MIN_LEN} max={Math.max(MIN_LEN, pageDur - span.start)} step={0.1} decimals={2} unit="s" onChange={setLength} />
        </div>
      )}
      {v && (
        <>
          <div className="vdivider" />
          <button
            className={'icon-btn sm' + (v.muted ? ' active' : '')}
            onClick={() => upV({ muted: !v.muted }, 'mute')}
            aria-label={v.muted ? 'Unmute' : 'Mute'}
            data-tip={v.muted ? 'Unmute' : 'Mute'}
          >
            {v.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <div className="tl-vol">
            <input
              type="range"
              min={0}
              max={100}
              value={vol}
              disabled={v.muted}
              style={{ ['--fill' as any]: `${vol}%` }}
              onChange={(e) => upV({ volume: parseInt(e.target.value) / 100 }, 'vol')}
              onDoubleClick={() => upV({ volume: 1 }, 'vol')}
              aria-label="Volume"
              title="Volume (double-click to reset)"
            />
            <span className="tl-num">{vol}%</span>
          </div>
          <div className="tl-fade">
            <span>Fade in</span>
            <NumberField value={v.fadeIn || 0} min={0} max={Math.max(0, soundLen)} step={0.1} decimals={1} unit="s" onChange={(x) => upV({ fadeIn: r2(x) }, 'fi')} />
          </div>
          <div className="tl-fade">
            <span>Fade out</span>
            <NumberField value={v.fadeOut || 0} min={0} max={Math.max(0, soundLen)} step={0.1} decimals={1} unit="s" onChange={(x) => upV({ fadeOut: r2(x) }, 'fo')} />
          </div>
          <div className="vdivider" />
          <label className="tl-fade" title="Playback speed">
            <span>Speed</span>
            <select
              className="select sm tl-speed"
              value={SPEEDS.includes(v.speed) ? String(v.speed) : 'custom'}
              onChange={(e) => {
                const sp = parseFloat(e.target.value);
                if (!isFinite(sp)) return;
                st.updateElements(
                  [v.id],
                  (x) => {
                    if (x.type !== 'video') return;
                    // keep the clip's source range; its length on the timeline follows the speed
                    const s = elementSpan(x, pageDur);
                    const hadEnd = x.timing?.end != null;
                    x.speed = sp;
                    if (hadEnd && !x.loop) {
                      const clip = videoClipLength(x, dur);
                      const end = Math.min(pageDur, s.start + clip);
                      x.timing = { start: s.start, end: end >= pageDur - 0.005 ? null : Math.round(end * 1000) / 1000 };
                    }
                  },
                  'tl-v-speed:' + v.id,
                );
              }}
            >
              {!SPEEDS.includes(v.speed) && <option value="custom">{+v.speed.toFixed(2)}×</option>}
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
          <button className={'icon-btn sm' + (v.loop ? ' active' : '')} onClick={() => upV({ loop: !v.loop }, 'loop')} aria-label="Loop" data-tip={v.loop ? 'Looping' : 'Loop'}>
            <Repeat size={15} />
          </button>
          <button className="btn ghost sm" onClick={() => detachAudio(v.id)} disabled={v.muted} title="Move the sound onto its own audio track">
            <AudioLines size={14} /> Detach audio
          </button>
          <button className="btn ghost sm" onClick={() => fitPageToVideos(page.id)} title="Set the page length to the length of its videos">
            <Clock size={14} /> Fit page
          </button>
        </>
      )}
      <div className="vdivider" />
      <button className="icon-btn sm" onClick={() => st.duplicateElements(ids)} aria-label="Duplicate" data-tip="Duplicate">
        <Copy size={14} />
      </button>
      <button className="icon-btn sm tl-danger" onClick={() => st.deleteElements(ids)} aria-label="Delete" data-tip="Delete (Del)">
        <Trash2 size={14} />
      </button>
      <div className="spacer" />
      <span className="tl-cliptools-meta">
        {fmtDur(span.start)} → {fmtDur(span.end)}
      </span>
      <button className="icon-btn sm" onClick={onClose} aria-label="Deselect" data-tip="Done">
        <X size={14} />
      </button>
    </div>
  );
}
