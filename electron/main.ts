import { app, BrowserWindow, dialog, ipcMain, Menu, shell, session, nativeTheme } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const isDev = !!process.env.KAMVA_DEV_URL;
let mainWindow: BrowserWindow | null = null;
let pendingOpenPath: string | null = null;
let forceClose = false;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const userDir = () => app.getPath('userData');
const autosaveDir = () => path.join(userDir(), 'designs');
const recentFile = () => path.join(userDir(), 'recent.json');

function ffmpegPath(): string | null {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const candidates = [
    path.join(process.resourcesPath || '', 'ffmpeg', exe),
    path.join(__dirname, '..', 'resources', 'ffmpeg', exe),
  ];
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const p = require('ffmpeg-static') as string | null;
    if (p) candidates.push(p.replace('app.asar', 'app.asar.unpacked'));
  } catch {
    /* not available */
  }
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'Kamva',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16161d' : '#f4f4f7',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.loadURL(process.env.KAMVA_DEV_URL!);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (forceClose || !mainWindow) return;
    e.preventDefault();
    mainWindow.webContents.send('app:request-close');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function send(channel: string, ...args: unknown[]) {
  mainWindow?.webContents.send(channel, ...args);
}

function buildMenu() {
  const cmd = (id: string) => () => send('menu:command', id);
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Design…', accelerator: 'CmdOrCtrl+N', click: cmd('new') },
        { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: cmd('home') },
        { type: 'separator' },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: cmd('open') },
        { label: 'Import Files…', accelerator: 'CmdOrCtrl+I', click: cmd('import') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: cmd('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: cmd('saveAs') },
        { label: 'Save as Template', click: cmd('saveTemplate') },
        { type: 'separator' },
        { label: 'Export…', accelerator: 'CmdOrCtrl+E', click: cmd('export') },
        { label: 'Resize Design…', accelerator: 'CmdOrCtrl+R', click: cmd('resize') },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: cmd('settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: cmd('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: cmd('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', click: cmd('duplicate') },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: cmd('selectAll') },
        { type: 'separator' },
        { label: 'Group', accelerator: 'CmdOrCtrl+G', click: cmd('group') },
        { label: 'Ungroup', accelerator: 'CmdOrCtrl+Shift+G', click: cmd('ungroup') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: cmd('zoomIn') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: cmd('zoomOut') },
        { label: 'Fit to Screen', accelerator: 'CmdOrCtrl+0', click: cmd('zoomFit') },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+1', click: cmd('zoom100') },
        { type: 'separator' },
        { label: 'Toggle Rulers', accelerator: 'CmdOrCtrl+Shift+R', click: cmd('toggleRulers') },
        { label: 'Toggle Grid', accelerator: "CmdOrCtrl+'", click: cmd('toggleGrid') },
        { label: 'Toggle Timeline', accelerator: 'CmdOrCtrl+Shift+T', click: cmd('toggleTimeline') },
        { type: 'separator' },
        { label: 'Present', accelerator: 'CmdOrCtrl+Alt+P', click: cmd('present') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ role: 'toggleDevTools' as const }, { role: 'reload' as const }] : [{ role: 'toggleDevTools' as const }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: cmd('shortcuts') },
        { label: 'About Kamva', click: cmd('about') },
        { label: 'Kamva on GitHub', click: () => shell.openExternal('https://github.com/terpenesalad/kamva') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function readRecent(): Promise<string[]> {
  try {
    const raw = await fsp.readFile(recentFile(), 'utf8');
    const list = JSON.parse(raw) as string[];
    return list.filter((p) => fs.existsSync(p));
  } catch {
    return [];
  }
}

async function addRecent(p: string) {
  const list = (await readRecent()).filter((x) => x !== p);
  list.unshift(p);
  await fsp.mkdir(userDir(), { recursive: true });
  await fsp.writeFile(recentFile(), JSON.stringify(list.slice(0, 20)));
  if (process.platform !== 'linux') app.addRecentDocument(p);
}

function toBuffer(data: ArrayBuffer | Uint8Array | string): Buffer {
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(new Uint8Array(data));
}

function mimeFor(file: string): string {
  const ext = path.extname(file).toLowerCase().slice(1);
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/opus',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
    pdf: 'application/pdf', kamva: 'application/x-kamva', json: 'application/json',
  };
  return map[ext] || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// IPC: files
// ---------------------------------------------------------------------------
type Filter = { name: string; extensions: string[] };

// Automated end-to-end tests set KAMVA_E2E_DIR so native dialogs answer themselves.
const E2E_DIR = process.env.KAMVA_E2E_DIR;
if (E2E_DIR) {
  (dialog as any).showSaveDialog = async (_w: unknown, o: Electron.SaveDialogOptions) => ({
    canceled: false,
    filePath: path.join(E2E_DIR, path.basename(o.defaultPath || 'out')),
  });
  (dialog as any).showOpenDialog = async (_w: unknown, o: Electron.OpenDialogOptions) =>
    o.properties?.includes('openDirectory') ? { canceled: false, filePaths: [E2E_DIR] } : { canceled: true, filePaths: [] };
}

ipcMain.handle('dialog:open', async (_e, opts: { filters?: Filter[]; multi?: boolean; title?: string }) => {
  if (!mainWindow) return [];
  const res = await dialog.showOpenDialog(mainWindow, {
    title: opts?.title,
    properties: opts?.multi ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: opts?.filters,
  });
  if (res.canceled) return [];
  const out = [];
  for (const p of res.filePaths) {
    const data = await fsp.readFile(p);
    out.push({ path: p, name: path.basename(p), mime: mimeFor(p), data: new Uint8Array(data) });
  }
  return out;
});

ipcMain.handle('file:read', async (_e, p: string) => {
  const data = await fsp.readFile(p);
  return { path: p, name: path.basename(p), mime: mimeFor(p), data: new Uint8Array(data) };
});

ipcMain.handle('dialog:save', async (_e, opts: { defaultName: string; filters?: Filter[]; data: Uint8Array | string; title?: string }) => {
  if (!mainWindow) return null;
  const res = await dialog.showSaveDialog(mainWindow, {
    title: opts.title,
    defaultPath: path.join(app.getPath('documents'), opts.defaultName),
    filters: opts.filters,
  });
  if (res.canceled || !res.filePath) return null;
  await fsp.writeFile(res.filePath, toBuffer(opts.data));
  if (res.filePath.endsWith('.kamva')) await addRecent(res.filePath);
  return res.filePath;
});

ipcMain.handle('dialog:savePath', async (_e, opts: { defaultName: string; filters?: Filter[]; title?: string }) => {
  if (!mainWindow) return null;
  const res = await dialog.showSaveDialog(mainWindow, {
    title: opts.title,
    defaultPath: path.join(app.getPath('documents'), opts.defaultName),
    filters: opts.filters,
  });
  return res.canceled || !res.filePath ? null : res.filePath;
});

ipcMain.handle('dialog:folder', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('file:write', async (_e, p: string, data: Uint8Array | string) => {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, toBuffer(data));
  if (p.endsWith('.kamva')) await addRecent(p);
  return p;
});

ipcMain.handle('file:reveal', (_e, p: string) => shell.showItemInFolder(p));
ipcMain.handle('file:openExternal', (_e, url: string) => shell.openExternal(url));

ipcMain.handle('recent:list', async () => {
  const list = await readRecent();
  return Promise.all(
    list.map(async (p) => {
      const st = await fsp.stat(p);
      return { path: p, name: path.basename(p, '.kamva'), modified: st.mtimeMs };
    }),
  );
});
ipcMain.handle('recent:remove', async (_e, p: string) => {
  const list = (await readRecent()).filter((x) => x !== p);
  await fsp.writeFile(recentFile(), JSON.stringify(list));
});

// Autosaved designs live in userData/designs/<id>.kamva with a <id>.png thumbnail
ipcMain.handle('library:save', async (_e, id: string, data: Uint8Array, thumb: Uint8Array | null, meta: unknown) => {
  await fsp.mkdir(autosaveDir(), { recursive: true });
  await fsp.writeFile(path.join(autosaveDir(), `${id}.kamva`), toBuffer(data));
  if (thumb) await fsp.writeFile(path.join(autosaveDir(), `${id}.png`), toBuffer(thumb));
  await fsp.writeFile(path.join(autosaveDir(), `${id}.json`), JSON.stringify(meta));
  return true;
});
ipcMain.handle('library:list', async () => {
  try {
    const files = await fsp.readdir(autosaveDir());
    const items = [];
    for (const f of files.filter((x) => x.endsWith('.json'))) {
      try {
        const meta = JSON.parse(await fsp.readFile(path.join(autosaveDir(), f), 'utf8'));
        const id = f.replace(/\.json$/, '');
        const thumbPath = path.join(autosaveDir(), `${id}.png`);
        let thumb: string | null = null;
        if (fs.existsSync(thumbPath)) thumb = 'data:image/png;base64,' + (await fsp.readFile(thumbPath)).toString('base64');
        items.push({ ...meta, id, thumb });
      } catch {
        /* skip broken */
      }
    }
    return items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return [];
  }
});
ipcMain.handle('library:load', async (_e, id: string) => {
  const data = await fsp.readFile(path.join(autosaveDir(), `${id}.kamva`));
  return new Uint8Array(data);
});
ipcMain.handle('library:delete', async (_e, id: string) => {
  for (const ext of ['kamva', 'png', 'json']) {
    await fsp.rm(path.join(autosaveDir(), `${id}.${ext}`), { force: true });
  }
  return true;
});

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  ffmpeg: !!ffmpegPath(),
  userData: userDir(),
}));

