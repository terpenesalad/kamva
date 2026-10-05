// MP4 / WebM export. Frames are rendered here and streamed as JPEGs to ffmpeg
// in the Electron main process (image2pipe/mjpeg on stdin), together with the
// mixed soundtrack as a WAV file. In the browser, WebM is recorded with
// MediaRecorder instead (real time).
import type { Design } from '../../types';
import { platform } from '../platform';
import { audioBufferToWav, mixSoundtrack } from './audio';
import { evenSize, frameCount, renderTimeline, timelineDuration } from './timeline';
import { ExportCancelled, isAbort, Progress, throwIfAborted, tick } from './common';

export type VideoFormat = 'mp4' | 'webm';
export type VideoResolution = '720p' | '1080p' | '4k' | '1x' | '2x';

export const RESOLUTIONS: { id: VideoResolution; label: string }[] = [
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p' },
  { id: '4k', label: '4K' },
  { id: '1x', label: '1×' },
  { id: '2x', label: '2×' },
];

/** Output size: the short side matches 720/1080/2160 (or 1×/2× the design), even, aspect kept */
export function videoSize(design: Design, res: VideoResolution) {
  const w = design.width;
  const h = design.height;
  let k: number;
  switch (res) {
    case '720p':
      k = 720 / Math.min(w, h);
      break;
    case '1080p':
      k = 1080 / Math.min(w, h);
      break;
    case '4k':
      k = 2160 / Math.min(w, h);
      break;
    case '2x':
      k = 2;
      break;
    default:
      k = 1;
  }
  // stay inside what H.264 / VP9 encoders accept
  k = Math.min(k, 8192 / Math.max(w, h));
  return evenSize(w * k, h * k);
}

export interface VideoOptions {
  format: VideoFormat;
  fps: number;
  resolution: VideoResolution;
  /** 0..1 */
  quality: number;
}

const fmtTime = (s: number) => {
  if (!isFinite(s) || s < 0) return '';
  if (s < 60) return `${Math.max(1, Math.round(s))} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s % 60)} s`;
};

/** "Frame 12 of 300 · about 40 s left" */
function frameLabel(i: number, total: number, started: number) {
  const done = i + 1;
  const elapsed = (performance.now() - started) / 1000;
  const left = done > 3 ? (elapsed / done) * (total - done) : NaN;
  const eta = fmtTime(left);
  return `Frame ${done} of ${total}` + (eta ? ` · about ${eta} left` : '');
}

/** Reject as soon as the signal aborts, whatever the promise does */
function abortable<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(new ExportCancelled());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ExportCancelled());
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/**
 * Desktop export through ffmpeg. `outPath` comes from platform.pickSavePath.
 * Returns the written path.
 */
export async function exportVideo(design: Design, outPath: string, opts: VideoOptions, onProgress: Progress, signal?: AbortSignal): Promise<string> {
  const info = await platform.appInfo();
  if (!info.ffmpeg) throw new Error('Video encoding needs ffmpeg, which is missing from this build. Reinstall Kamva to restore it.');
  if (!(timelineDuration(design) > 0)) throw new Error('There are no visible pages to export. Show a page or give it a duration, then try again.');
  const { width, height } = videoSize(design, opts.resolution);
  const fps = opts.fps;
  const total = frameCount(design, fps);

  onProgress(0, 'Mixing audio');
  await tick();
  let audio: Uint8Array | null = null;
  try {
    const buf = await mixSoundtrack(design);
    if (buf) audio = audioBufferToWav(buf);
  } catch (e) {
    console.warn('Audio mix failed; exporting without sound', e);
  }
  throwIfAborted(signal);

  const jobId = 'v' + Math.random().toString(36).slice(2, 10);
  await platform.ffmpegStart(jobId, { out: outPath, width, height, fps, format: opts.format, quality: opts.quality, audio });
  let started = false;
  const onAbort = () => void platform.ffmpegCancel(jobId);
  signal?.addEventListener('abort', onAbort);
  try {
    started = true;
    const t0 = performance.now();
    await renderTimeline(
      design,
      { width, height, fps, background: '#000000' },
      async ({ index, canvas }) => {
        const blob = await new Promise<Blob>((res, rej) =>
          canvas.toBlob((b) => (b ? res(b) : rej(new Error('A frame could not be encoded. Try a lower resolution.'))), 'image/jpeg', 0.92),
        );
        throwIfAborted(signal);
        // a killed ffmpeg never drains stdin, so don't wait on it once cancelled
        await abortable(platform.ffmpegFrame(jobId, new Uint8Array(await blob.arrayBuffer())), signal);
        onProgress(((index + 1) / total) * 0.97, frameLabel(index, total, t0));
      },
      signal,
    );
    throwIfAborted(signal);
    onProgress(0.98, 'Finishing the video file');
    await platform.ffmpegFinish(jobId);
    started = false;
    onProgress(1, 'Done');
    return outPath;
  } catch (e) {
    if (started) await platform.ffmpegCancel(jobId).catch(() => undefined);
    if (isAbort(e) || signal?.aborted) throw new ExportCancelled();
    throw e;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

// ---------------------------------------------------------------------------
// Browser fallback: WebM via MediaRecorder (renders in real time)
// ---------------------------------------------------------------------------
export function browserWebmSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    (MediaRecorder.isTypeSupported?.('video/webm;codecs=vp9') || MediaRecorder.isTypeSupported?.('video/webm'))
  );
}

