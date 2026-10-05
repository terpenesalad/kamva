import { contextBridge, ipcRenderer } from 'electron';

type Filter = { name: string; extensions: string[] };
export type OpenedFile = { path: string; name: string; mime: string; data: Uint8Array };

const api = {
  openFiles: (opts: { filters?: Filter[]; multi?: boolean; title?: string }): Promise<OpenedFile[]> =>
    ipcRenderer.invoke('dialog:open', opts),
  readFile: (p: string): Promise<OpenedFile> => ipcRenderer.invoke('file:read', p),
  saveFile: (opts: { defaultName: string; filters?: Filter[]; data: Uint8Array | string; title?: string }): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save', opts),
  pickSavePath: (opts: { defaultName: string; filters?: Filter[]; title?: string }): Promise<string | null> =>
    ipcRenderer.invoke('dialog:savePath', opts),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:folder'),
  writeFile: (p: string, data: Uint8Array | string): Promise<string> => ipcRenderer.invoke('file:write', p, data),
  reveal: (p: string) => ipcRenderer.invoke('file:reveal', p),
  openExternal: (url: string) => ipcRenderer.invoke('file:openExternal', url),

  recentList: (): Promise<{ path: string; name: string; modified: number }[]> => ipcRenderer.invoke('recent:list'),
  recentRemove: (p: string) => ipcRenderer.invoke('recent:remove', p),

  librarySave: (id: string, data: Uint8Array, thumb: Uint8Array | null, meta: unknown) =>
    ipcRenderer.invoke('library:save', id, data, thumb, meta),
  libraryList: (): Promise<any[]> => ipcRenderer.invoke('library:list'),
  libraryLoad: (id: string): Promise<Uint8Array> => ipcRenderer.invoke('library:load', id),
  libraryDelete: (id: string) => ipcRenderer.invoke('library:delete', id),

  appInfo: (): Promise<{ version: string; platform: string; ffmpeg: boolean; userData: string }> => ipcRenderer.invoke('app:info'),
  pendingOpen: (): Promise<string | null> => ipcRenderer.invoke('app:pendingOpen'),
  setTitle: (t: string) => ipcRenderer.send('app:title', t),
  setFullscreen: (on: boolean) => ipcRenderer.send('app:fullscreen', on),
  confirmClose: () => ipcRenderer.send('app:close-confirmed'),

  ffmpegStart: (id: string, opts: unknown) => ipcRenderer.invoke('ffmpeg:start', id, opts),
  ffmpegFrame: (id: string, frame: Uint8Array) => ipcRenderer.invoke('ffmpeg:frame', id, frame),
  ffmpegFinish: (id: string) => ipcRenderer.invoke('ffmpeg:finish', id),
  ffmpegCancel: (id: string) => ipcRenderer.invoke('ffmpeg:cancel', id),
  transcode: (input: Uint8Array, ext: string, kind: 'video' | 'audio' | 'mp3'): Promise<Uint8Array> =>
    ipcRenderer.invoke('ffmpeg:transcode', input, ext, kind),

  onMenu: (cb: (cmd: string) => void) => {
    const h = (_e: unknown, c: string) => cb(c);
    ipcRenderer.on('menu:command', h);
    return () => ipcRenderer.removeListener('menu:command', h);
  },
  onOpenFile: (cb: (p: string) => void) => {
    const h = (_e: unknown, p: string) => cb(p);
    ipcRenderer.on('app:open-file', h);
    return () => ipcRenderer.removeListener('app:open-file', h);
  },
  onRequestClose: (cb: () => void) => {
    const h = () => cb();
    ipcRenderer.on('app:request-close', h);
    return () => ipcRenderer.removeListener('app:request-close', h);
  },
};

export type KamvaAPI = typeof api;
contextBridge.exposeInMainWorld('kamva', api);