ipcMain.handle('app:pendingOpen', () => {
  const p = pendingOpenPath;
  pendingOpenPath = null;
  return p;
});

ipcMain.on('app:close-confirmed', () => {
  forceClose = true;
  mainWindow?.close();
});

ipcMain.on('app:title', (_e, title: string) => {
  mainWindow?.setTitle(title);
});

ipcMain.on('app:fullscreen', (_e, on: boolean) => {
  mainWindow?.setFullScreen(on);
});

// ---------------------------------------------------------------------------
// IPC: ffmpeg (video/audio encoding)
// ---------------------------------------------------------------------------
type EncodeJob = { proc: ChildProcessWithoutNullStreams; stderr: string; done: Promise<number>; tmp: string[] };
const jobs = new Map<string, EncodeJob>();

ipcMain.handle(
  'ffmpeg:start',
  async (
    _e,
    id: string,
    opts: { out: string; width: number; height: number; fps: number; format: 'mp4' | 'webm' | 'gif' | 'mov'; quality: number; audio?: Uint8Array | null },
  ) => {
    const bin = ffmpegPath();
    if (!bin) throw new Error('ffmpeg is not available in this build.');
    const tmp: string[] = [];
    const args = ['-y', '-f', 'image2pipe', '-framerate', String(opts.fps), '-c:v', 'mjpeg', '-i', '-'];
    if (opts.audio && opts.audio.byteLength > 44) {
      const wav = path.join(os.tmpdir(), `kamva-${id}.wav`);
      await fsp.writeFile(wav, toBuffer(opts.audio));
      tmp.push(wav);
      args.push('-i', wav);
    }
    const hasAudio = tmp.length > 0;
    const crf = Math.round(35 - opts.quality * 17); // quality 0..1 -> crf 35..18
    if (opts.format === 'mp4' || opts.format === 'mov') {
      args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
      args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
      if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
    } else if (opts.format === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-crf', String(crf + 8), '-b:v', '0', '-pix_fmt', 'yuv420p', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4');
      if (hasAudio) args.push('-c:a', 'libopus', '-b:a', '160k', '-shortest');
    }
    args.push(opts.out);
    const proc = spawn(bin, args, { windowsHide: true });
    const job: EncodeJob = {
      proc,
      stderr: '',
      tmp,
      done: new Promise((resolve) => proc.on('close', (code) => resolve(code ?? 1))),
    };
    proc.stderr.on('data', (d) => {
      job.stderr = (job.stderr + d.toString()).slice(-8000);
    });
    proc.stdin.on('error', () => {
      /* handled via exit code */
    });
    jobs.set(id, job);
    return true;
  },
);

