import { useEffect, useRef, useState } from 'react';
import { VolumeX } from 'lucide-react';
import type { AudioTrack } from '../../types';
import { getPeaks } from '../../lib/assets';
import { usePrefs } from '../../store/ui';

const PEAK_BUCKETS = 2000;
const MAX_CANVAS = 8192;

/** Waveform of the trimmed part of an audio track, with the fade envelope applied. */
export function Waveform({ track, width, height, sourceDuration }: { track: AudioTrack; width: number; height: number; sourceDuration: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const accent = usePrefs((s) => s.accent);

  useEffect(() => {
    let alive = true;
    void getPeaks(track.assetId, PEAK_BUCKETS).then((p) => alive && setPeaks(p));
    return () => {
      alive = false;
    };
  }, [track.assetId]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.min(MAX_CANVAS, Math.round(width * dpr)));
    const ch = Math.max(1, Math.round(height * dpr));
    if (c.width !== cw) c.width = cw;
    if (c.height !== ch) c.height = ch;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);
    const color = getComputedStyle(c).color || '#888';
    const src = sourceDuration || 0;
    const trimEnd = Math.min(src || Infinity, track.trimEnd ?? src);
    const len = Math.max(0.001, trimEnd - track.trimStart);
    const mid = ch / 2;
    const fi = Math.min(track.fadeIn || 0, len);
    const fo = Math.min(track.fadeOut || 0, len);
    const env = (s: number) => {
      let g = 1;
      if (fi > 0 && s < fi) g *= s / fi;
      if (fo > 0 && s > len - fo) g *= Math.max(0, (len - s) / fo);
      return g;
    };
    const vol = Math.min(1.5, Math.max(0, track.volume));
    const amp = Math.min(1, 0.35 + vol * 0.65);
    ctx.fillStyle = color;
    ctx.globalAlpha = track.muted ? 0.35 : 0.85;
    if (peaks && src > 0) {
      const n = peaks.length;
      const step = Math.max(1, Math.round(dpr * 2));
      const barW = Math.max(1, step - Math.max(1, Math.round(dpr * 0.6)));
      for (let x = 0; x < cw; x += step) {
        const s = (x / cw) * len;
        const s2 = ((x + step) / cw) * len;
        const b0 = Math.floor(((track.trimStart + s) / src) * n);
        const b1 = Math.max(b0 + 1, Math.floor(((track.trimStart + s2) / src) * n));
        let m = 0;
        for (let b = b0; b < b1 && b < n; b++) if (peaks[b] > m) m = peaks[b];
        const h = Math.max(dpr * 0.75, Math.min(1, m * 1.15) * amp * env(s) * (ch - 2 * dpr));
        ctx.fillRect(x, mid - h / 2, barW, h);
      }
    } else {
      // placeholder line while decoding
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, mid - dpr / 2, cw, dpr);
    }
    // fade envelope
    if (fi > 0 || fo > 0) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = color;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      const top = dpr;
      const bot = ch - dpr;
      ctx.moveTo(0, fi > 0 ? bot : top);
      if (fi > 0) ctx.lineTo((fi / len) * cw, top);
      if (fo > 0) {
        ctx.lineTo(((len - fo) / len) * cw, top);
        ctx.lineTo(cw, bot);
      } else ctx.lineTo(cw, top);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, [peaks, width, height, track.trimStart, track.trimEnd, track.fadeIn, track.fadeOut, track.volume, track.muted, sourceDuration, accent]);

  return <canvas ref={ref} className="tl-wave" style={{ width, height }} />;
}

export function ClipLabel({ track }: { track: AudioTrack }) {
  return (
    <div className="tl-clip-label">
      {track.muted && <VolumeX size={11} />}
      <span>{track.name.replace(/\.[a-z0-9]{2,5}$/i, '')}</span>
      {track.volume !== 1 && !track.muted && <span className="tl-clip-vol">{Math.round(track.volume * 100)}%</span>}
    </div>
  );
}
