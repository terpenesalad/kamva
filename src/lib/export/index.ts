// Export orchestration: one entry point the dialog calls with the chosen
// format and options. It asks for a destination, runs the exporter and writes
// the result, then returns the path to reveal (or null if cancelled).
import type { Design } from '../../types';
import { isDesktop, platform } from '../platform';
import { saveProject } from '../project';
import { audioBufferToWav, mixSoundtrack } from './audio';
import { exportGif, type GifOptions } from './gif';
import { exportPdf, type PdfQuality } from './pdf';
import { exportRaster, type RasterFormat } from './raster';
import { exportSvg } from './svg';
import { browserWebmSupported, exportVideo, exportWebmBrowser, type VideoOptions } from './video';
import { chooseDestination, ExportFile, Progress, subDesign, throwIfAborted, writeFiles } from './common';

export * from './common';

export type ExportFormat = RasterFormat | 'pdf' | 'svg' | 'mp4' | 'webm' | 'gif' | 'audio' | 'kamva';

export type FormatGroup = 'Image' | 'Document' | 'Video' | 'Audio' | 'Project';

export const FORMATS: { id: ExportFormat; name: string; desc: string; group: FormatGroup; ext: string }[] = [
  { id: 'png', name: 'PNG', desc: 'Sharp image, supports transparency', group: 'Image', ext: 'png' },
  { id: 'jpg', name: 'JPG', desc: 'Small image file for photos and sharing', group: 'Image', ext: 'jpg' },
  { id: 'webp', name: 'WebP', desc: 'Modern web image, small with transparency', group: 'Image', ext: 'webp' },
  { id: 'svg', name: 'SVG', desc: 'Scalable vector for web and print', group: 'Image', ext: 'svg' },
  { id: 'pdf', name: 'PDF', desc: 'Document with every page in one file', group: 'Document', ext: 'pdf' },
  { id: 'mp4', name: 'MP4 video', desc: 'Video with animations, transitions and sound', group: 'Video', ext: 'mp4' },
  { id: 'webm', name: 'WebM video', desc: 'Open web video format', group: 'Video', ext: 'webm' },
  { id: 'gif', name: 'GIF', desc: 'Short looping animation', group: 'Video', ext: 'gif' },
  { id: 'audio', name: 'Audio', desc: 'Soundtrack as WAV or MP3', group: 'Audio', ext: 'wav' },
  { id: 'kamva', name: 'Kamva project', desc: 'Editable design file with all assets', group: 'Project', ext: 'kamva' },
];

export const formatInfo = (id: string) => FORMATS.find((f) => f.id === id) ?? FORMATS[0];

export interface ExportJob {
  format: ExportFormat;
  design: Design;
  baseName: string;
  /** Pages in design order */
  pageIds: string[];
  /** Raster/SVG: zip multiple files instead of writing to a folder */
  zip: boolean;
  // image
  scale: number;
  transparent: boolean;
  quality: number;
  selection?: string[];
  // pdf
  pdfQuality: PdfQuality;
  // video / gif
  video: VideoOptions;
  gif: GifOptions;
  // audio
  audioFormat: 'wav' | 'mp3';
}

export interface ExportResult {
  /** Saved path (desktop) or file name (browser download) */
  path: string;
  /** Number of files written */
  count: number;
}

/**
 * Run an export end to end. Resolves to null when the person cancels a save
 * dialog. Throws ExportCancelled when the signal aborts.
 */