/**
 * Record WebM in the browser. Frames are rendered ahead, then played back in
 * real time into a canvas stream with the soundtrack, so the output keeps time.
 */
export async function exportWebmBrowser(design: Design, opts: VideoOptions, onProgress: Progress, signal?: AbortSignal): Promise<Uint8Array> {
  if (!browserWebmSupported()) throw new Error('This browser cannot record video. Use the Kamva desktop app to export videos.');
  const { width, height } = videoSize(design, opts.resolution);
  // keep memory sensible: frames are held as JPEG blobs
  const fps = Math.min(opts.fps, 30);
  const total = frameCount(design, fps);
  const frames: Blob[] = [];
  const t0 = performance.now();
  await renderTimeline(
    design,
    { width, height, fps, background: '#000000' },
    async ({ index, canvas }) => {
      frames.push(await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Encoding failed'))), 'image/jpeg', 0.92)));
      onProgress(((index + 1) / total) * 0.5, 'Rendering · ' + frameLabel(index, total, t0));
    },
    signal,
  );
  throwIfAborted(signal);

  onProgress(0.5, 'Mixing audio');
  const audioBuf = await mixSoundtrack(design).catch(() => null);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  const stream = canvas.captureStream(fps);
  let actx: AudioContext | null = null;
  let asrc: AudioBufferSourceNode | null = null;
  if (audioBuf) {
    actx = new AudioContext({ sampleRate: audioBuf.sampleRate });
    const dest = actx.createMediaStreamDestination();
    asrc = actx.createBufferSource();
    asrc.buffer = audioBuf;
    asrc.connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  }
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
  const bitrate = Math.round(width * height * fps * (0.08 + opts.quality * 0.14));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));

  // decode a few frames ahead so playback doesn't stall
  const decode = (i: number) => createImageBitmap(frames[i]);
  let ahead: Promise<ImageBitmap> | null = frames.length ? decode(0) : null;
  rec.start(1000);
  if (actx && asrc) {
    await actx.resume();
    asrc.start();
  }
  const start = performance.now();
  try {
    for (let i = 0; i < frames.length; i++) {
      if (signal?.aborted) break;
      const bmp = await ahead!;
      ahead = i + 1 < frames.length ? decode(i + 1) : null;
      const due = start + (i * 1000) / fps;
      const wait = due - performance.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      ctx.drawImage(bmp, 0, 0, width, height);
      bmp.close();
      onProgress(0.5 + ((i + 1) / frames.length) * 0.5, `Recording · frame ${i + 1} of ${frames.length}`);
    }
    // hold the last frame for one frame duration
    await new Promise((r) => setTimeout(r, 1000 / fps));
  } finally {
    rec.stop();
    try {
      asrc?.stop();
    } catch {
      /* never started */
    }
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    await actx?.close();
  }
  throwIfAborted(signal);
  onProgress(1, 'Done');
  return new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
}
