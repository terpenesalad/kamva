import { create } from 'zustand';
import { useEditor } from '../../store/editor';
import { useUI } from '../../store/ui';
import { recordToAsset } from '../../lib/actions';
import { getAsset, sharedAudioContext } from '../../lib/assets';

// ---------------------------------------------------------------------------
// Voice-over recording. Kept in a module-level store so a recording survives
// collapsing or expanding the timeline.
// ---------------------------------------------------------------------------

interface RecState {
  recording: boolean;
  /** performance.now() when recording began */
  startedAt: number;
  /** playhead time when recording began */
  timelineStart: number;
  /** lane the take will land on (for the live preview) */
  lane: number;
  elapsed: number;
}

export const useRecorder = create<RecState>(() => ({ recording: false, startedAt: 0, timelineStart: 0, lane: 0, elapsed: 0 }));

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let timer = 0;

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export async function startVoiceOver() {
  if (useRecorder.getState().recording || recorder) return;
  const toast = useUI.getState().toast;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    toast('Voice-over recording is not available here. Check that a microphone is connected.', 'error', 5000);
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    toast("Couldn't access the microphone. Allow microphone access for Kamva in your system settings, then try again.", 'error', 6000);
    return;
  }
  const mime = pickMime();
  try {
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    toast("Couldn't start recording. Try a different microphone.", 'error');
    return;
  }
  chunks = [];
  const t0 = useUI.getState().time;
  const startedAt = performance.now();
  const d = useEditor.getState().design;
  const lanes = d?.audio.map((t) => t.lane) ?? [];
  const lane = lanes.length ? Math.max(...lanes) + 1 : 0;
  const rec = recorder;
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.onstop = () => {
    const parts = chunks;
    chunks = [];
    void finish(parts, t0, rec.mimeType || mime || 'audio/webm', (performance.now() - startedAt) / 1000);
  };
  rec.start(250);
  useRecorder.setState({ recording: true, startedAt, timelineStart: t0, lane, elapsed: 0 });
  clearInterval(timer);
  timer = window.setInterval(() => useRecorder.setState({ elapsed: (performance.now() - startedAt) / 1000 }), 100);
}

export function stopVoiceOver() {
  clearInterval(timer);
  const rec = recorder;
  recorder = null;
  if (rec && rec.state !== 'inactive') rec.stop();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  useRecorder.setState({ recording: false });
}

async function finish(parts: Blob[], t0: number, mime: string, elapsed: number) {
  const toast = useUI.getState().toast;
  const type = mime.split(';')[0] || 'audio/webm';
  const blob = new Blob(parts, { type });
  if (blob.size < 200 || elapsed < 0.2) {
    toast('Nothing was recorded. Hold the recording a little longer and try again.', 'info');
    return;
  }
  // MediaRecorder output has no duration header, so decode it to measure the take
  let duration = elapsed;
  try {
    const buf = await sharedAudioContext().decodeAudioData(await blob.arrayBuffer());
    if (buf.duration > 0) duration = buf.duration;
  } catch {
    /* keep the measured duration */
  }
  const st = useEditor.getState();
  const d = st.design;
  if (!d) return;
  const n = d.audio.filter((a) => /^Voice-over \d+/.test(a.name)).length + 1;
  const ext = type.includes('ogg') ? 'ogg' : 'webm';
  const before = new Set(d.audio.map((a) => a.id));
  try {
    await recordToAsset(blob, `Voice-over ${n}.${ext}`);
  } catch (e) {
    toast(`Couldn't save the voice-over: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return;
  }
  const added = useEditor.getState().design?.audio.find((a) => !before.has(a.id));
  if (!added) return;
  const asset = getAsset(added.assetId);
  if (asset && !(asset.meta.duration && isFinite(asset.meta.duration))) asset.meta.duration = duration;
  // fold the move into the "add" undo step
  useEditor.getState().update(
    (dd) => {
      const t = dd.audio.find((x) => x.id === added.id);
      if (t) t.start = Math.round(t0 * 100) / 100;
      const m = dd.assets[added.assetId];
      if (m && !(m.duration && isFinite(m.duration))) dd.assets[added.assetId] = { ...m, duration };
    },
    { history: false },
  );
}