export async function runExport(job: ExportJob, onProgress: Progress, signal: AbortSignal): Promise<ExportResult | null> {
  const { design, baseName, format } = job;
  switch (format) {
    case 'png':
    case 'jpg':
    case 'webp':
    case 'svg': {
      const pages = job.selection?.length ? job.pageIds.slice(0, 1) : job.pageIds;
      if (!pages.length) throw new Error('Choose at least one page to export.');
      const multi = pages.length > 1;
      const zip = !isDesktop || job.zip;
      // several files: ask for the folder / ZIP first; one file: render, then save
      const dest = multi ? await chooseDestination({ base: baseName, ext: format, typeName: formatInfo(format).name, multi, zip }) : null;
      if (multi && !dest) return null;
      throwIfAborted(signal);
      let files: ExportFile[];
      if (format === 'svg') {
        files = await exportSvg(design, pages, { baseName, transparent: job.transparent, selection: job.selection }, (f, l) => onProgress(f * 0.95, l), signal);
      } else {
        files = await exportRaster(
          design,
          pages,
          { baseName, format, scale: job.scale, transparent: job.transparent, quality: job.quality, selection: job.selection },
          (f, l) => onProgress(f * 0.95, l),
          signal,
        );
      }
      throwIfAborted(signal);
      if (!dest) {
        onProgress(0.97, 'Saving');
        const path = await platform.saveFile({
          defaultName: files[0].name,
          filters: [{ name: formatInfo(format).name, extensions: [format] }],
          data: files[0].data,
          title: 'Export',
        });
        if (!path) return null;
        onProgress(1, 'Done');
        return { path, count: 1 };
      }
      onProgress(0.97, dest.kind === 'folder' ? 'Saving files' : 'Creating ZIP');
      const path = await writeFiles(dest, files, { compress: format === 'svg' });
      onProgress(1, 'Done');
      return { path, count: files.length };
    }

    case 'pdf': {
      if (!job.pageIds.length) throw new Error('Choose at least one page to export.');
      const path = await platform.pickSavePath({ defaultName: `${baseName}.pdf`, filters: [{ name: 'PDF document', extensions: ['pdf'] }], title: 'Export PDF' });
      if (!path) return null;
      const data = await exportPdf(design, job.pageIds, { quality: job.pdfQuality, transparent: job.transparent }, onProgress, signal);
      throwIfAborted(signal);
      return { path: await platform.writeFile(path, data), count: 1 };
    }

    case 'mp4':
    case 'webm': {
      const d = subDesign(design, job.pageIds);
      const opts = { ...job.video, format };
      const info = await platform.appInfo();
      if (info.ffmpeg) {
        const path = await platform.pickSavePath({
          defaultName: `${baseName}.${format}`,
          filters: [{ name: format === 'mp4' ? 'MP4 video' : 'WebM video', extensions: [format] }],
          title: 'Export video',
        });
        if (!path) return null;
        return { path: await exportVideo(d, path, opts, onProgress, signal), count: 1 };
      }
      if (format === 'webm' && browserWebmSupported()) {
        const path = await platform.pickSavePath({ defaultName: `${baseName}.webm`, filters: [{ name: 'WebM video', extensions: ['webm'] }] });
        if (!path) return null;
        const data = await exportWebmBrowser(d, opts, onProgress, signal);
        return { path: await platform.writeFile(path, data), count: 1 };
      }
      throw new Error('MP4 export needs the Kamva desktop app. In the browser you can export WebM or GIF instead.');
    }

    case 'gif': {
      const d = subDesign(design, job.pageIds);
      const path = await platform.pickSavePath({ defaultName: `${baseName}.gif`, filters: [{ name: 'GIF animation', extensions: ['gif'] }], title: 'Export GIF' });
      if (!path) return null;
      const data = await exportGif(d, job.gif, onProgress, signal);
      throwIfAborted(signal);
      return { path: await platform.writeFile(path, data), count: 1 };
    }

    case 'audio': {
      const d = subDesign(design, job.pageIds);
      const ext = job.audioFormat;
      const path = await platform.pickSavePath({
        defaultName: `${baseName}.${ext}`,
        filters: [{ name: ext === 'mp3' ? 'MP3 audio' : 'WAV audio', extensions: [ext] }],
        title: 'Export audio',
      });
      if (!path) return null;
      onProgress(0.05, 'Mixing audio');
      const buf = await mixSoundtrack(d);
      throwIfAborted(signal);
      if (!buf) throw new Error('This design has no sound to export. Add music in the Audio panel, or unmute a video.');
      onProgress(0.6, 'Encoding WAV');
      let data = audioBufferToWav(buf);
      if (ext === 'mp3') {
        onProgress(0.75, 'Converting to MP3');
        data = await platform.transcode(data, 'wav', 'mp3');
      }
      throwIfAborted(signal);
      onProgress(1, 'Done');
      return { path: await platform.writeFile(path, data), count: 1 };
    }

    case 'kamva': {
      onProgress(0.1, 'Packing assets');
      const data = await saveProject(design);
      throwIfAborted(signal);
      const path = await platform.saveFile({ defaultName: `${baseName}.kamva`, filters: [{ name: 'Kamva design', extensions: ['kamva'] }], data, title: 'Export project' });
      if (!path) return null;
      onProgress(1, 'Done');
      return { path, count: 1 };
    }
  }
}
