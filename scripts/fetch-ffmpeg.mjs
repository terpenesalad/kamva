// Downloads the static FFmpeg build for a platform into resources/ffmpeg/
// Usage: node scripts/fetch-ffmpeg.mjs [win32|darwin|linux] [x64|arm64]
import { createWriteStream, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';

const TAG = 'b6.1.1';
const platform = process.argv[2] || process.platform;
const arch = process.argv[3] || process.arch;
const exe = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const out = `resources/ffmpeg/${exe}`;
mkdirSync('resources/ffmpeg', { recursive: true });
if (existsSync(out) && !process.argv.includes('--force')) {
  console.log(`${out} already exists`);
  process.exit(0);
}
const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${TAG}/ffmpeg-${platform}-${arch}.gz`;
console.log(`Downloading ${url}`);
const res = await fetch(url);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
await pipeline(Readable.fromWeb(res.body), createGunzip(), createWriteStream(out));
if (platform !== 'win32') chmodSync(out, 0o755);
console.log(`Saved ${out}`);