ipcMain.handle('ffmpeg:frame', async (_e, id: string, frame: Uint8Array) => {
  const job = jobs.get(id);
  if (!job) throw new Error('No encode job');
  const ok = job.proc.stdin.write(toBuffer(frame));
  if (!ok) await new Promise<void>((r) => job.proc.stdin.once('drain', () => r()));
  return true;
});

ipcMain.handle('ffmpeg:finish', async (_e, id: string) => {
  const job = jobs.get(id);
  if (!job) throw new Error('No encode job');
  job.proc.stdin.end();
  const code = await job.done;
  jobs.delete(id);
  for (const t of job.tmp) await fsp.rm(t, { force: true });
  if (code !== 0) throw new Error('Encoding failed:\n' + job.stderr.split('\n').slice(-12).join('\n'));
  return true;
});

ipcMain.handle('ffmpeg:cancel', async (_e, id: string) => {
  const job = jobs.get(id);
  if (!job) return;
  job.proc.kill('SIGKILL');
  jobs.delete(id);
  for (const t of job.tmp) await fsp.rm(t, { force: true });
});

// Convert arbitrary audio/video into something Chromium can play (used on import
// for formats like .mov/.mkv/.avi/.flac that the browser engine can't decode) and
// encode WAV to MP3 for audio export.
ipcMain.handle('ffmpeg:transcode', async (_e, input: Uint8Array, inExt: string, kind: 'video' | 'audio' | 'mp3') => {
  const bin = ffmpegPath();
  if (!bin) throw new Error('ffmpeg is not available in this build.');
  const id = Math.random().toString(36).slice(2);
  const inPath = path.join(os.tmpdir(), `kamva-in-${id}.${inExt.replace(/[^a-z0-9]/gi, '')}`);
  const outExt = kind === 'video' ? 'mp4' : kind === 'mp3' ? 'mp3' : 'm4a';
  const outPath = path.join(os.tmpdir(), `kamva-out-${id}.${outExt}`);
  await fsp.writeFile(inPath, toBuffer(input));
  const args =
    kind === 'video'
      ? ['-y', '-i', inPath, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outPath]
      : kind === 'mp3'
        ? ['-y', '-i', inPath, '-c:a', 'libmp3lame', '-b:a', '256k', outPath]
        : ['-y', '-i', inPath, '-vn', '-c:a', 'aac', '-b:a', '256k', outPath];
  const code: number = await new Promise((resolve) => {
    const p = spawn(bin, args, { windowsHide: true });
    p.on('close', (c) => resolve(c ?? 1));
  });
  try {
    if (code !== 0) throw new Error('Could not convert this file.');
    const data = await fsp.readFile(outPath);
    return new Uint8Array(data);
  } finally {
    await fsp.rm(inPath, { force: true });
    await fsp.rm(outPath, { force: true });
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
function fileFromArgv(argv: string[]): string | null {
  const f = argv.slice(1).find((a) => /\.kamva$/i.test(a) && fs.existsSync(a));
  return f || null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const f = fileFromArgv(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (f) send('app:open-file', f);
    }
  });

  app.on('open-file', (e, p) => {
    e.preventDefault();
    if (mainWindow) send('app:open-file', p);
    else pendingOpenPath = p;
  });

  app.whenReady().then(() => {
    pendingOpenPath = pendingOpenPath || fileFromArgv(process.argv);
    // Allow microphone (voice-over recording), clipboard and local fonts
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(['media', 'clipboard-read', 'clipboard-sanitized-write', 'local-fonts', 'fullscreen'].includes(permission));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
      ['media', 'clipboard-read', 'clipboard-sanitized-write', 'local-fonts', 'fullscreen'].includes(permission),
    );
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
