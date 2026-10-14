// Soundtrack mixing: audio tracks plus the sound of video elements, rendered
// offline to a stereo AudioBuffer, and a 16-bit PCM WAV encoder.
import type { Design } from '../../types';
import { getAudioBuffer } from '../assets';
import { pageStartTime, totalDuration } from '../../store/editor';
import { elementSpan, videoMotionEnd } from '../timing';
import { platform, isDesktop } from '../platform';

const stretchCache = new Map<string, Promise<AudioBuffer | null>>();

/**
 * The [from, to] part of `buf`, time-stretched by `speed` without changing the
 * pitch (ffmpeg atempo, desktop only). Null when that isn't available.
 */
async function stretchedSegment(buf: AudioBuffer, from: number, to: number, speed: number, sampleRate: number): Promise<AudioBuffer | null> {
  if (!isDesktop) return null;
  const info = await platform.appInfo();
  if (!info.ffmpeg) return null;
  const key = [buf.length, buf.sampleRate, from.toFixed(3), to.toFixed(3), speed.toFixed(4)].join('|');
  let p = stretchCache.get(key);
  if (!p) {
    p = (async () => {
      const a = Math.floor(from * buf.sampleRate);
      const b = Math.min(buf.length, Math.ceil(to * buf.sampleRate));
      const seg = new AudioBuffer({ length: Math.max(1, b - a), numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
      for (let c = 0; c < buf.numberOfChannels; c++) seg.copyToChannel(buf.getChannelData(c).subarray(a, b), c);
      const out = await platform.transcode(audioBufferToWav(seg), 'wav', 'tempo', { tempo: speed });
      const dec = new OfflineAudioContext(buf.numberOfChannels, 1, sampleRate);
      return dec.decodeAudioData(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
    })().catch(() => null);
    stretchCache.set(key, p);
  }
  return p;
}

/** Cheap check (no decoding): does anything in the design make a sound? */
export function hasSoundSources(design: Design): boolean {
  if (design.audio.some((t) => !t.muted && t.volume > 0)) return true;
  return design.pages.some(
    (p) => !p.hidden && p.elements.some((e) => e.type === 'video' && !!e.assetId && !e.muted && !e.hidden && e.volume > 0),
  );
}

/**
 * Mix every audible source of the design into one stereo buffer that is exactly
 * as long as the design's timeline (sum of the shown pages). Returns null when
 * nothing produces sound.
 */
export async function mixSoundtrack(design: Design, sampleRate = 48000): Promise<AudioBuffer | null> {
  const total = totalDuration(design);
  if (!(total > 0)) return null;
  const length = Math.max(1, Math.ceil(total * sampleRate));
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  let sources = 0;

  // --- audio tracks -------------------------------------------------------
  for (const t of design.audio) {
    if (t.muted || !(t.volume > 0)) continue;
    const buf = await getAudioBuffer(t.assetId);
    if (!buf) continue;
    const trimStart = Math.max(0, Math.min(t.trimStart || 0, buf.duration));
    const trimEnd = Math.max(trimStart, Math.min(t.trimEnd ?? buf.duration, buf.duration));
    let offset = trimStart;
    let start = t.start || 0;
    const naturalEnd = start + (trimEnd - trimStart);
    if (start < 0) {
      offset -= start;
      start = 0;
    }
    const end = Math.min(naturalEnd, total);
    if (end - start < 0.001 || offset >= trimEnd) continue;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    const vol = Math.max(0, t.volume);
    const len = naturalEnd - (t.start || 0);
    // fades are measured on the clip itself; scale them down if they overlap
    let fi = Math.max(0, t.fadeIn || 0);
    let fo = Math.max(0, t.fadeOut || 0);
    if (fi + fo > len && fi + fo > 0) {
      const k = len / (fi + fo);
      fi *= k;
      fo *= k;
    }
    const clipStart = t.start || 0;
    gain.gain.setValueAtTime(fi > 0 ? 0 : vol, 0);
    if (fi > 0) {
      gain.gain.setValueAtTime(0, Math.max(0, clipStart));
      gain.gain.linearRampToValueAtTime(vol, Math.max(0, clipStart + fi));
    }
    if (fo > 0) {
      gain.gain.setValueAtTime(vol, Math.max(0, naturalEnd - fo));
      gain.gain.linearRampToValueAtTime(0, Math.max(0, naturalEnd));
    }
    src.connect(gain).connect(ctx.destination);
    src.start(start, offset);
    src.stop(end);
    sources++;
  }

  // --- sound of video elements -------------------------------------------
  // Same rules as the editor preview: the sound starts with the element, stops
  // where the clip ends (or loops to the element end), with volume and fades.
  for (const page of design.pages) {
    if (page.hidden) continue;
    const pageStart = pageStartTime(design, page.id);
    for (const el of page.elements) {
      if (el.type !== 'video' || !el.assetId || el.muted || el.hidden || !(el.volume > 0)) continue;
      const buf = await getAudioBuffer(el.assetId);
      if (!buf) continue; // silent video
      const speed = el.speed > 0 ? el.speed : 1;
      const trimStart = Math.max(0, Math.min(el.trimStart || 0, buf.duration));
      const trimEnd = Math.max(trimStart, Math.min(el.trimEnd ?? buf.duration, buf.duration));
      if (trimEnd - trimStart < 0.01) continue;
      const span = elementSpan(el, page.duration);
      const elStart = pageStart + span.start;
      const soundEnd = Math.min(pageStart + videoMotionEnd(el, buf.duration, page.duration), total);
      if (soundEnd - elStart < 0.001) continue;

      // speed changes keep the pitch when ffmpeg can stretch the audio
      let source: AudioBuffer = buf;
      let offset = trimStart;
      let loopStart = trimStart;
      let loopEnd = trimEnd;
      let rate = speed;
      if (Math.abs(speed - 1) > 0.001) {
        const stretched = await stretchedSegment(buf, trimStart, trimEnd, speed, sampleRate).catch(() => null);
        if (stretched) {
          source = stretched;
          offset = 0;
          loopStart = 0;
          loopEnd = stretched.duration;
          rate = 1;
        }
      }

      const src = ctx.createBufferSource();
      src.buffer = source;
      src.playbackRate.value = rate;
      if (el.loop) {
        src.loop = true;
        src.loopStart = loopStart;
        src.loopEnd = loopEnd;
      }
      const gain = ctx.createGain();
      const vol = Math.max(0, el.volume);
      const len = soundEnd - elStart;
      let fi = Math.max(0, el.fadeIn || 0);
      let fo = Math.max(0, el.fadeOut || 0);
      if (fi + fo > len) {
        const k = len / (fi + fo);
        fi *= k;
        fo *= k;
      }
      const g = gain.gain;
      g.setValueAtTime(fi > 0 ? 0 : vol, 0);
      g.setValueAtTime(fi > 0 ? 0 : vol, elStart);
      if (fi > 0) g.linearRampToValueAtTime(vol, elStart + fi);
      if (fo > 0) {
        g.setValueAtTime(vol, Math.max(elStart + fi, soundEnd - fo));
        g.linearRampToValueAtTime(0, soundEnd);
      }
      src.connect(gain).connect(ctx.destination);
      src.start(elStart, offset);
      src.stop(soundEnd);
      sources++;
    }
  }

  if (!sources) return null;
  return ctx.startRendering();
}

/** Encode an AudioBuffer as a 16-bit PCM WAV file (interleaved). */
export function audioBufferToWav(buf: AudioBuffer): Uint8Array {
  const channels = buf.numberOfChannels;
  const rate = buf.sampleRate;
  const frames = buf.length;
  const blockAlign = channels * 2;
  const dataSize = frames * blockAlign;
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i);
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, dataSize, true);

  const data = [];
  for (let c = 0; c < channels; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(o, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
      o += 2;
    }
  }
  return out;
}
