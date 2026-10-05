// Typed access to the Electron preload bridge, with browser fallbacks so the
// renderer can also run standalone (useful for development and testing).

type Filter = { name: string; extensions: string[] };
export type OpenedFile = { path: string; name: string; mime: string; data: Uint8Array };

interface Bridge {
  openFiles(opts: { filters?: Filter[]; multi?: boolean; title?: string }): Promise<OpenedFile[]>;
  readFile(p: string): Promise<OpenedFile>;
  saveFile(opts: { defaultName: string; filters?: Filter[]; data: Uint8Array | string; title?: string }): Promise<string | null>;
  pickSavePath(opts: { defaultName: string; filters?: Filter[]; title?: string }): Promise<string | null>;
  pickFolder(): Promise<string | null>;
  writeFile(p: string, data: Uint8Array | string): Promise<string>;
  reveal(p: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  recentList(): Promise<{ path: string; name: string; modified: number }[]>;
  recentRemove(p: string): Promise<void>;
  librarySave(id: string, data: Uint8Array, thumb: Uint8Array | null, meta: unknown): Promise<boolean>;
  libraryList(): Promise<any[]>;
  libraryLoad(id: string): Promise<Uint8Array>;
  libraryDelete(id: string): Promise<boolean>;
  appInfo(): Promise<{ version: string; platform: string; ffmpeg: boolean; userData: string }>;
  pendingOpen(): Promise<string | null>;
  setTitle(t: string): void;
  setFullscreen(on: boolean): void;
  confirmClose(): void;
  ffmpegStart(id: string, opts: unknown): Promise<boolean>;
  ffmpegFrame(id: string, frame: Uint8Array): Promise<boolean>;
  ffmpegFinish(id: string): Promise<boolean>;
  ffmpegCancel(id: string): Promise<void>;
  transcode(input: Uint8Array, ext: string, kind: 'video' | 'audio' | 'mp3'): Promise<Uint8Array>;
  onMenu(cb: (cmd: string) => void): () => void;
  onOpenFile(cb: (p: string) => void): () => void;
  onRequestClose(cb: () => void): () => void;
}

const native = (window as any).kamva as Bridge | undefined;
export const isDesktop = !!native;

// ---------------------------------------------------------------------------
// Browser fallbacks
// ---------------------------------------------------------------------------
function pickFiles(filters?: Filter[], multi?: boolean): Promise<OpenedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = !!multi;
    if (filters?.length) input.accept = filters.flatMap((f) => f.extensions.map((e) => (e === '*' ? '*' : '.' + e))).join(',');
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      resolve(
        await Promise.all(
          files.map(async (f) => ({ path: f.name, name: f.name, mime: f.type, data: new Uint8Array(await f.arrayBuffer()) })),
        ),
      );
    };
    input.click();
  });
}

function download(name: string, data: Uint8Array | string) {
  const blob = new Blob([data as BlobPart]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return name;
}

const LIB_KEY = 'kamva-browser-library';

const fallback: Bridge = {
  openFiles: (o) => pickFiles(o.filters, o.multi),
  readFile: async () => {
    throw new Error('Not available');
  },
  saveFile: async (o) => download(o.defaultName, o.data),
  pickSavePath: async (o) => o.defaultName,
  pickFolder: async () => null,
  writeFile: async (p, d) => download(p.split(/[\\/]/).pop() || p, d),
  reveal: async () => undefined,
  openExternal: async (u) => void window.open(u, '_blank'),
  recentList: async () => [],
  recentRemove: async () => undefined,
  librarySave: async (id, _d, _t, meta) => {
    const lib = JSON.parse(localStorage.getItem(LIB_KEY) || '{}');
    lib[id] = meta;
    localStorage.setItem(LIB_KEY, JSON.stringify(lib));
    return true;
  },
  libraryList: async () => Object.entries(JSON.parse(localStorage.getItem(LIB_KEY) || '{}')).map(([id, m]: any) => ({ ...m, id })),
  libraryLoad: async () => {
    throw new Error('Not available in browser mode');
  },
  libraryDelete: async (id) => {
    const lib = JSON.parse(localStorage.getItem(LIB_KEY) || '{}');
    delete lib[id];
    localStorage.setItem(LIB_KEY, JSON.stringify(lib));
    return true;
  },
  appInfo: async () => ({ version: '1.0.0', platform: 'web', ffmpeg: false, userData: '' }),
  pendingOpen: async () => null,
  setTitle: (t) => void (document.title = t),
  setFullscreen: (on) => void (on ? document.documentElement.requestFullscreen?.() : document.exitFullscreen?.()),
  confirmClose: () => undefined,
  ffmpegStart: async () => {
    throw new Error('Video encoding requires the desktop app');
  },
  ffmpegFrame: async () => false,
  ffmpegFinish: async () => false,
  ffmpegCancel: async () => undefined,
  transcode: async () => {
    throw new Error('Conversion requires the desktop app');
  },
  onMenu: () => () => undefined,
  onOpenFile: () => () => undefined,
  onRequestClose: () => () => undefined,
};

export const platform: Bridge = native || fallback;

export const FILTERS = {
  project: [{ name: 'Kamva design', extensions: ['kamva'] }],
  images: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif'] }],
  video: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi'] }],
  audio: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'] }],
  fonts: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
  pdf: [{ name: 'PDF', extensions: ['pdf'] }],
  all: [
    {
      name: 'All supported',
      extensions: [
        'kamva', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif', 'mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi',
        'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'ttf', 'otf', 'woff', 'woff2', 'pdf',
      ],
    },
  ],
};
